/**
 * Host-side client factory — creates capability-gated handler maps for
 * servicing worker→host JSON-RPC calls.
 *
 * When a plugin worker calls `ctx.state.get(...)` inside its process, the
 * SDK serializes the call as a JSON-RPC request over stdio. On the host side,
 * the `PluginWorkerManager` receives the request and dispatches it to the
 * handler registered for that method. This module provides a factory that
 * creates those handlers for all `WorkerToHostMethods`, with automatic
 * capability enforcement.
 *
 * ## Design
 *
 * 1. **Capability gating**: Each handler checks the plugin's declared
 *    capabilities before executing. If the plugin lacks a required capability,
 *    the handler throws a `CapabilityDeniedError` (which the worker manager
 *    translates into a JSON-RPC error response with code
 *    `CAPABILITY_DENIED`).
 *
 * 2. **Service adapters**: The caller provides a `HostServices` object with
 *    concrete implementations of each platform service. The factory wires
 *    each handler to the appropriate service method.
 *
 * 3. **Type safety**: The returned handler map is typed as
 *    `WorkerToHostHandlers` (from `plugin-worker-manager.ts`) so it plugs
 *    directly into `WorkerStartOptions.hostHandlers`.
 *
 * @example
 * ```ts
 * const handlers = createHostClientHandlers({
 *   pluginId: "acme.linear",
 *   capabilities: manifest.capabilities,
 *   services: {
 *     config:    { get: () => registry.getConfig(pluginId) },
 *     state:     { get: ..., set: ..., delete: ... },
 *     entities:  { upsert: ..., list: ... },
 *     // ... all services
 *   },
 * });
 *
 * await workerManager.startWorker("acme.linear", {
 *   // ...
 *   hostHandlers: handlers,
 * });
 * ```
 *
 * @see PLUGIN_SPEC.md §13 — Host-Worker Protocol
 * @see PLUGIN_SPEC.md §15 — Capability Model
 */
import { PLUGIN_RPC_ERROR_CODES } from "./protocol.js";
// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------
/**
 * Thrown when a plugin calls a host method it does not have the capability for.
 *
 * The `code` field is set to `PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED` so
 * the worker manager can propagate it as the correct JSON-RPC error code.
 */
export class CapabilityDeniedError extends Error {
    name = "CapabilityDeniedError";
    code = PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED;
    constructor(pluginId, method, capability) {
        super(`Plugin "${pluginId}" is missing required capability "${capability}" for method "${method}"`);
    }
}
// ---------------------------------------------------------------------------
// Capability → method mapping
// ---------------------------------------------------------------------------
/**
 * Maps each worker→host RPC method to the capability required to invoke it.
 * Methods without a capability requirement (e.g. `config.get`, `log`) are
 * mapped to `null`.
 *
 * @see PLUGIN_SPEC.md §15 — Capability Model
 */
