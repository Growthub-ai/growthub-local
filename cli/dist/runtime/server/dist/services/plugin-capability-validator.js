import { forbidden } from "../errors.js";
import { logger } from "../middleware/logger.js";
// ---------------------------------------------------------------------------
// Capability requirement mappings
// ---------------------------------------------------------------------------
/**
 * Maps high-level operations to the capabilities they require.
 *
 * When the bridge receives a call from a plugin worker, the host looks up
 * the operation in this map and checks the plugin's declared capabilities.
 * If any required capability is missing, the call is rejected.
 *
 * @see PLUGIN_SPEC.md §15 — Capability Model
 */
const OPERATION_CAPABILITIES = {
    // Data read operations
    "companies.list": ["companies.read"],
    "companies.get": ["companies.read"],
    "projects.list": ["projects.read"],
    "projects.get": ["projects.read"],
    "project.workspaces.list": ["project.workspaces.read"],
    "project.workspaces.get": ["project.workspaces.read"],
    "issues.list": ["issues.read"],
    "issues.get": ["issues.read"],
    "issue.comments.list": ["issue.comments.read"],
    "issue.comments.get": ["issue.comments.read"],
    "agents.list": ["agents.read"],
    "agents.get": ["agents.read"],
    "goals.list": ["goals.read"],
    "goals.get": ["goals.read"],
    "activity.list": ["activity.read"],
    "activity.get": ["activity.read"],
    "costs.list": ["costs.read"],
    "costs.get": ["costs.read"],
    // Data write operations
    "issues.create": ["issues.create"],
    "issues.update": ["issues.update"],
    "issue.comments.create": ["issue.comments.create"],
    "activity.log": ["activity.log.write"],
    "metrics.write": ["metrics.write"],
    // Plugin state operations
    "plugin.state.get": ["plugin.state.read"],
    "plugin.state.list": ["plugin.state.read"],
    "plugin.state.set": ["plugin.state.write"],
    "plugin.state.delete": ["plugin.state.write"],
    // Runtime / Integration operations
    "events.subscribe": ["events.subscribe"],
    "events.emit": ["events.emit"],
    "jobs.schedule": ["jobs.schedule"],
    "jobs.cancel": ["jobs.schedule"],
    "webhooks.receive": ["webhooks.receive"],
    "http.request": ["http.outbound"],
    "secrets.resolve": ["secrets.read-ref"],
    // Agent tools
    "agent.tools.register": ["agent.tools.register"],
    "agent.tools.execute": ["agent.tools.register"],
};
/**
 * Maps UI slot types to the capability required to register them.
 *
 * @see PLUGIN_SPEC.md §19 — UI Extension Model
 */
const UI_SLOT_CAPABILITIES = {
    sidebar: "ui.sidebar.register",
    sidebarPanel: "ui.sidebar.register",
    projectSidebarItem: "ui.sidebar.register",
    page: "ui.page.register",
    detailTab: "ui.detailTab.register",
    taskDetailView: "ui.detailTab.register",
    dashboardWidget: "ui.dashboardWidget.register",
    globalToolbarButton: "ui.action.register",
    toolbarButton: "ui.action.register",
    contextMenuItem: "ui.action.register",
    commentAnnotation: "ui.commentAnnotation.register",
    commentContextMenuItem: "ui.action.register",
    settingsPage: "instance.settings.register",
};
/**
 * Launcher placement zones align with host UI surfaces and therefore inherit
 * the same capability requirements as the equivalent slot type.
 */
const LAUNCHER_PLACEMENT_CAPABILITIES = {
    page: "ui.page.register",
    detailTab: "ui.detailTab.register",
    taskDetailView: "ui.detailTab.register",
    dashboardWidget: "ui.dashboardWidget.register",
    sidebar: "ui.sidebar.register",
    sidebarPanel: "ui.sidebar.register",
    projectSidebarItem: "ui.sidebar.register",
    globalToolbarButton: "ui.action.register",
    toolbarButton: "ui.action.register",
    contextMenuItem: "ui.action.register",
    commentAnnotation: "ui.commentAnnotation.register",
    commentContextMenuItem: "ui.action.register",
    settingsPage: "instance.settings.register",
};
/**
 * Maps feature declarations in the manifest to their required capabilities.
 */
