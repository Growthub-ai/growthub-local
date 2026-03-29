import { eq } from "drizzle-orm";
import { assets } from "@paperclipai/db";
export function assetService(db) {
    return {
        create: (companyId, data) => db
            .insert(assets)
            .values({ ...data, companyId })
            .returning()
            .then((rows) => rows[0]),
        getById: (id) => db
            .select()
            .from(assets)
            .where(eq(assets.id, id))
            .then((rows) => rows[0] ?? null),
    };
}
//# sourceMappingURL=assets.js.map