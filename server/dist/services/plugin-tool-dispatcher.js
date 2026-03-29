/**
 * PluginToolDispatcher — orchestrates plugin tool discovery, lifecycle
 * integration, and execution routing for the agent service.
 *
 * This service sits between the agent service and the lower-level
 * `PluginToolRegistry` + `PluginWorkerManager`, providing a clean API that:
 *
 * - Discovers tools from loaded plugin manifests and registers them
 *   in the tool registry.
 * - Hooks into `PluginLifecycleManager` events to automatically register
 *   and unregister tools when plugins are enabled or disabled.
 * - Exposes the tool list in an agent-friendly format (with namespaced
 *   names, descriptions, parameter schemas).
 * - Routes `executeTool` calls to the correct plugin worker and returns
 *   structured results.
 * - Validates tool parameters against declared schemas before dispatch.
 *
 * The dispatcher is created once at server startup and shared across
 * the application.
 *
 * @see PLUGIN_SPEC.md §11 — Agent Tools
 * @see PLUGIN_SPEC.md §13.10 — `executeTool`
 */
import { createPluginToolRegistry, } from "./plugin-tool-registry.js";
import { pluginRegistryService } from "./plugin-registry.js";
import { logger } from "../middleware/logger.js";
// ---------------------------------------------------------------------------
// Factory: createPluginToolDispatcher
// ---------------------------------------------------------------------------
/**
 * Create a new `PluginToolDispatcher`.
 *
 * The dispatcher:
 * 1. Creates and owns a `PluginToolRegistry` backed by the given worker manager.
 * 2. Listens for lifecycle events (plugin.enabled, plugin.disabled, plugin.unloaded)
 *    to automatically register and unregister tools.
 * 3. On `initialize()`, loads tools from all currently-ready plugins via the DB.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * // At server startup
 * const dispatcher = createPluginToolDispatcher({
 *   workerManager,
 *   lifecycleManager,
 *   db,
 * });
 * await dispatcher.initialize();
 *
 * // In agent service — list tools for prompt construction
 * const tools = dispatcher.listToolsForAgent();
 *
 * // In agent service — execute a tool
 * const result = await dispatcher.executeTool(
 *   "acme.linear:search-issues",
 *   { query: "auth bug" },
 *   { agentId: "a-1", runId: "r-1", companyId: "c-1", projectId: "p-1" },
 * );
 * ```
 */
