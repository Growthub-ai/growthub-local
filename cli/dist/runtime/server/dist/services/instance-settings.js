import { companies, instanceSettings } from "@paperclipai/db";
import { instanceExperimentalSettingsSchema, } from "@paperclipai/shared";
import { eq } from "drizzle-orm";
const DEFAULT_SINGLETON_KEY = "default";
function normalizeExperimentalSettings(raw) {
    const parsed = instanceExperimentalSettingsSchema.safeParse(raw ?? {});
    if (parsed.success) {
        return {
            enableIsolatedWorkspaces: parsed.data.enableIsolatedWorkspaces ?? false,
        };
    }
    return {
        enableIsolatedWorkspaces: false,
    };
}
function toInstanceSettings(row) {
    return {
        id: row.id,
        experimental: normalizeExperimentalSettings(row.experimental),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
export function instanceSettingsService(db) {
    async function getOrCreateRow() {
        const existing = await db
            .select()
            .from(instanceSettings)
            .where(eq(instanceSettings.singletonKey, DEFAULT_SINGLETON_KEY))
            .then((rows) => rows[0] ?? null);
        if (existing)
            return existing;
        const now = new Date();
        const [created] = await db
            .insert(instanceSettings)
            .values({
            singletonKey: DEFAULT_SINGLETON_KEY,
            experimental: {},
            createdAt: now,
            updatedAt: now,
        })
            .onConflictDoUpdate({
            target: [instanceSettings.singletonKey],
            set: {
                updatedAt: now,
            },
        })
            .returning();
        return created;
    }
    return {
        get: async () => toInstanceSettings(await getOrCreateRow()),
        getExperimental: async () => {
            const row = await getOrCreateRow();
            return normalizeExperimentalSettings(row.experimental);
        },
        updateExperimental: async (patch) => {
            const current = await getOrCreateRow();
            const nextExperimental = normalizeExperimentalSettings({
                ...normalizeExperimentalSettings(current.experimental),
                ...patch,
            });
            const now = new Date();
            const [updated] = await db
                .update(instanceSettings)
                .set({
                experimental: { ...nextExperimental },
                updatedAt: now,
            })
                .where(eq(instanceSettings.id, current.id))
                .returning();
            return toInstanceSettings(updated ?? current);
        },
        listCompanyIds: async () => db
            .select({ id: companies.id })
            .from(companies)
            .then((rows) => rows.map((row) => row.id)),
    };
}
//# sourceMappingURL=instance-settings.js.map