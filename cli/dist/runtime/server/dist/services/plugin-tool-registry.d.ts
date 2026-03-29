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
import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
import type { ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
/**
 * Separator between plugin ID and tool name in the namespaced tool identifier.
 *
 * Example: `"acme.linear:search-issues"`
 */
export declare const TOOL_NAMESPACE_SEPARATOR = ":";
/**
 * A registered tool entry stored in the registry.
 *
 * Combines the manifest-level declaration with routing metadata so the host
 * can resolve a namespaced tool name → plugin worker in O(1).
 */
export interface RegisteredTool {
    /** The plugin key used for namespacing (e.g. `"acme.linear"`). */
    pluginId: string;
    /**
     * The plugin's database UUID, used for worker routing and availability
     * checks. Falls back to `pluginId` when not provided (e.g. in tests
     * where `id === pluginKey`).
     */
    pluginDbId: string;
    /** The tool's bare name (without namespace prefix). */
    name: string;
    /** Fully namespaced identifier: `"<pluginId>:<toolName>"`. */
    namespacedName: string;
    /** Human-readable display name. */
    displayName: string;
    /** Description provided to the agent so it knows when to use this tool. */
    description: string;
    /** JSON Schema describing the tool's input parameters. */
    parametersSchema: Record<string, unknown>;
}
/**
 * Filter criteria for listing available tools.
 */
export interface ToolListFilter {
    /** Only return tools owned by this plugin. */
    pluginId?: string;
}
/**
 * Result of executing a tool, extending `ToolResult` with routing metadata.
 */
export interface ToolExecutionResult {
    /** The plugin that handled the tool call. */
    pluginId: string;
    /** The bare tool name that was executed. */
    toolName: string;
    /** The result returned by the plugin's tool handler. */
    result: ToolResult;
}
/**
 * The host-side tool registry — held by the host process.
 *
 * Created once at server startup and shared across the application. Plugins
 * register their tools when their worker starts, and unregister when the
 * worker stops or the plugin is uninstalled.
 */
export interface PluginToolRegistry {
    /**
     * Register all tools declared in a plugin's manifest.
     *
     * Called when a plugin worker starts and its manifest is loaded. Any
     * previously registered tools for the same plugin are replaced (idempotent).
     *
     * @param pluginId - The plugin's unique identifier (e.g. `"acme.linear"`)
     * @param manifest - The plugin manifest containing the `tools` array
     * @param pluginDbId - The plugin's database UUID, used for worker routing
     *   and availability checks. If omitted, `pluginId` is used (backwards-compat).
     */
    registerPlugin(pluginId: string, manifest: PaperclipPluginManifestV1, pluginDbId?: string): void;
    /**
     * Remove all tool registrations for a plugin.
     *
     * Called when a plugin worker stops, crashes, or is uninstalled.
     *
     * @param pluginId - The plugin to clear
     */
    unregisterPlugin(pluginId: string): void;
    /**
     * Look up a registered tool by its namespaced name.
     *
     * @param namespacedName - Fully qualified name, e.g. `"acme.linear:search-issues"`
     * @returns The registered tool entry, or `null` if not found
     */
    getTool(namespacedName: string): RegisteredTool | null;
    /**
     * Look up a registered tool by plugin ID and bare tool name.
     *
     * @param pluginId - The owning plugin
     * @param toolName - The bare tool name (without namespace prefix)
     * @returns The registered tool entry, or `null` if not found
     */
    getToolByPlugin(pluginId: string, toolName: string): RegisteredTool | null;
    /**
     * List all registered tools, optionally filtered.
     *
     * @param filter - Optional filter criteria
     * @returns Array of registered tool entries
     */
    listTools(filter?: ToolListFilter): RegisteredTool[];
    /**
     * Parse a namespaced tool name into plugin ID and bare tool name.
     *
     * @param namespacedName - e.g. `"acme.linear:search-issues"`
     * @returns `{ pluginId, toolName }` or `null` if the format is invalid
     */
    parseNamespacedName(namespacedName: string): {
        pluginId: string;
        toolName: string;
    } | null;
    /**
     * Build a namespaced tool name from a plugin ID and bare tool name.
     *
     * @param pluginId - e.g. `"acme.linear"`
     * @param toolName - e.g. `"search-issues"`
     * @returns The namespaced name, e.g. `"acme.linear:search-issues"`
     */
    buildNamespacedName(pluginId: string, toolName: string): string;
    /**
     * Execute a tool by its namespaced name, routing to the correct plugin worker.
     *
     * Resolves the namespaced name to the owning plugin, validates the tool
     * exists, and dispatches the `executeTool` RPC call to the worker.
     *
     * @param namespacedName - Fully qualified tool name (e.g. `"acme.linear:search-issues"`)
     * @param parameters - The parsed parameters matching the tool's schema
     * @param runContext - Agent run context
     * @returns The execution result with routing metadata
     * @throws {Error} if the tool is not found or the worker is not running
     */
    executeTool(namespacedName: string, parameters: unknown, runContext: ToolRunContext): Promise<ToolExecutionResult>;
    /**
     * Get the number of registered tools, optionally scoped to a plugin.
     *
     * @param pluginId - If provided, count only this plugin's tools
     */
    toolCount(pluginId?: string): number;
}
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
export declare function createPluginToolRegistry(workerManager?: PluginWorkerManager): PluginToolRegistry;
//# sourceMappingURL=plugin-tool-registry.d.ts.map