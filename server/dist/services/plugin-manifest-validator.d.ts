import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
/**
 * Successful parse result.
 */
export interface ManifestParseSuccess {
    success: true;
    manifest: PaperclipPluginManifestV1;
}
/**
 * Failed parse result. `errors` is a human-readable description of what went
 * wrong; `details` is the raw Zod error list for programmatic inspection.
 */
export interface ManifestParseFailure {
    success: false;
    errors: string;
    details: Array<{
        path: (string | number)[];
        message: string;
    }>;
}
/** Union of parse outcomes. */
export type ManifestParseResult = ManifestParseSuccess | ManifestParseFailure;
/**
 * Service for parsing and validating plugin manifests.
 *
 * @see PLUGIN_SPEC.md §10 — Plugin Manifest
 */
export interface PluginManifestValidator {
    /**
     * Try to parse `input` as a plugin manifest.
     *
     * Returns a {@link ManifestParseSuccess} when the input passes all
     * validation rules, or a {@link ManifestParseFailure} with human-readable
     * error messages when it does not.
     *
     * This is the "safe" variant — it never throws.
     */
    parse(input: unknown): ManifestParseResult;
    /**
     * Parse `input` as a plugin manifest, throwing a 400 HttpError on failure.
     *
     * Use this at install time when an invalid manifest should surface as an
     * HTTP error to the caller.
     *
     * @throws {HttpError} 400 Bad Request if the manifest is invalid.
     */
    parseOrThrow(input: unknown): PaperclipPluginManifestV1;
    /**
     * Return the list of plugin API versions supported by this host.
     *
     * Callers can use this to present the supported version range to operators
     * or to decide whether a candidate plugin can be installed.
     */
    getSupportedVersions(): readonly number[];
}
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
export declare function pluginManifestValidator(): PluginManifestValidator;
//# sourceMappingURL=plugin-manifest-validator.d.ts.map