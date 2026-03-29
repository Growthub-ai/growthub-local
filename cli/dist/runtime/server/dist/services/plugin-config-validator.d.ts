/**
 * @fileoverview Validates plugin instance configuration against its JSON Schema.
 *
 * Uses Ajv to validate `configJson` values against the `instanceConfigSchema`
 * declared in a plugin's manifest. This ensures that invalid configuration is
 * rejected at the API boundary, not discovered later at worker startup.
 *
 * @module server/services/plugin-config-validator
 */
import type { JsonSchema } from "@paperclipai/shared";
export interface ConfigValidationResult {
    valid: boolean;
    errors?: {
        field: string;
        message: string;
    }[];
}
/**
 * Validate a config object against a JSON Schema.
 *
 * @param configJson - The configuration values to validate.
 * @param schema - The JSON Schema from the plugin manifest's `instanceConfigSchema`.
 * @returns Validation result with structured field errors on failure.
 */
export declare function validateInstanceConfig(configJson: Record<string, unknown>, schema: JsonSchema): ConfigValidationResult;
//# sourceMappingURL=plugin-config-validator.d.ts.map