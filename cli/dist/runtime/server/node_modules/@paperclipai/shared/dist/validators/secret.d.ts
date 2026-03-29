import { z } from "zod";
export declare const envBindingPlainSchema: z.ZodObject<{
    type: z.ZodLiteral<"plain">;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    type: "plain";
}, {
    value: string;
    type: "plain";
}>;
export declare const envBindingSecretRefSchema: z.ZodObject<{
    type: z.ZodLiteral<"secret_ref">;
    secretId: z.ZodString;
    version: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"latest">, z.ZodNumber]>>;
}, "strip", z.ZodTypeAny, {
    type: "secret_ref";
    secretId: string;
    version?: number | "latest" | undefined;
}, {
    type: "secret_ref";
    secretId: string;
    version?: number | "latest" | undefined;
}>;
export declare const envBindingSchema: z.ZodUnion<[z.ZodString, z.ZodObject<{
    type: z.ZodLiteral<"plain">;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    type: "plain";
}, {
    value: string;
    type: "plain";
}>, z.ZodObject<{
    type: z.ZodLiteral<"secret_ref">;
    secretId: z.ZodString;
    version: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"latest">, z.ZodNumber]>>;
}, "strip", z.ZodTypeAny, {
    type: "secret_ref";
    secretId: string;
    version?: number | "latest" | undefined;
}, {
    type: "secret_ref";
    secretId: string;
    version?: number | "latest" | undefined;
}>]>;
export declare const envConfigSchema: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
    type: z.ZodLiteral<"plain">;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    type: "plain";
}, {
    value: string;
    type: "plain";
}>, z.ZodObject<{
    type: z.ZodLiteral<"secret_ref">;
    secretId: z.ZodString;
    version: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"latest">, z.ZodNumber]>>;
}, "strip", z.ZodTypeAny, {
    type: "secret_ref";
    secretId: string;
    version?: number | "latest" | undefined;
}, {
    type: "secret_ref";
    secretId: string;
    version?: number | "latest" | undefined;
}>]>>;
export declare const createSecretSchema: z.ZodObject<{
    name: z.ZodString;
    provider: z.ZodOptional<z.ZodEnum<["local_encrypted", "aws_secrets_manager", "gcp_secret_manager", "vault"]>>;
    value: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    externalRef: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    value: string;
    name: string;
    provider?: "local_encrypted" | "aws_secrets_manager" | "gcp_secret_manager" | "vault" | undefined;
    description?: string | null | undefined;
    externalRef?: string | null | undefined;
}, {
    value: string;
    name: string;
    provider?: "local_encrypted" | "aws_secrets_manager" | "gcp_secret_manager" | "vault" | undefined;
    description?: string | null | undefined;
    externalRef?: string | null | undefined;
}>;
export type CreateSecret = z.infer<typeof createSecretSchema>;
export declare const rotateSecretSchema: z.ZodObject<{
    value: z.ZodString;
    externalRef: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    value: string;
    externalRef?: string | null | undefined;
}, {
    value: string;
    externalRef?: string | null | undefined;
}>;
export type RotateSecret = z.infer<typeof rotateSecretSchema>;
export declare const updateSecretSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    externalRef: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | null | undefined;
    externalRef?: string | null | undefined;
}, {
    name?: string | undefined;
    description?: string | null | undefined;
    externalRef?: string | null | undefined;
}>;
export type UpdateSecret = z.infer<typeof updateSecretSchema>;
//# sourceMappingURL=secret.d.ts.map