const FEATURE_CAPABILITIES = {
    tools: "agent.tools.register",
    jobs: "jobs.schedule",
    webhooks: "webhooks.receive",
};
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
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
export function pluginCapabilityValidator() {
    const log = logger.child({ service: "plugin-capability-validator" });
    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------
    function capabilitySet(manifest) {
        return new Set(manifest.capabilities);
    }
    function buildForbiddenMessage(manifest, operation, missing) {
        return (`Plugin '${manifest.id}' is not allowed to perform '${operation}'. ` +
            `Missing required capabilities: ${missing.join(", ")}`);
    }
    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    return {
        hasCapability(manifest, capability) {
            return manifest.capabilities.includes(capability);
        },
        hasAllCapabilities(manifest, capabilities) {
            const declared = capabilitySet(manifest);
            const missing = capabilities.filter((cap) => !declared.has(cap));
            return {
                allowed: missing.length === 0,
                missing,
                pluginId: manifest.id,
            };
        },
        hasAnyCapability(manifest, capabilities) {
            const declared = capabilitySet(manifest);
            return capabilities.some((cap) => declared.has(cap));
        },
        checkOperation(manifest, operation) {
            const required = OPERATION_CAPABILITIES[operation];
            if (!required) {
                log.warn({ pluginId: manifest.id, operation }, "capability check for unknown operation – rejecting by default");
                return {
                    allowed: false,
                    missing: [],
                    operation,
                    pluginId: manifest.id,
                };
            }
            const declared = capabilitySet(manifest);
            const missing = required.filter((cap) => !declared.has(cap));
            if (missing.length > 0) {
                log.debug({ pluginId: manifest.id, operation, missing }, "capability check failed");
            }
            return {
                allowed: missing.length === 0,
                missing,
                operation,
                pluginId: manifest.id,
            };
        },
        assertOperation(manifest, operation) {
            const result = this.checkOperation(manifest, operation);
            if (!result.allowed) {
                const msg = result.missing.length > 0
                    ? buildForbiddenMessage(manifest, operation, result.missing)
                    : `Plugin '${manifest.id}' attempted unknown operation '${operation}'`;
                throw forbidden(msg);
            }
        },
        assertCapability(manifest, capability) {
            if (!this.hasCapability(manifest, capability)) {
                throw forbidden(`Plugin '${manifest.id}' lacks required capability '${capability}'`);
            }
        },
        checkUiSlot(manifest, slotType) {
            const required = UI_SLOT_CAPABILITIES[slotType];
            if (!required) {
                return {
                    allowed: false,
                    missing: [],
                    operation: `ui.${slotType}.register`,
                    pluginId: manifest.id,
                };
            }
            const has = manifest.capabilities.includes(required);
            return {
                allowed: has,
                missing: has ? [] : [required],
                operation: `ui.${slotType}.register`,
                pluginId: manifest.id,
            };
        },
        validateManifestCapabilities(manifest) {
            const declared = capabilitySet(manifest);
            const allMissing = [];
            // Check feature declarations → required capabilities
            for (const [feature, requiredCap] of Object.entries(FEATURE_CAPABILITIES)) {
                const featureValue = manifest[feature];
                if (Array.isArray(featureValue) && featureValue.length > 0) {
                    if (!declared.has(requiredCap)) {
                        allMissing.push(requiredCap);
                    }
                }
            }
            // Check UI slots → required capabilities
            const uiSlots = manifest.ui?.slots ?? [];
            if (uiSlots.length > 0) {
                for (const slot of uiSlots) {
                    const requiredCap = UI_SLOT_CAPABILITIES[slot.type];
                    if (requiredCap && !declared.has(requiredCap)) {
                        if (!allMissing.includes(requiredCap)) {
                            allMissing.push(requiredCap);
                        }
                    }
                }
            }
            // Check launcher declarations → required capabilities
            const launchers = [
                ...(manifest.launchers ?? []),
                ...(manifest.ui?.launchers ?? []),
            ];
            if (launchers.length > 0) {
                for (const launcher of launchers) {
                    const requiredCap = LAUNCHER_PLACEMENT_CAPABILITIES[launcher.placementZone];
                    if (requiredCap && !declared.has(requiredCap) && !allMissing.includes(requiredCap)) {
                        allMissing.push(requiredCap);
                    }
                }
            }
            return {
                allowed: allMissing.length === 0,
                missing: allMissing,
                pluginId: manifest.id,
            };
        },
        getRequiredCapabilities(operation) {
            return OPERATION_CAPABILITIES[operation] ?? [];
        },
        getUiSlotCapability(slotType) {
            return UI_SLOT_CAPABILITIES[slotType];
        },
    };
}
//# sourceMappingURL=plugin-capability-validator.js.map