export function createPluginToolDispatcher(options = {}) {
    const { workerManager, lifecycleManager, db } = options;
    const log = logger.child({ service: "plugin-tool-dispatcher" });
    // Create the underlying tool registry, backed by the worker manager
    const registry = createPluginToolRegistry(workerManager);
    // Track lifecycle event listeners so we can remove them on teardown
    let enabledListener = null;
    let disabledListener = null;
    let unloadedListener = null;
    let initialized = false;
    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------
    /**
     * Attempt to register tools for a plugin by looking up its manifest
     * from the DB. No-ops gracefully if the plugin or manifest is missing.
     */
    async function registerFromDb(pluginId) {
        if (!db) {
            log.warn({ pluginId }, "cannot register tools from DB — no database connection configured");
            return;
        }
        const pluginRegistry = pluginRegistryService(db);
        const plugin = await pluginRegistry.getById(pluginId);
        if (!plugin) {
            log.warn({ pluginId }, "plugin not found in registry, cannot register tools");
            return;
        }
        const manifest = plugin.manifestJson;
        if (!manifest) {
            log.warn({ pluginId }, "plugin has no manifest, cannot register tools");
            return;
        }
        registry.registerPlugin(plugin.pluginKey, manifest, plugin.id);
    }
    /**
     * Convert a `RegisteredTool` to an `AgentToolDescriptor`.
     */
    function toAgentDescriptor(tool) {
        return {
            name: tool.namespacedName,
            displayName: tool.displayName,
            description: tool.description,
            parametersSchema: tool.parametersSchema,
            pluginId: tool.pluginDbId,
        };
    }
    // -----------------------------------------------------------------------
    // Lifecycle event handlers
    // -----------------------------------------------------------------------
    function handlePluginEnabled(payload) {
        log.debug({ pluginId: payload.pluginId, pluginKey: payload.pluginKey }, "plugin enabled — registering tools");
        // Async registration from DB — we fire-and-forget since the lifecycle
        // event handler must be synchronous. Any errors are logged.
        void registerFromDb(payload.pluginId).catch((err) => {
            log.error({ pluginId: payload.pluginId, err: err instanceof Error ? err.message : String(err) }, "failed to register tools after plugin enabled");
        });
    }
    function handlePluginDisabled(payload) {
        log.debug({ pluginId: payload.pluginId, pluginKey: payload.pluginKey }, "plugin disabled — unregistering tools");
        registry.unregisterPlugin(payload.pluginKey);
    }
    function handlePluginUnloaded(payload) {
        log.debug({ pluginId: payload.pluginId, pluginKey: payload.pluginKey }, "plugin unloaded — unregistering tools");
        registry.unregisterPlugin(payload.pluginKey);
    }
    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    return {
        async initialize() {
            if (initialized) {
                log.warn("dispatcher already initialized, skipping");
                return;
            }
            log.info("initializing plugin tool dispatcher");
            // Step 1: Load tools from all currently-ready plugins
            if (db) {
                const pluginRegistry = pluginRegistryService(db);
                const readyPlugins = await pluginRegistry.listByStatus("ready");
                let totalTools = 0;
                for (const plugin of readyPlugins) {
                    const manifest = plugin.manifestJson;
                    if (manifest?.tools && manifest.tools.length > 0) {
                        registry.registerPlugin(plugin.pluginKey, manifest, plugin.id);
                        totalTools += manifest.tools.length;
                    }
                }
                log.info({ readyPlugins: readyPlugins.length, registeredTools: totalTools }, "loaded tools from ready plugins");
            }
            // Step 2: Subscribe to lifecycle events for dynamic updates
            if (lifecycleManager) {
                enabledListener = handlePluginEnabled;
                disabledListener = handlePluginDisabled;
                unloadedListener = handlePluginUnloaded;
                lifecycleManager.on("plugin.enabled", enabledListener);
                lifecycleManager.on("plugin.disabled", disabledListener);
                lifecycleManager.on("plugin.unloaded", unloadedListener);
                log.debug("subscribed to lifecycle events");
            }
            else {
                log.warn("no lifecycle manager provided — tools will not auto-update on plugin state changes");
            }
            initialized = true;
            log.info({ totalTools: registry.toolCount() }, "plugin tool dispatcher initialized");
        },
        teardown() {
            if (!initialized)
                return;
            // Unsubscribe from lifecycle events
            if (lifecycleManager) {
                if (enabledListener)
                    lifecycleManager.off("plugin.enabled", enabledListener);
                if (disabledListener)
                    lifecycleManager.off("plugin.disabled", disabledListener);
                if (unloadedListener)
                    lifecycleManager.off("plugin.unloaded", unloadedListener);
                enabledListener = null;
                disabledListener = null;
                unloadedListener = null;
            }
            // Note: we do NOT clear the registry here because teardown may be
            // called during graceful shutdown where in-flight tool calls should
            // still be able to resolve their tool entries.
            initialized = false;
            log.info("plugin tool dispatcher torn down");
        },
        listToolsForAgent(filter) {
            return registry.listTools(filter).map(toAgentDescriptor);
        },
        getTool(namespacedName) {
            return registry.getTool(namespacedName);
        },
        async executeTool(namespacedName, parameters, runContext) {
            log.debug({
                tool: namespacedName,
                agentId: runContext.agentId,
                runId: runContext.runId,
            }, "dispatching tool execution");
            const result = await registry.executeTool(namespacedName, parameters, runContext);
            log.debug({
                tool: namespacedName,
                pluginId: result.pluginId,
                hasContent: !!result.result.content,
                hasError: !!result.result.error,
            }, "tool execution completed");
            return result;
        },
        registerPluginTools(pluginId, manifest) {
            registry.registerPlugin(pluginId, manifest);
        },
        unregisterPluginTools(pluginId) {
            registry.unregisterPlugin(pluginId);
        },
        toolCount(pluginId) {
            return registry.toolCount(pluginId);
        },
        getRegistry() {
            return registry;
        },
    };
}
//# sourceMappingURL=plugin-tool-dispatcher.js.map