const METHOD_CAPABILITY_MAP = {
    // Config — always allowed
    "config.get": null,
    // State
    "state.get": "plugin.state.read",
    "state.set": "plugin.state.write",
    "state.delete": "plugin.state.write",
    // Entities — no specific capability required (plugin-scoped by design)
    "entities.upsert": null,
    "entities.list": null,
    // Events
    "events.emit": "events.emit",
    "events.subscribe": "events.subscribe",
    // HTTP
    "http.fetch": "http.outbound",
    // Secrets
    "secrets.resolve": "secrets.read-ref",
    // Activity
    "activity.log": "activity.log.write",
    // Metrics
    "metrics.write": "metrics.write",
    // Logger — always allowed
    "log": null,
    // Companies
    "companies.list": "companies.read",
    "companies.get": "companies.read",
    // Projects
    "projects.list": "projects.read",
    "projects.get": "projects.read",
    "projects.listWorkspaces": "project.workspaces.read",
    "projects.getPrimaryWorkspace": "project.workspaces.read",
    "projects.getWorkspaceForIssue": "project.workspaces.read",
    // Issues
    "issues.list": "issues.read",
    "issues.get": "issues.read",
    "issues.create": "issues.create",
    "issues.update": "issues.update",
    "issues.listComments": "issue.comments.read",
    "issues.createComment": "issue.comments.create",
    // Issue Documents
    "issues.documents.list": "issue.documents.read",
    "issues.documents.get": "issue.documents.read",
    "issues.documents.upsert": "issue.documents.write",
    "issues.documents.delete": "issue.documents.write",
    // Agents
    "agents.list": "agents.read",
    "agents.get": "agents.read",
    "agents.pause": "agents.pause",
    "agents.resume": "agents.resume",
    "agents.invoke": "agents.invoke",
    // Agent Sessions
    "agents.sessions.create": "agent.sessions.create",
    "agents.sessions.list": "agent.sessions.list",
    "agents.sessions.sendMessage": "agent.sessions.send",
    "agents.sessions.close": "agent.sessions.close",
    // Goals
    "goals.list": "goals.read",
    "goals.get": "goals.read",
    "goals.create": "goals.create",
    "goals.update": "goals.update",
};
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
/**
 * Create a complete handler map for all worker→host JSON-RPC methods.
 *
 * Each handler:
 * 1. Checks the plugin's declared capabilities against the required capability
 *    for the method (if any).
 * 2. Delegates to the corresponding service adapter method.
 * 3. Returns the service result, which is serialized as the JSON-RPC response
 *    by the worker manager.
 *
 * If a capability check fails, the handler throws a `CapabilityDeniedError`
 * with code `CAPABILITY_DENIED`. The worker manager catches this and sends a
 * JSON-RPC error response to the worker, which surfaces as a `JsonRpcCallError`
 * in the plugin's SDK client.
 *
 * @param options - Plugin ID, capabilities, and service adapters
 * @returns A handler map suitable for `WorkerStartOptions.hostHandlers`
 */
