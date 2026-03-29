/**
 * PluginToolRegistry — host-side registry for plugin-contributed agent tools.
 *
 * Responsibilities:
 * - Store tool declarations (from plugin manifests) alongside routing metadata
 *   so the host can resolve namespaced tool names to the owning plugin worker.
 * - Namespace tools automatically: a tool `"search-issues"` from plugin
 *   `"acme.linear"` is exposed to agents as `"acme.linear:search-issues"`.
 * - Route `executeTool` calls to the correct plugin worker via the
 *   `PluginWorkerManager`.
 * - Provide tool discovery queries so agents can list available tools.
 * - Clean up tool registrations when a plugin is unloaded or its worker stops.
 *
 * The registry is an in-memory structure — tool declarations are derived from
 * the plugin manifest at load time and do not need persistence. When a plugin
 * worker restarts, the host re-registers its manifest tools.
 *
 * @see PLUGIN_SPEC.md §11 — Agent Tools
 * @see PLUGIN_SPEC.md §13.10 — `executeTool`
 */
import { logger } from "../middleware/logger.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * Separator between plugin ID and tool name in the namespaced tool identifier.
 *
 * Example: `"acme.linear:search-issues"`
 */
export const TOOL_NAMESPACE_SEPARATOR = ":";
// ---------------------------------------------------------------------------
// Factory: createPluginToolRegistry
// ---------------------------------------------------------------------------
/**
 * Create a new `PluginToolRegistry`.
 *
 * The registry is backed by two in-memory maps:
 * - `byNamespace`: namespaced name → `RegisteredTool` for O(1) lookups.
 * - `byPlugin`: pluginId → Set of namespaced names for efficient per-plugin ops.
 *
 * @param workerManager - The worker manager used to dispatch `executeTool` RPC
 *   calls to plugin workers. If not provided, `executeTool` will throw.
 *
 * @example
 * ```ts
 * const toolRegistry = createPluginToolRegistry(workerManager);
 *
 * // Register tools from a plugin manifest
 * toolRegistry.registerPlugin("acme.linear", linearManifest);
 *
 * // List all available tools for agents
 * const tools = toolRegistry.listTools();
 * // → [{ namespacedName: "acme.linear:search-issues", ... }]
 *
 * // Execute a tool
 * const result = await toolRegistry.executeTool(
 *   "acme.linear:search-issues",
 *   { query: "auth bug" },
 *   { agentId: "agent-1", runId: "run-1", companyId: "co-1", projectId: "proj-1" },
 * );
 * ```
 */
