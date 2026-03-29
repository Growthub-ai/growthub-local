import { z } from "zod";
export const createAssetImageMetadataSchema = z.object({
    namespace: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .regex(/^[a-zA-Z0-9/_-]+$/)
        .optional(),
});
//# sourceMappingURL=asset.js.map