export function createHostClientHandlers(options) {
    const { pluginId, services } = options;
    const capabilitySet = new Set(options.capabilities);
    /**
     * Assert that the plugin has the required capability for a method.
     * Throws `CapabilityDeniedError` if the capability is missing.
     */
    function requireCapability(method) {
        const required = METHOD_CAPABILITY_MAP[method];
        if (required === null)
            return; // No capability required
        if (capabilitySet.has(required))
            return;
        throw new CapabilityDeniedError(pluginId, method, required);
    }
    /**
     * Create a capability-gated proxy handler for a method.
     *
     * @param method - The RPC method name (used for capability lookup)
     * @param handler - The actual handler implementation
     * @returns A wrapper that checks capabilities before delegating
     */
    function gated(method, handler) {
        return async (params) => {
            requireCapability(method);
            return handler(params);
        };
    }
    // -------------------------------------------------------------------------
    // Build the complete handler map
    // -------------------------------------------------------------------------
    return {
        // Config
        "config.get": gated("config.get", async () => {
            return services.config.get();
        }),
        // State
        "state.get": gated("state.get", async (params) => {
            return services.state.get(params);
        }),
        "state.set": gated("state.set", async (params) => {
            return services.state.set(params);
        }),
        "state.delete": gated("state.delete", async (params) => {
            return services.state.delete(params);
        }),
        // Entities
        "entities.upsert": gated("entities.upsert", async (params) => {
            return services.entities.upsert(params);
        }),
        "entities.list": gated("entities.list", async (params) => {
            return services.entities.list(params);
        }),
        // Events
        "events.emit": gated("events.emit", async (params) => {
            return services.events.emit(params);
        }),
        "events.subscribe": gated("events.subscribe", async (params) => {
            return services.events.subscribe(params);
        }),
        // HTTP
        "http.fetch": gated("http.fetch", async (params) => {
            return services.http.fetch(params);
        }),
        // Secrets
        "secrets.resolve": gated("secrets.resolve", async (params) => {
            return services.secrets.resolve(params);
        }),
        // Activity
        "activity.log": gated("activity.log", async (params) => {
            return services.activity.log(params);
        }),
        // Metrics
        "metrics.write": gated("metrics.write", async (params) => {
            return services.metrics.write(params);
        }),
        // Logger
        "log": gated("log", async (params) => {
            return services.logger.log(params);
        }),
        // Companies
        "companies.list": gated("companies.list", async (params) => {
            return services.companies.list(params);
        }),
        "companies.get": gated("companies.get", async (params) => {
            return services.companies.get(params);
        }),
        // Projects
        "projects.list": gated("projects.list", async (params) => {
            return services.projects.list(params);
        }),
        "projects.get": gated("projects.get", async (params) => {
            return services.projects.get(params);
        }),
        "projects.listWorkspaces": gated("projects.listWorkspaces", async (params) => {
            return services.projects.listWorkspaces(params);
        }),
        "projects.getPrimaryWorkspace": gated("projects.getPrimaryWorkspace", async (params) => {
            return services.projects.getPrimaryWorkspace(params);
        }),
        "projects.getWorkspaceForIssue": gated("projects.getWorkspaceForIssue", async (params) => {
            return services.projects.getWorkspaceForIssue(params);
        }),
        // Issues
        "issues.list": gated("issues.list", async (params) => {
            return services.issues.list(params);
        }),
        "issues.get": gated("issues.get", async (params) => {
            return services.issues.get(params);
        }),
        "issues.create": gated("issues.create", async (params) => {
            return services.issues.create(params);
        }),
        "issues.update": gated("issues.update", async (params) => {
            return services.issues.update(params);
        }),
        "issues.listComments": gated("issues.listComments", async (params) => {
            return services.issues.listComments(params);
        }),
        "issues.createComment": gated("issues.createComment", async (params) => {
            return services.issues.createComment(params);
        }),
        // Issue Documents
        "issues.documents.list": gated("issues.documents.list", async (params) => {
            return services.issueDocuments.list(params);
        }),
        "issues.documents.get": gated("issues.documents.get", async (params) => {
            return services.issueDocuments.get(params);
        }),
        "issues.documents.upsert": gated("issues.documents.upsert", async (params) => {
            return services.issueDocuments.upsert(params);
        }),
        "issues.documents.delete": gated("issues.documents.delete", async (params) => {
            return services.issueDocuments.delete(params);
        }),
        // Agents
        "agents.list": gated("agents.list", async (params) => {
            return services.agents.list(params);
        }),
        "agents.get": gated("agents.get", async (params) => {
            return services.agents.get(params);
        }),
        "agents.pause": gated("agents.pause", async (params) => {
            return services.agents.pause(params);
        }),
        "agents.resume": gated("agents.resume", async (params) => {
            return services.agents.resume(params);
        }),
        "agents.invoke": gated("agents.invoke", async (params) => {
            return services.agents.invoke(params);
        }),
        // Agent Sessions
        "agents.sessions.create": gated("agents.sessions.create", async (params) => {
            return services.agentSessions.create(params);
        }),
        "agents.sessions.list": gated("agents.sessions.list", async (params) => {
            return services.agentSessions.list(params);
        }),
        "agents.sessions.sendMessage": gated("agents.sessions.sendMessage", async (params) => {
            return services.agentSessions.sendMessage(params);
        }),
        "agents.sessions.close": gated("agents.sessions.close", async (params) => {
            return services.agentSessions.close(params);
        }),
        // Goals
        "goals.list": gated("goals.list", async (params) => {
            return services.goals.list(params);
        }),
        "goals.get": gated("goals.get", async (params) => {
            return services.goals.get(params);
        }),
        "goals.create": gated("goals.create", async (params) => {
            return services.goals.create(params);
        }),
        "goals.update": gated("goals.update", async (params) => {
            return services.goals.update(params);
        }),
    };
}
// ---------------------------------------------------------------------------
// Utility: getRequiredCapability
// ---------------------------------------------------------------------------
/**
 * Get the capability required for a given worker→host method, or `null` if
 * no capability is required.
 *
 * Useful for inspecting capability requirements without calling the factory.
 *
 * @param method - The worker→host method name
 * @returns The required capability, or `null`
 */
export function getRequiredCapability(method) {
    return METHOD_CAPABILITY_MAP[method];
}
//# sourceMappingURL=host-client-factory.js.map