export function createPluginToolRegistry(workerManager) {
    const log = logger.child({ service: "plugin-tool-registry" });
    // Primary index: namespaced name → tool entry
    const byNamespace = new Map();
    // Secondary index: pluginId → set of namespaced names (for bulk operations)
    const byPlugin = new Map();
    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------
    function buildName(pluginId, toolName) {
        return `${pluginId}${TOOL_NAMESPACE_SEPARATOR}${toolName}`;
    }
    function parseName(namespacedName) {
        const sepIndex = namespacedName.lastIndexOf(TOOL_NAMESPACE_SEPARATOR);
        if (sepIndex <= 0 || sepIndex >= namespacedName.length - 1) {
            return null;
        }
        return {
            pluginId: namespacedName.slice(0, sepIndex),
            toolName: namespacedName.slice(sepIndex + 1),
        };
    }
    function addTool(pluginId, decl, pluginDbId) {
        const namespacedName = buildName(pluginId, decl.name);
        const entry = {
            pluginId,
            pluginDbId,
            name: decl.name,
            namespacedName,
            displayName: decl.displayName,
            description: decl.description,
            parametersSchema: decl.parametersSchema,
        };
        byNamespace.set(namespacedName, entry);
        let pluginTools = byPlugin.get(pluginId);
        if (!pluginTools) {
            pluginTools = new Set();
            byPlugin.set(pluginId, pluginTools);
        }
        pluginTools.add(namespacedName);
    }
    function removePluginTools(pluginId) {
        const pluginTools = byPlugin.get(pluginId);
        if (!pluginTools)
            return 0;
        const count = pluginTools.size;
        for (const name of pluginTools) {
            byNamespace.delete(name);
        }
        byPlugin.delete(pluginId);
        return count;
    }
    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    return {
        registerPlugin(pluginId, manifest, pluginDbId) {
            const dbId = pluginDbId ?? pluginId;
            // Remove any previously registered tools for this plugin (idempotent)
            const previousCount = removePluginTools(pluginId);
            if (previousCount > 0) {
                log.debug({ pluginId, previousCount }, "cleared previous tool registrations before re-registering");
            }
            const tools = manifest.tools ?? [];
            if (tools.length === 0) {
                log.debug({ pluginId }, "plugin declares no tools");
                return;
            }
            for (const decl of tools) {
                addTool(pluginId, decl, dbId);
            }
            log.info({
                pluginId,
                toolCount: tools.length,
                tools: tools.map((t) => buildName(pluginId, t.name)),
            }, `registered ${tools.length} tool(s) for plugin`);
        },
        unregisterPlugin(pluginId) {
            const removed = removePluginTools(pluginId);
            if (removed > 0) {
                log.info({ pluginId, removedCount: removed }, `unregistered ${removed} tool(s) for plugin`);
            }
        },
        getTool(namespacedName) {
            return byNamespace.get(namespacedName) ?? null;
        },
        getToolByPlugin(pluginId, toolName) {
            const namespacedName = buildName(pluginId, toolName);
            return byNamespace.get(namespacedName) ?? null;
        },
        listTools(filter) {
            if (filter?.pluginId) {
                const pluginTools = byPlugin.get(filter.pluginId);
                if (!pluginTools)
                    return [];
                const result = [];
                for (const name of pluginTools) {
                    const tool = byNamespace.get(name);
                    if (tool)
                        result.push(tool);
                }
                return result;
            }
            return Array.from(byNamespace.values());
        },
        parseNamespacedName(namespacedName) {
            return parseName(namespacedName);
        },
        buildNamespacedName(pluginId, toolName) {
            return buildName(pluginId, toolName);
        },
        async executeTool(namespacedName, parameters, runContext) {
            // 1. Resolve the namespaced name
            const parsed = parseName(namespacedName);
            if (!parsed) {
                throw new Error(`Invalid tool name "${namespacedName}". Expected format: "<pluginId>${TOOL_NAMESPACE_SEPARATOR}<toolName>"`);
            }
            const { pluginId, toolName } = parsed;
            // 2. Verify the tool is registered
            const tool = byNamespace.get(namespacedName);
            if (!tool) {
                throw new Error(`Tool "${namespacedName}" is not registered. ` +
                    `The plugin may not be installed or its worker may not be running.`);
            }
            // 3. Verify the worker manager is available
            if (!workerManager) {
                throw new Error(`Cannot execute tool "${namespacedName}" — no worker manager configured. ` +
                    `Tool execution requires a PluginWorkerManager.`);
            }
            // 4. Verify the plugin worker is running (use DB UUID for worker lookup)
            const dbId = tool.pluginDbId;
            if (!workerManager.isRunning(dbId)) {
                throw new Error(`Cannot execute tool "${namespacedName}" — ` +
                    `worker for plugin "${pluginId}" is not running.`);
            }
            // 5. Dispatch the executeTool RPC call to the worker
            log.debug({ pluginId, pluginDbId: dbId, toolName, namespacedName, agentId: runContext.agentId, runId: runContext.runId }, "executing tool via plugin worker");
            const rpcParams = {
                toolName,
                parameters,
                runContext,
            };
            const result = await workerManager.call(dbId, "executeTool", rpcParams);
            log.debug({
                pluginId,
                toolName,
                namespacedName,
                hasContent: !!result.content,
                hasData: result.data !== undefined,
                hasError: !!result.error,
            }, "tool execution completed");
            return { pluginId, toolName, result };
        },
        toolCount(pluginId) {
            if (pluginId !== undefined) {
                return byPlugin.get(pluginId)?.size ?? 0;
            }
            return byNamespace.size;
        },
    };
}
//# sourceMappingURL=plugin-tool-registry.js.map