/**
 * PluginManifestValidator — schema validation for plugin manifest files.
 *
 * Uses the shared Zod schema (`pluginManifestV1Schema`) to validate
 * manifest payloads. Provides both a safe `parse()` variant (returns
 * a result union) and a throwing `parseOrThrow()` for HTTP error
 * propagation at install time.
 *
 * @see PLUGIN_SPEC.md §10 — Plugin Manifest
 * @see packages/shared/src/validators/plugin.ts — Zod schema definition
 */
import { pluginManifestV1Schema } from "@paperclipai/shared";
import { PLUGIN_API_VERSION } from "@paperclipai/shared";
import { badRequest } from "../errors.js";
// ---------------------------------------------------------------------------
// Supported manifest API versions
// ---------------------------------------------------------------------------
/**
 * The set of plugin API versions this host can accept.
 * When a new API version is introduced, add it here. Old versions should be
 * retained until the host drops support for them.
 */
const SUPPORTED_VERSIONS = [PLUGIN_API_VERSION];
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
/**
 * Create a {@link PluginManifestValidator}.
 *
 * Usage:
 * ```ts
 * const validator = pluginManifestValidator();
 *
 * // Safe parse — inspect the result
 * const result = validator.parse(rawManifest);
 * if (!result.success) {
 *   console.error(result.errors);
 *   return;
 * }
 * const manifest = result.manifest;
 *
 * // Throwing parse — use at install time
 * const manifest = validator.parseOrThrow(rawManifest);
 *
 * // Check supported versions
 * const versions = validator.getSupportedVersions(); // [1]
 * ```
 */
export function pluginManifestValidator() {
    return {
        parse(input) {
            const result = pluginManifestV1Schema.safeParse(input);
            if (result.success) {
                return {
                    success: true,
                    manifest: result.data,
                };
            }
            const details = result.error.errors.map((issue) => ({
                path: issue.path,
                message: issue.message,
            }));
            const errors = details
                .map(({ path, message }) => path.length > 0 ? `${path.join(".")}: ${message}` : message)
                .join("; ");
            return {
                success: false,
                errors,
                details,
            };
        },
        parseOrThrow(input) {
            const result = this.parse(input);
            if (!result.success) {
                throw badRequest(`Invalid plugin manifest: ${result.errors}`, result.details);
            }
            return result.manifest;
        },
        getSupportedVersions() {
            return SUPPORTED_VERSIONS;
        },
    };
}
//# sourceMappingURL=plugin-manifest-validator.js.map