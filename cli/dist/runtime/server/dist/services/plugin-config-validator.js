/**
 * @fileoverview Validates plugin instance configuration against its JSON Schema.
 *
 * Uses Ajv to validate `configJson` values against the `instanceConfigSchema`
 * declared in a plugin's manifest. This ensures that invalid configuration is
 * rejected at the API boundary, not discovered later at worker startup.
 *
 * @module server/services/plugin-config-validator
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
/**
 * Validate a config object against a JSON Schema.
 *
 * @param configJson - The configuration values to validate.
 * @param schema - The JSON Schema from the plugin manifest's `instanceConfigSchema`.
 * @returns Validation result with structured field errors on failure.
 */
export function validateInstanceConfig(configJson, schema) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AjvCtor = Ajv.default ?? Ajv;
    const ajv = new AjvCtor({ allErrors: true });
    // ajv-formats v3 default export is a FormatsPlugin object; call it as a plugin.
    const applyFormats = addFormats.default ?? addFormats;
    applyFormats(ajv);
    // Register the secret-ref format used by plugin manifests to mark fields that
    // hold a Paperclip secret UUID rather than a raw value. The format is a UI
    // hint only — UUID validation happens in the secrets handler at resolve time.
    ajv.addFormat("secret-ref", { validate: () => true });
    const validate = ajv.compile(schema);
    const valid = validate(configJson);
    if (valid) {
        return { valid: true };
    }
    const errors = (validate.errors ?? []).map((err) => ({
        field: err.instancePath || "/",
        message: err.message ?? "validation failed",
    }));
    return { valid: false, errors };
}
//# sourceMappingURL=plugin-config-validator.js.map