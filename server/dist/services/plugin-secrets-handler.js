/**
 * Plugin secrets host-side handler — resolves secret references through the
 * Paperclip secret provider system.
 *
 * When a plugin worker calls `ctx.secrets.resolve(secretRef)`, the JSON-RPC
 * request arrives at the host with `{ secretRef }`. This module provides the
 * concrete `HostServices.secrets` adapter that:
 *
 * 1. Parses the `secretRef` string to identify the secret.
 * 2. Looks up the secret record and its latest version in the database.
 * 3. Delegates to the configured `SecretProviderModule` to decrypt /
 *    resolve the raw value.
 * 4. Returns the resolved plaintext value to the worker.
 *
 * ## Secret Reference Format
 *
 * A `secretRef` is a **secret UUID** — the primary key (`id`) of a row in
 * the `company_secrets` table. Operators place these UUIDs into plugin
 * config values; plugin workers resolve them at execution time via
 * `ctx.secrets.resolve(secretId)`.
 *
 * ## Security Invariants
 *
 * - Resolved values are **never** logged, persisted, or included in error
 *   messages (per PLUGIN_SPEC.md §22).
 * - The handler is capability-gated: only plugins with `secrets.read-ref`
 *   declared in their manifest may call it (enforced by `host-client-factory`).
 * - The host handler itself does not cache resolved values. Each call goes
 *   through the secret provider to honour rotation.
 *
 * @see PLUGIN_SPEC.md §22 — Secrets
 * @see host-client-factory.ts — capability gating
 * @see services/secrets.ts — secretService used by agent env bindings
 */
import { eq, and } from "drizzle-orm";
import { companySecrets, companySecretVersions, pluginConfig } from "@paperclipai/db";
import { getSecretProvider } from "../secrets/provider-registry.js";
import { pluginRegistryService } from "./plugin-registry.js";
// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------
/**
 * Create a sanitised error that never leaks secret material.
 * Only the ref identifier is included; never the resolved value.
 */
function secretNotFound(secretRef) {
    const err = new Error(`Secret not found: ${secretRef}`);
    err.name = "SecretNotFoundError";
    return err;
}
function secretVersionNotFound(secretRef) {
    const err = new Error(`No version found for secret: ${secretRef}`);
    err.name = "SecretVersionNotFoundError";
    return err;
}
function invalidSecretRef(secretRef) {
    const err = new Error(`Invalid secret reference: ${secretRef}`);
    err.name = "InvalidSecretRefError";
    return err;
}
// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
/** UUID v4 regex for validating secretRef format. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Check whether a secretRef looks like a valid UUID.
 */
function isUuid(value) {
    return UUID_RE.test(value);
}
/**
 * Collect the property paths (dot-separated keys) whose schema node declares
 * `format: "secret-ref"`. Only top-level and nested `properties` are walked —
 * this mirrors the flat/nested object shapes that `JsonSchemaForm` renders.
 */
function collectSecretRefPaths(schema) {
    const paths = new Set();
    if (!schema || typeof schema !== "object")
        return paths;
    function walk(node, prefix) {
        const props = node.properties;
        if (!props || typeof props !== "object")
            return;
        for (const [key, propSchema] of Object.entries(props)) {
            if (!propSchema || typeof propSchema !== "object")
                continue;
            const path = prefix ? `${prefix}.${key}` : key;
            if (propSchema.format === "secret-ref") {
                paths.add(path);
            }
            // Recurse into nested object schemas
            if (propSchema.type === "object") {
                walk(propSchema, path);
            }
        }
    }
    walk(schema, "");
    return paths;
}
/**
 * Extract secret reference UUIDs from a plugin's configJson, scoped to only
 * the fields annotated with `format: "secret-ref"` in the schema.
 *
 * When no schema is provided, falls back to collecting all UUID-shaped strings
 * (backwards-compatible for plugins without a declared instanceConfigSchema).
 */
export function extractSecretRefsFromConfig(configJson, schema) {
    const refs = new Set();
    if (configJson == null || typeof configJson !== "object")
        return refs;
    const secretPaths = collectSecretRefPaths(schema);
    // If schema declares secret-ref paths, extract only those values.
    if (secretPaths.size > 0) {
        for (const dotPath of secretPaths) {
            const keys = dotPath.split(".");
            let current = configJson;
            for (const k of keys) {
                if (current == null || typeof current !== "object") {
                    current = undefined;
                    break;
                }
                current = current[k];
            }
            if (typeof current === "string" && isUuid(current)) {
                refs.add(current);
            }
        }
        return refs;
    }
    // Fallback: no schema or no secret-ref annotations — collect all UUIDs.
    // This preserves backwards compatibility for plugins that omit
    // instanceConfigSchema.
    function walkAll(value) {
        if (typeof value === "string") {
            if (isUuid(value))
                refs.add(value);
        }
        else if (Array.isArray(value)) {
            for (const item of value)
                walkAll(item);
        }
        else if (value !== null && typeof value === "object") {
            for (const v of Object.values(value))
                walkAll(v);
        }
    }
    walkAll(configJson);
    return refs;
}
/**
 * Create a `HostServices.secrets` adapter for a specific plugin.
 *
 * The returned service looks up secrets by UUID, fetches the latest version
 * material, and delegates to the appropriate `SecretProviderModule` for
 * decryption.
 *
 * @example
 * ```ts
 * const secretsHandler = createPluginSecretsHandler({ db, pluginId });
 * const handlers = createHostClientHandlers({
 *   pluginId,
 *   capabilities: manifest.capabilities,
 *   services: {
 *     secrets: secretsHandler,
 *     // ...
 *   },
 * });
 * ```
 *
 * @param options - Database connection and plugin identity
 * @returns A `PluginSecretsService` suitable for `HostServices.secrets`
 */
