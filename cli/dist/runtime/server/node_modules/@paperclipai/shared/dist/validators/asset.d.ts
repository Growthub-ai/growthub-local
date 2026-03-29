import { z } from "zod";
export declare const createAssetImageMetadataSchema: z.ZodObject<{
    namespace: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    namespace?: string | undefined;
}, {
    namespace?: string | undefined;
}>;
export type CreateAssetImageMetadata = z.infer<typeof createAssetImageMetadataSchema>;
//# sourceMappingURL=asset.d.ts.map