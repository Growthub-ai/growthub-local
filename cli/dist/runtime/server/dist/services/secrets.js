import { and, desc, eq } from "drizzle-orm";
import { companySecrets, companySecretVersions } from "@paperclipai/db";
import { envBindingSchema } from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { getSecretProvider, listSecretProviders } from "../secrets/provider-registry.js";
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SENSITIVE_ENV_KEY_RE = /(api[-_]?key|access[-_]?token|auth(?:_?token)?|authorization|bearer|secret|passwd|password|credential|jwt|private[-_]?key|cookie|connectionstring)/i;
const REDACTED_SENTINEL = "***REDACTED***";
function asRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return null;
    return value;
}
function isSensitiveEnvKey(key) {
    return SENSITIVE_ENV_KEY_RE.test(key);
}
function canonicalizeBinding(binding) {
    if (typeof binding === "string") {
        return { type: "plain", value: binding };
    }
    if (binding.type === "plain") {
        return { type: "plain", value: String(binding.value) };
    }
    return {
        type: "secret_ref",
        secretId: binding.secretId,
        version: binding.version ?? "latest",
    };
}
export function secretService(db) {
    async function getById(id) {
        return db
            .select()
            .from(companySecrets)
            .where(eq(companySecrets.id, id))
            .then((rows) => rows[0] ?? null);
    }
    async function getByName(companyId, name) {
        return db
            .select()
            .from(companySecrets)
            .where(and(eq(companySecrets.companyId, companyId), eq(companySecrets.name, name)))
            .then((rows) => rows[0] ?? null);
    }
    async function getSecretVersion(secretId, version) {
        return db
            .select()
            .from(companySecretVersions)
            .where(and(eq(companySecretVersions.secretId, secretId), eq(companySecretVersions.version, version)))
            .then((rows) => rows[0] ?? null);
    }
    async function assertSecretInCompany(companyId, secretId) {
        const secret = await getById(secretId);
        if (!secret)
            throw notFound("Secret not found");
        if (secret.companyId !== companyId)
            throw unprocessable("Secret must belong to same company");
        return secret;
    }
    async function resolveSecretValue(companyId, secretId, version) {
        const secret = await assertSecretInCompany(companyId, secretId);
        const resolvedVersion = version === "latest" ? secret.latestVersion : version;
        const versionRow = await getSecretVersion(secret.id, resolvedVersion);
        if (!versionRow)
            throw notFound("Secret version not found");
        const provider = getSecretProvider(secret.provider);
        return provider.resolveVersion({
            material: versionRow.material,
            externalRef: secret.externalRef,
        });
    }
    async function normalizeEnvConfig(companyId, envValue, opts) {
        const record = asRecord(envValue);
        if (!record)
            throw unprocessable("adapterConfig.env must be an object");
        const normalized = {};
        for (const [key, rawBinding] of Object.entries(record)) {
            if (!ENV_KEY_RE.test(key)) {
                throw unprocessable(`Invalid environment variable name: ${key}`);
            }
            const parsed = envBindingSchema.safeParse(rawBinding);
            if (!parsed.success) {
                throw unprocessable(`Invalid environment binding for key: ${key}`);
            }
            const binding = canonicalizeBinding(parsed.data);
            if (binding.type === "plain") {
                if (opts?.strictMode && isSensitiveEnvKey(key) && binding.value.trim().length > 0) {
                    throw unprocessable(`Strict secret mode requires secret references for sensitive key: ${key}`);
                }
                if (binding.value === REDACTED_SENTINEL) {
                    throw unprocessable(`Refusing to persist redacted placeholder for key: ${key}`);
                }
                normalized[key] = binding;
                continue;
            }
            await assertSecretInCompany(companyId, binding.secretId);
            normalized[key] = {
                type: "secret_ref",
                secretId: binding.secretId,
                version: binding.version,
            };
        }
        return normalized;
    }
    async function normalizeAdapterConfigForPersistenceInternal(companyId, adapterConfig, opts) {
        const normalized = { ...adapterConfig };
        if (!Object.prototype.hasOwnProperty.call(adapterConfig, "env")) {
            return normalized;
        }
        normalized.env = await normalizeEnvConfig(companyId, adapterConfig.env, opts);
        return normalized;
    }
    return {
        listProviders: () => listSecretProviders(),
        list: (companyId) => db
            .select()
            .from(companySecrets)
            .where(eq(companySecrets.companyId, companyId))
            .orderBy(desc(companySecrets.createdAt)),
        getById,
        getByName,
        create: async (companyId, input, actor) => {
            const existing = await getByName(companyId, input.name);
            if (existing)
                throw conflict(`Secret already exists: ${input.name}`);
            const provider = getSecretProvider(input.provider);
            const prepared = await provider.createVersion({
                value: input.value,
                externalRef: input.externalRef ?? null,
            });
            return db.transaction(async (tx) => {
                const secret = await tx
                    .insert(companySecrets)
                    .values({
                    companyId,
                    name: input.name,
                    provider: input.provider,
                    externalRef: prepared.externalRef,
                    latestVersion: 1,
                    description: input.description ?? null,
                    createdByAgentId: actor?.agentId ?? null,
                    createdByUserId: actor?.userId ?? null,
                })
                    .returning()
                    .then((rows) => rows[0]);
                await tx.insert(companySecretVersions).values({
                    secretId: secret.id,
                    version: 1,
                    material: prepared.material,
                    valueSha256: prepared.valueSha256,
                    createdByAgentId: actor?.agentId ?? null,
                    createdByUserId: actor?.userId ?? null,
                });
                return secret;
            });
        },
        rotate: async (secretId, input, actor) => {
            const secret = await getById(secretId);
            if (!secret)
                throw notFound("Secret not found");
            const provider = getSecretProvider(secret.provider);
            const nextVersion = secret.latestVersion + 1;
            const prepared = await provider.createVersion({
                value: input.value,
                externalRef: input.externalRef ?? secret.externalRef ?? null,
            });
            return db.transaction(async (tx) => {
                await tx.insert(companySecretVersions).values({
                    secretId: secret.id,
                    version: nextVersion,
                    material: prepared.material,
                    valueSha256: prepared.valueSha256,
                    createdByAgentId: actor?.agentId ?? null,
                    createdByUserId: actor?.userId ?? null,
                });
                const updated = await tx
                    .update(companySecrets)
                    .set({
                    latestVersion: nextVersion,
                    externalRef: prepared.externalRef,
                    updatedAt: new Date(),
                })
                    .where(eq(companySecrets.id, secret.id))
                    .returning()
                    .then((rows) => rows[0] ?? null);
                if (!updated)
                    throw notFound("Secret not found");
                return updated;
            });
        },
        update: async (secretId, patch) => {
            const secret = await getById(secretId);
            if (!secret)
                throw notFound("Secret not found");
            if (patch.name && patch.name !== secret.name) {
                const duplicate = await getByName(secret.companyId, patch.name);
                if (duplicate && duplicate.id !== secret.id) {
                    throw conflict(`Secret already exists: ${patch.name}`);
                }
            }
            return db
                .update(companySecrets)
                .set({
                name: patch.name ?? secret.name,
                description: patch.description === undefined ? secret.description : patch.description,
                externalRef: patch.externalRef === undefined ? secret.externalRef : patch.externalRef,
                updatedAt: new Date(),
            })
                .where(eq(companySecrets.id, secret.id))
                .returning()
                .then((rows) => rows[0] ?? null);
        },
        remove: async (secretId) => {
            const secret = await getById(secretId);
            if (!secret)
                return null;
            await db.delete(companySecrets).where(eq(companySecrets.id, secretId));
            return secret;
        },
        normalizeAdapterConfigForPersistence: async (companyId, adapterConfig, opts) => normalizeAdapterConfigForPersistenceInternal(companyId, adapterConfig, opts),
        normalizeHireApprovalPayloadForPersistence: async (companyId, payload, opts) => {
            const normalized = { ...payload };
            const adapterConfig = asRecord(payload.adapterConfig);
            if (adapterConfig) {
                normalized.adapterConfig = await normalizeAdapterConfigForPersistenceInternal(companyId, adapterConfig, opts);
            }
            return normalized;
        },
        resolveEnvBindings: async (companyId, envValue) => {
            const record = asRecord(envValue);
            if (!record)
                return { env: {}, secretKeys: new Set() };
            const resolved = {};
            const secretKeys = new Set();
            for (const [key, rawBinding] of Object.entries(record)) {
                if (!ENV_KEY_RE.test(key)) {
                    throw unprocessable(`Invalid environment variable name: ${key}`);
                }
                const parsed = envBindingSchema.safeParse(rawBinding);
                if (!parsed.success) {
                    throw unprocessable(`Invalid environment binding for key: ${key}`);
                }
                const binding = canonicalizeBinding(parsed.data);
                if (binding.type === "plain") {
                    resolved[key] = binding.value;
                }
                else {
                    resolved[key] = await resolveSecretValue(companyId, binding.secretId, binding.version);
                    secretKeys.add(key);
                }
            }
            return { env: resolved, secretKeys };
        },
        resolveAdapterConfigForRuntime: async (companyId, adapterConfig) => {
            const resolved = { ...adapterConfig };
            const secretKeys = new Set();
            if (!Object.prototype.hasOwnProperty.call(adapterConfig, "env")) {
                return { config: resolved, secretKeys };
            }
            const record = asRecord(adapterConfig.env);
            if (!record) {
                resolved.env = {};
                return { config: resolved, secretKeys };
            }
            const env = {};
            for (const [key, rawBinding] of Object.entries(record)) {
                if (!ENV_KEY_RE.test(key)) {
                    throw unprocessable(`Invalid environment variable name: ${key}`);
                }
                const parsed = envBindingSchema.safeParse(rawBinding);
                if (!parsed.success) {
                    throw unprocessable(`Invalid environment binding for key: ${key}`);
                }
                const binding = canonicalizeBinding(parsed.data);
                if (binding.type === "plain") {
                    env[key] = binding.value;
                }
                else {
                    env[key] = await resolveSecretValue(companyId, binding.secretId, binding.version);
                    secretKeys.add(key);
                }
            }
            resolved.env = env;
            return { config: resolved, secretKeys };
        },
    };
}
//# sourceMappingURL=secrets.js.map