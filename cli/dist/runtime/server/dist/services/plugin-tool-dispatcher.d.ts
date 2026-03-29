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
import type { Db } from "@paperclipai/db";
import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
import type { ToolRunContext } from "@paperclipai/plugin-sdk";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
import type { PluginLifecycleManager } from "./plugin-lifecycle.js";
import { type PluginToolRegistry, type RegisteredTool, type ToolListFilter, type ToolExecutionResult } from "./plugin-tool-registry.js";
/**
 * An agent-facing tool descriptor — the shape returned when agents
 * query for available tools.
 *
 * This is intentionally simpler than `RegisteredTool`, exposing only
 * what agents need to decide whether and how to call a tool.
 */
export interface AgentToolDescriptor {
    /** Fully namespaced tool name (e.g. `"acme.linear:search-issues"`). */
    name: string;
    /** Human-readable display name. */
    displayName: string;
    /** Description for the agent — explains when and how to use this tool. */
    description: string;
    /** JSON Schema describing the tool's input parameters. */
    parametersSchema: Record<string, unknown>;
    /** The plugin that provides this tool. */
    pluginId: string;
}
/**
 * Options for creating the plugin tool dispatcher.
 */
export interface PluginToolDispatcherOptions {
    /** The worker manager used to dispatch RPC calls to plugin workers. */
    workerManager?: PluginWorkerManager;
    /** The lifecycle manager to listen for plugin state changes. */
    lifecycleManager?: PluginLifecycleManager;
    /** Database connection for looking up plugin records. */
    db?: Db;
}
/**
 * The plugin tool dispatcher — the primary integration point between the
 * agent service and the plugin tool system.
 *
 * Agents use this service to:
 * 1. List all available tools (for prompt construction / tool choice)
 * 2. Execute a specific tool by its namespaced name
 *
 * The dispatcher handles lifecycle management internally — when a plugin
 * is loaded or unloaded, its tools are automatically registered or removed.
 */
export interface PluginToolDispatcher {
    /**
     * Initialize the dispatcher — load tools from all currently-ready plugins
     * and start listening for lifecycle events.
     *
     * Must be called once at server startup after the lifecycle manager
     * and worker manager are ready.
     */
    initialize(): Promise<void>;
    /**
     * Tear down the dispatcher — unregister lifecycle event listeners
     * and clear all tool registrations.
     *
     * Called during server shutdown.
     */
    teardown(): void;
    /**
     * List all available tools for agents, optionally filtered.
     *
     * Returns tool descriptors in an agent-friendly format.
     *
     * @param filter - Optional filter criteria
     * @returns Array of agent tool descriptors
     */
    listToolsForAgent(filter?: ToolListFilter): AgentToolDescriptor[];
    /**
     * Look up a tool by its namespaced name.
     *
     * @param namespacedName - e.g. `"acme.linear:search-issues"`
     * @returns The registered tool, or `null` if not found
     */
    getTool(namespacedName: string): RegisteredTool | null;
    /**
     * Execute a tool by its namespaced name, routing to the correct
     * plugin worker.
     *
     * @param namespacedName - Fully qualified tool name
     * @param parameters - Input parameters matching the tool's schema
     * @param runContext - Agent run context
     * @returns The execution result with routing metadata
     * @throws {Error} if the tool is not found, the worker is not running,
     *   or the tool execution fails
     */
    executeTool(namespacedName: string, parameters: unknown, runContext: ToolRunContext): Promise<ToolExecutionResult>;
    /**
     * Register all tools from a plugin manifest.
     *
     * This is called automatically when a plugin transitions to `ready`.
     * Can also be called manually for testing or recovery scenarios.
     *
     * @param pluginId - The plugin's unique identifier
     * @param manifest - The plugin manifest containing tool declarations
     */
    registerPluginTools(pluginId: string, manifest: PaperclipPluginManifestV1): void;
    /**
     * Unregister all tools for a plugin.
     *
     * Called automatically when a plugin is disabled or unloaded.
     *
     * @param pluginId - The plugin to unregister
     */
    unregisterPluginTools(pluginId: string): void;
    /**
     * Get the total number of registered tools, optionally scoped to a plugin.
     *
     * @param pluginId - If provided, count only this plugin's tools
     */
    toolCount(pluginId?: string): number;
    /**
     * Access the underlying tool registry for advanced operations.
     *
     * This escape hatch exists for internal use (e.g. diagnostics).
     * Prefer the dispatcher's own methods for normal operations.
     */
    getRegistry(): PluginToolRegistry;
}
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
export declare function createPluginToolDispatcher(options?: PluginToolDispatcherOptions): PluginToolDispatcher;
//# sourceMappingURL=plugin-tool-dispatcher.d.ts.map