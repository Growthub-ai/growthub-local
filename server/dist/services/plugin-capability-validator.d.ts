/**
 * PluginCapabilityValidator — enforces the capability model at both
 * install-time and runtime.
 *
 * Every plugin declares the capabilities it requires in its manifest
 * (`manifest.capabilities`). This service checks those declarations
 * against a mapping of operations → required capabilities so that:
 *
 * 1. **Install-time validation** — `validateManifestCapabilities()`
 *    ensures that declared features (tools, jobs, webhooks, UI slots)
 *    have matching capability entries, giving operators clear feedback
 *    before a plugin is activated.
 *
 * 2. **Runtime gating** — `checkOperation()` / `assertOperation()` are
 *    called on every worker→host bridge call to enforce least-privilege
 *    access. If a plugin attempts an operation it did not declare, the
 *    call is rejected with a 403 error.
 *
 * @see PLUGIN_SPEC.md §15 — Capability Model
 * @see host-client-factory.ts — SDK-side capability gating
 */
import type { PluginCapability, PaperclipPluginManifestV1, PluginUiSlotType } from "@paperclipai/shared";
/**
 * Result of a capability check. When `allowed` is false, `missing` contains
 * the capabilities that the plugin does not declare but the operation requires.
 */
export interface CapabilityCheckResult {
    allowed: boolean;
    missing: PluginCapability[];
    operation?: string;
    pluginId?: string;
}
export interface PluginCapabilityValidator {
    /**
     * Check whether a plugin has a specific capability.
     */
    hasCapability(manifest: PaperclipPluginManifestV1, capability: PluginCapability): boolean;
    /**
     * Check whether a plugin has all of the specified capabilities.
     */
    hasAllCapabilities(manifest: PaperclipPluginManifestV1, capabilities: PluginCapability[]): CapabilityCheckResult;
    /**
     * Check whether a plugin has at least one of the specified capabilities.
     */
    hasAnyCapability(manifest: PaperclipPluginManifestV1, capabilities: PluginCapability[]): boolean;
    /**
     * Check whether a plugin is allowed to perform the named operation.
     *
     * Operations are mapped to required capabilities via OPERATION_CAPABILITIES.
     * Unknown operations are rejected by default.
     */
    checkOperation(manifest: PaperclipPluginManifestV1, operation: string): CapabilityCheckResult;
    /**
     * Assert that a plugin is allowed to perform an operation.
     * Throws a 403 HttpError if the capability check fails.
     */
    assertOperation(manifest: PaperclipPluginManifestV1, operation: string): void;
    /**
     * Assert that a plugin has a specific capability.
     * Throws a 403 HttpError if the capability is missing.
     */
    assertCapability(manifest: PaperclipPluginManifestV1, capability: PluginCapability): void;
    /**
     * Check whether a plugin can register the given UI slot type.
     */
    checkUiSlot(manifest: PaperclipPluginManifestV1, slotType: PluginUiSlotType): CapabilityCheckResult;
    /**
     * Validate that a manifest's declared capabilities are consistent with its
     * declared features (tools, jobs, webhooks, UI slots).
     *
     * Returns all missing capabilities rather than failing on the first one.
     * This is useful for install-time validation to give comprehensive feedback.
     */
    validateManifestCapabilities(manifest: PaperclipPluginManifestV1): CapabilityCheckResult;
    /**
     * Get the capabilities required for a named operation.
     * Returns an empty array if the operation is unknown.
     */
    getRequiredCapabilities(operation: string): readonly PluginCapability[];
    /**
     * Get the capability required for a UI slot type.
     */
    getUiSlotCapability(slotType: PluginUiSlotType): PluginCapability;
}
/**
 * Create a PluginCapabilityValidator.
 *
 * This service enforces capability gates for plugin operations.  The host
 * uses it to verify that a plugin's declared capabilities permit the
 * operation it is attempting, both at install time (manifest validation)
 * and at runtime (bridge call gating).
 *
 * Usage:
 * ```ts
 * const validator = pluginCapabilityValidator();
 *
 * // Runtime: gate a bridge call
 * validator.assertOperation(plugin.manifestJson, "issues.create");
 *
 * // Install time: validate manifest consistency
 * const result = validator.validateManifestCapabilities(manifest);
 * if (!result.allowed) {
 *   throw badRequest("Missing capabilities", result.missing);
 * }
 * ```
 */
export declare function pluginCapabilityValidator(): PluginCapabilityValidator;
//# sourceMappingURL=plugin-capability-validator.d.ts.map