/** Simple sliding-window rate limiter for secret resolution attempts. */
function createRateLimiter(maxAttempts, windowMs) {
    const attempts = new Map();
    return {
        check(key) {
            const now = Date.now();
            const windowStart = now - windowMs;
            const existing = (attempts.get(key) ?? []).filter((ts) => ts > windowStart);
            if (existing.length >= maxAttempts)
                return false;
            existing.push(now);
            attempts.set(key, existing);
            return true;
        },
    };
}
export function createPluginSecretsHandler(options) {
    const { db, pluginId } = options;
    const registry = pluginRegistryService(db);
    // Rate limit: max 30 resolution attempts per plugin per minute
    const rateLimiter = createRateLimiter(30, 60_000);
    let cachedAllowedRefs = null;
    let cachedAllowedRefsExpiry = 0;
    const CONFIG_CACHE_TTL_MS = 30_000; // 30 seconds, matches event bus TTL
    return {
        async resolve(params) {
            const { secretRef } = params;
            // ---------------------------------------------------------------
            // 0. Rate limiting — prevent brute-force UUID enumeration
            // ---------------------------------------------------------------
            if (!rateLimiter.check(pluginId)) {
                const err = new Error("Rate limit exceeded for secret resolution");
                err.name = "RateLimitExceededError";
                throw err;
            }
            // ---------------------------------------------------------------
            // 1. Validate the ref format
            // ---------------------------------------------------------------
            if (!secretRef || typeof secretRef !== "string" || secretRef.trim().length === 0) {
                throw invalidSecretRef(secretRef ?? "<empty>");
            }
            const trimmedRef = secretRef.trim();
            if (!isUuid(trimmedRef)) {
                throw invalidSecretRef(trimmedRef);
            }
            // ---------------------------------------------------------------
            // 1b. Scope check — only allow secrets referenced in this plugin's config
            // ---------------------------------------------------------------
            const now = Date.now();
            if (!cachedAllowedRefs || now > cachedAllowedRefsExpiry) {
                const [configRow, plugin] = await Promise.all([
                    db
                        .select()
                        .from(pluginConfig)
                        .where(eq(pluginConfig.pluginId, pluginId))
                        .then((rows) => rows[0] ?? null),
                    registry.getById(pluginId),
                ]);
                const schema = plugin?.manifestJson
                    ?.instanceConfigSchema;
                cachedAllowedRefs = extractSecretRefsFromConfig(configRow?.configJson, schema);
                cachedAllowedRefsExpiry = now + CONFIG_CACHE_TTL_MS;
            }
            if (!cachedAllowedRefs.has(trimmedRef)) {
                // Return "not found" to avoid leaking whether the secret exists
                throw secretNotFound(trimmedRef);
            }
            // ---------------------------------------------------------------
            // 2. Look up the secret record by UUID
            // ---------------------------------------------------------------
            const secret = await db
                .select()
                .from(companySecrets)
                .where(eq(companySecrets.id, trimmedRef))
                .then((rows) => rows[0] ?? null);
            if (!secret) {
                throw secretNotFound(trimmedRef);
            }
            // ---------------------------------------------------------------
            // 3. Fetch the latest version's material
            // ---------------------------------------------------------------
            const versionRow = await db
                .select()
                .from(companySecretVersions)
                .where(and(eq(companySecretVersions.secretId, secret.id), eq(companySecretVersions.version, secret.latestVersion)))
                .then((rows) => rows[0] ?? null);
            if (!versionRow) {
                throw secretVersionNotFound(trimmedRef);
            }
            // ---------------------------------------------------------------
            // 4. Resolve through the appropriate secret provider
            // ---------------------------------------------------------------
            const provider = getSecretProvider(secret.provider);
            const resolved = await provider.resolveVersion({
                material: versionRow.material,
                externalRef: secret.externalRef,
            });
            return resolved;
        },
    };
}
//# sourceMappingURL=plugin-secrets-handler.js.map