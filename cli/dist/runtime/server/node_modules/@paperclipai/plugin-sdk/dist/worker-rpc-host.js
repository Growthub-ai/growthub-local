/**
 * Worker-side RPC host — runs inside the child process spawned by the host.
 *
 * This module is the worker-side counterpart to the server's
 * `PluginWorkerManager`. It:
 *
 * 1. Reads newline-delimited JSON-RPC 2.0 requests from **stdin**
 * 2. Dispatches them to the appropriate plugin handler (events, jobs, tools, …)
 * 3. Writes JSON-RPC 2.0 responses back on **stdout**
 * 4. Provides a concrete `PluginContext` whose SDK client methods (e.g.
 *    `ctx.state.get()`, `ctx.events.emit()`) send JSON-RPC requests to the
 *    host on stdout and await responses on stdin.
 *
 * ## Message flow
 *
 * ```
 * Host (parent)                          Worker (this module)
 *   |                                        |
 *   |--- request(initialize) ------------->  |  → calls plugin.setup(ctx)
 *   |<-- response(ok:true) ----------------  |
 *   |                                        |
 *   |--- notification(onEvent) ----------->  |  → dispatches to registered handler
 *   |                                        |
 *   |<-- request(state.get) ---------------  |  ← SDK client call from plugin code
 *   |--- response(result) ---------------->  |
 *   |                                        |
 *   |--- request(shutdown) --------------->  |  → calls plugin.onShutdown()
 *   |<-- response(void) ------------------  |
 *   |                                        (process exits)
 * ```
 *
 * @see PLUGIN_SPEC.md §12 — Process Model
 * @see PLUGIN_SPEC.md §13 — Host-Worker Protocol
 * @see PLUGIN_SPEC.md §14 — SDK Surface
 */
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { JSONRPC_ERROR_CODES, PLUGIN_RPC_ERROR_CODES, createRequest, createSuccessResponse, createErrorResponse, createNotification, parseMessage, serializeMessage, isJsonRpcRequest, isJsonRpcResponse, isJsonRpcNotification, isJsonRpcSuccessResponse, isJsonRpcErrorResponse, JsonRpcParseError, JsonRpcCallError, } from "./protocol.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Default timeout for worker→host RPC calls. */
const DEFAULT_RPC_TIMEOUT_MS = 30_000;
/**
 * Start the worker when this module is the process entrypoint.
 *
 * Call this at the bottom of your worker file so that when the host runs
 * `node dist/worker.js`, the RPC host starts and the process stays alive.
 * When the module is imported (e.g. for re-exports or tests), nothing runs.
 *
 * When `options.stdin` and `options.stdout` are provided (e.g. in tests),
 * the main-module check is skipped and the host is started with those streams.
 *
 * @example
 * ```ts
 * const plugin = definePlugin({ ... });
 * export default plugin;
 * runWorker(plugin, import.meta.url);
 * ```
 */
export function runWorker(plugin, moduleUrl, options) {
    if (options?.stdin != null &&
        options?.stdout != null) {
        return startWorkerRpcHost({
            plugin,
            stdin: options.stdin,
            stdout: options.stdout,
        });
    }
    const entry = process.argv[1];
    if (typeof entry !== "string")
        return;
    const thisFile = path.resolve(fileURLToPath(moduleUrl));
    const entryPath = path.resolve(entry);
    if (thisFile === entryPath) {
        startWorkerRpcHost({ plugin });
    }
}
/**
 * Start the worker-side RPC host.
 *
 * This function is typically called from a thin bootstrap script that is the
 * actual entrypoint of the child process:
 *
 * ```ts
 * // worker-bootstrap.ts
 * import plugin from "./worker.js";
 * import { startWorkerRpcHost } from "@paperclipai/plugin-sdk";
 *
 * startWorkerRpcHost({ plugin });
 * ```
 *
 * The host begins listening on stdin immediately. It does NOT call
 * `plugin.definition.setup()` yet — that happens when the host sends the
 * `initialize` RPC.
 *
 * @returns A handle for inspecting or stopping the RPC host
 */
export function startWorkerRpcHost(options) {
    const { plugin } = options;
    const stdinStream = options.stdin ?? process.stdin;
    const stdoutStream = options.stdout ?? process.stdout;
    const rpcTimeoutMs = options.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    let running = true;
    let initialized = false;
    let manifest = null;
    let currentConfig = {};
    // Plugin handler registrations (populated during setup())
    const eventHandlers = [];
    const jobHandlers = new Map();
    const launcherRegistrations = new Map();
    const dataHandlers = new Map();
    const actionHandlers = new Map();
    const toolHandlers = new Map();
    // Agent session event callbacks (populated by sendMessage, cleared by close)
    const sessionEventCallbacks = new Map();
    // Pending outbound (worker→host) requests
    const pendingRequests = new Map();
    let nextOutboundId = 1;
    const MAX_OUTBOUND_ID = Number.MAX_SAFE_INTEGER - 1;
    // -----------------------------------------------------------------------
    // Outbound messaging (worker → host)
    // -----------------------------------------------------------------------
    function sendMessage(message) {
        if (!running)
            return;
        const serialized = serializeMessage(message);
        stdoutStream.write(serialized);
    }
    /**
     * Send a typed JSON-RPC request to the host and await the response.
     */
    function callHost(method, params, timeoutMs) {
        return new Promise((resolve, reject) => {
            if (!running) {
                reject(new Error(`Cannot call "${method}" — worker RPC host is not running`));
                return;
            }
            if (nextOutboundId >= MAX_OUTBOUND_ID) {
                nextOutboundId = 1;
            }
            const id = nextOutboundId++;
            const timeout = timeoutMs ?? rpcTimeoutMs;
            let settled = false;
            const settle = (fn, value) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                pendingRequests.delete(id);
                fn(value);
            };
            const timer = setTimeout(() => {
                settle(reject, new JsonRpcCallError({
                    code: PLUGIN_RPC_ERROR_CODES.TIMEOUT,
                    message: `Worker→host call "${method}" timed out after ${timeout}ms`,
                }));
            }, timeout);
            pendingRequests.set(id, {
                resolve: (response) => {
                    if (isJsonRpcSuccessResponse(response)) {
                        settle(resolve, response.result);
                    }
                    else if (isJsonRpcErrorResponse(response)) {
                        settle(reject, new JsonRpcCallError(response.error));
                    }
                    else {
                        settle(reject, new Error(`Unexpected response format for "${method}"`));
                    }
                },
                timer,
            });
            try {
                const request = createRequest(method, params, id);
                sendMessage(request);
            }
            catch (err) {
                settle(reject, err instanceof Error ? err : new Error(String(err)));
            }
        });
    }
    /**
     * Send a JSON-RPC notification to the host (fire-and-forget).
     */
    function notifyHost(method, params) {
        try {
            sendMessage(createNotification(method, params));
        }
        catch {
            // Swallow — the host may have closed stdin
        }
    }
    // -----------------------------------------------------------------------
    // Build the PluginContext (SDK surface for plugin code)
    // -----------------------------------------------------------------------
    function buildContext() {
        return {
            get manifest() {
                if (!manifest)
                    throw new Error("Plugin context accessed before initialization");
                return manifest;
            },
            config: {
                async get() {
                    return callHost("config.get", {});
                },
            },
            events: {
                on(name, filterOrFn, maybeFn) {
                    let registration;
                    if (typeof filterOrFn === "function") {
                        registration = { name, fn: filterOrFn };
                    }
                    else {
                        if (!maybeFn)
                            throw new Error("Event handler function is required");
                        registration = { name, filter: filterOrFn, fn: maybeFn };
                    }
                    eventHandlers.push(registration);
                    // Register subscription on the host so events are forwarded to this worker
                    void callHost("events.subscribe", { eventPattern: name, filter: registration.filter ?? null }).catch((err) => {
                        notifyHost("log", {
                            level: "warn",
                            message: `Failed to subscribe to event "${name}" on host: ${err instanceof Error ? err.message : String(err)}`,
                        });
                    });
                    return () => {
                        const idx = eventHandlers.indexOf(registration);
                        if (idx !== -1)
                            eventHandlers.splice(idx, 1);
                    };
                },
                async emit(name, companyId, payload) {
                    await callHost("events.emit", { name, companyId, payload });
                },
            },
            jobs: {
                register(key, fn) {
                    jobHandlers.set(key, fn);
                },
            },
            launchers: {
                register(launcher) {
                    launcherRegistrations.set(launcher.id, launcher);
                },
            },
            http: {
                async fetch(url, init) {
                    const serializedInit = {};
                    if (init) {
                        if (init.method)
                            serializedInit.method = init.method;
                        if (init.headers) {
                            // Normalize headers to a plain object
                            if (init.headers instanceof Headers) {
                                const obj = {};
                                init.headers.forEach((v, k) => { obj[k] = v; });
                                serializedInit.headers = obj;
                            }
                            else if (Array.isArray(init.headers)) {
                                const obj = {};
                                for (const [k, v] of init.headers)
                                    obj[k] = v;
                                serializedInit.headers = obj;
                            }
                            else {
                                serializedInit.headers = init.headers;
                            }
                        }
                        if (init.body !== undefined && init.body !== null) {
                            serializedInit.body = typeof init.body === "string"
                                ? init.body
                                : String(init.body);
                        }
                    }
                    const result = await callHost("http.fetch", {
                        url,
                        init: Object.keys(serializedInit).length > 0 ? serializedInit : undefined,
                    });
                    // Reconstruct a Response-like object from the serialized result
                    return new Response(result.body, {
                        status: result.status,
                        statusText: result.statusText,
                        headers: result.headers,
                    });
                },
            },
            secrets: {
                async resolve(secretRef) {
                    return callHost("secrets.resolve", { secretRef });
                },
            },
            activity: {
                async log(entry) {
                    await callHost("activity.log", {
                        companyId: entry.companyId,
                        message: entry.message,
                        entityType: entry.entityType,
                        entityId: entry.entityId,
                        metadata: entry.metadata,
                    });
                },
            },
            state: {
                async get(input) {
                    return callHost("state.get", {
                        scopeKind: input.scopeKind,
                        scopeId: input.scopeId,
                        namespace: input.namespace,
                        stateKey: input.stateKey,
                    });
                },
                async set(input, value) {
                    await callHost("state.set", {
                        scopeKind: input.scopeKind,
                        scopeId: input.scopeId,
                        namespace: input.namespace,
                        stateKey: input.stateKey,
                        value,
                    });
                },
                async delete(input) {
                    await callHost("state.delete", {
                        scopeKind: input.scopeKind,
                        scopeId: input.scopeId,
                        namespace: input.namespace,
                        stateKey: input.stateKey,
                    });
                },
            },
            entities: {
                async upsert(input) {
                    return callHost("entities.upsert", {
                        entityType: input.entityType,
                        scopeKind: input.scopeKind,
                        scopeId: input.scopeId,
                        externalId: input.externalId,
                        title: input.title,
                        status: input.status,
                        data: input.data,
                    });
                },
                async list(query) {
                    return callHost("entities.list", {
                        entityType: query.entityType,
                        scopeKind: query.scopeKind,
                        scopeId: query.scopeId,
                        externalId: query.externalId,
                        limit: query.limit,
                        offset: query.offset,
                    });
                },
            },
            projects: {
                async list(input) {
                    return callHost("projects.list", {
                        companyId: input.companyId,
                        limit: input.limit,
                        offset: input.offset,
                    });
                },
                async get(projectId, companyId) {
                    return callHost("projects.get", { projectId, companyId });
                },
                async listWorkspaces(projectId, companyId) {
                    return callHost("projects.listWorkspaces", { projectId, companyId });
                },
                async getPrimaryWorkspace(projectId, companyId) {
                    return callHost("projects.getPrimaryWorkspace", { projectId, companyId });
                },
                async getWorkspaceForIssue(issueId, companyId) {
                    return callHost("projects.getWorkspaceForIssue", { issueId, companyId });
                },
            },
            companies: {
                async list(input) {
                    return callHost("companies.list", {
                        limit: input?.limit,
                        offset: input?.offset,
                    });
                },
                async get(companyId) {
                    return callHost("companies.get", { companyId });
                },
            },
            issues: {
                async list(input) {
                    return callHost("issues.list", {
                        companyId: input.companyId,
                        projectId: input.projectId,
                        assigneeAgentId: input.assigneeAgentId,
                        status: input.status,
                        limit: input.limit,
                        offset: input.offset,
                    });
                },
                async get(issueId, companyId) {
                    return callHost("issues.get", { issueId, companyId });
                },
                async create(input) {
                    return callHost("issues.create", {
                        companyId: input.companyId,
                        projectId: input.projectId,
                        goalId: input.goalId,
                        parentId: input.parentId,
                        title: input.title,
                        description: input.description,
                        priority: input.priority,
                        assigneeAgentId: input.assigneeAgentId,
                    });
                },
                async update(issueId, patch, companyId) {
                    return callHost("issues.update", {
                        issueId,
                        patch: patch,
                        companyId,
                    });
                },
                async listComments(issueId, companyId) {
                    return callHost("issues.listComments", { issueId, companyId });
                },
                async createComment(issueId, body, companyId) {
                    return callHost("issues.createComment", { issueId, body, companyId });
                },
                documents: {
                    async list(issueId, companyId) {
                        return callHost("issues.documents.list", { issueId, companyId });
                    },
                    async get(issueId, key, companyId) {
                        return callHost("issues.documents.get", { issueId, key, companyId });
                    },
                    async upsert(input) {
                        return callHost("issues.documents.upsert", {
                            issueId: input.issueId,
                            key: input.key,
                            body: input.body,
                            companyId: input.companyId,
                            title: input.title,
                            format: input.format,
                            changeSummary: input.changeSummary,
                        });
                    },
                    async delete(issueId, key, companyId) {
                        return callHost("issues.documents.delete", { issueId, key, companyId });
                    },
                },
            },
            agents: {
                async list(input) {
                    return callHost("agents.list", {
                        companyId: input.companyId,
                        status: input.status,
                        limit: input.limit,
                        offset: input.offset,
                    });
                },
                async get(agentId, companyId) {
                    return callHost("agents.get", { agentId, companyId });
                },
                async pause(agentId, companyId) {
                    return callHost("agents.pause", { agentId, companyId });
                },
                async resume(agentId, companyId) {
                    return callHost("agents.resume", { agentId, companyId });
                },
                async invoke(agentId, companyId, opts) {
                    return callHost("agents.invoke", { agentId, companyId, prompt: opts.prompt, reason: opts.reason });
                },
                sessions: {
                    async create(agentId, companyId, opts) {
                        return callHost("agents.sessions.create", {
                            agentId,
                            companyId,
                            taskKey: opts?.taskKey,
                            reason: opts?.reason,
                        });
                    },
                    async list(agentId, companyId) {
                        return callHost("agents.sessions.list", { agentId, companyId });
                    },
                    async sendMessage(sessionId, companyId, opts) {
                        if (opts.onEvent) {
                            sessionEventCallbacks.set(sessionId, opts.onEvent);
                        }
                        try {
                            return await callHost("agents.sessions.sendMessage", {
                                sessionId,
                                companyId,
                                prompt: opts.prompt,
                                reason: opts.reason,
                            });
                        }
                        catch (err) {
                            sessionEventCallbacks.delete(sessionId);
                            throw err;
                        }
                    },
                    async close(sessionId, companyId) {
                        sessionEventCallbacks.delete(sessionId);
                        await callHost("agents.sessions.close", { sessionId, companyId });
                    },
                },
            },
            goals: {
                async list(input) {
                    return callHost("goals.list", {
                        companyId: input.companyId,
                        level: input.level,
                        status: input.status,
                        limit: input.limit,
                        offset: input.offset,
                    });
                },
                async get(goalId, companyId) {
                    return callHost("goals.get", { goalId, companyId });
                },
                async create(input) {
                    return callHost("goals.create", {
                        companyId: input.companyId,
                        title: input.title,
                        description: input.description,
                        level: input.level,
                        status: input.status,
                        parentId: input.parentId,
                        ownerAgentId: input.ownerAgentId,
                    });
                },
                async update(goalId, patch, companyId) {
                    return callHost("goals.update", {
                        goalId,
                        patch: patch,
                        companyId,
                    });
                },
            },
            data: {
                register(key, handler) {
                    dataHandlers.set(key, handler);
                },
            },
            actions: {
                register(key, handler) {
                    actionHandlers.set(key, handler);
                },
            },
            streams: (() => {
                // Track channel → companyId so emit/close don't require companyId
                const channelCompanyMap = new Map();
                return {
                    open(channel, companyId) {
                        channelCompanyMap.set(channel, companyId);
                        notifyHost("streams.open", { channel, companyId });
                    },
                    emit(channel, event) {
                        const companyId = channelCompanyMap.get(channel) ?? "";
                        notifyHost("streams.emit", { channel, companyId, event });
                    },
                    close(channel) {
                        const companyId = channelCompanyMap.get(channel) ?? "";
                        channelCompanyMap.delete(channel);
                        notifyHost("streams.close", { channel, companyId });
                    },
                };
            })(),
            tools: {
                register(name, declaration, fn) {
                    toolHandlers.set(name, { declaration, fn });
                },
            },
            metrics: {
                async write(name, value, tags) {
                    await callHost("metrics.write", { name, value, tags });
                },
            },
            logger: {
                info(message, meta) {
                    notifyHost("log", { level: "info", message, meta });
                },
                warn(message, meta) {
                    notifyHost("log", { level: "warn", message, meta });
                },
                error(message, meta) {
                    notifyHost("log", { level: "error", message, meta });
                },
                debug(message, meta) {
                    notifyHost("log", { level: "debug", message, meta });
                },
            },
        };
    }
    const ctx = buildContext();
    // -----------------------------------------------------------------------
    // Inbound message handling (host → worker)
    // -----------------------------------------------------------------------
    /**
     * Handle an incoming JSON-RPC request from the host.
     *
     * Dispatches to the correct handler based on the method name.
     */
    async function handleHostRequest(request) {
        const { id, method, params } = request;
        try {
            const result = await dispatchMethod(method, params);
            sendMessage(createSuccessResponse(id, result ?? null));
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            // Propagate specific error codes from handler errors (e.g.
            // METHOD_NOT_FOUND, METHOD_NOT_IMPLEMENTED) — fall back to
            // WORKER_ERROR for untyped exceptions.
            const errorCode = typeof err?.code === "number"
                ? err.code
                : PLUGIN_RPC_ERROR_CODES.WORKER_ERROR;
            sendMessage(createErrorResponse(id, errorCode, errorMessage));
        }
    }
    /**
     * Dispatch a host→worker method call to the appropriate handler.
     */
    async function dispatchMethod(method, params) {
        switch (method) {
            case "initialize":
                return handleInitialize(params);
            case "health":
                return handleHealth();
            case "shutdown":
                return handleShutdown();
            case "validateConfig":
                return handleValidateConfig(params);
            case "configChanged":
                return handleConfigChanged(params);
            case "onEvent":
                return handleOnEvent(params);
            case "runJob":
                return handleRunJob(params);
            case "handleWebhook":
                return handleWebhook(params);
            case "getData":
                return handleGetData(params);
            case "performAction":
                return handlePerformAction(params);
            case "executeTool":
                return handleExecuteTool(params);
            default:
                throw Object.assign(new Error(`Unknown method: ${method}`), { code: JSONRPC_ERROR_CODES.METHOD_NOT_FOUND });
        }
    }
    // -----------------------------------------------------------------------
    // Host→Worker method handlers
    // -----------------------------------------------------------------------
    async function handleInitialize(params) {
        if (initialized) {
            throw new Error("Worker already initialized");
        }
        manifest = params.manifest;
        currentConfig = params.config;
        // Call the plugin's setup function
        await plugin.definition.setup(ctx);
        initialized = true;
        // Report which optional methods this plugin implements
        const supportedMethods = [];
        if (plugin.definition.onValidateConfig)
            supportedMethods.push("validateConfig");
        if (plugin.definition.onConfigChanged)
            supportedMethods.push("configChanged");
        if (plugin.definition.onHealth)
            supportedMethods.push("health");
        if (plugin.definition.onShutdown)
            supportedMethods.push("shutdown");
        return { ok: true, supportedMethods };
    }
    async function handleHealth() {
        if (plugin.definition.onHealth) {
            return plugin.definition.onHealth();
        }
        // Default: report OK if the worker is alive
        return { status: "ok" };
    }
    async function handleShutdown() {
        if (plugin.definition.onShutdown) {
            await plugin.definition.onShutdown();
        }
        // Schedule cleanup after we send the response.
        // Use setImmediate to let the response flush before exiting.
        // Only call process.exit() when running with real process streams.
        // When custom streams are provided (tests), just clean up.
        setImmediate(() => {
            cleanup();
            if (!options.stdin && !options.stdout) {
                process.exit(0);
            }
        });
    }
    async function handleValidateConfig(params) {
        if (!plugin.definition.onValidateConfig) {
            throw Object.assign(new Error("validateConfig is not implemented by this plugin"), { code: PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED });
        }
        return plugin.definition.onValidateConfig(params.config);
    }
    async function handleConfigChanged(params) {
        currentConfig = params.config;
        if (plugin.definition.onConfigChanged) {
            await plugin.definition.onConfigChanged(params.config);
        }
    }
    async function handleOnEvent(params) {
        const event = params.event;
        for (const registration of eventHandlers) {
            // Check event type match
            const exactMatch = registration.name === event.eventType;
            const wildcardPluginAll = registration.name === "plugin.*" &&
                event.eventType.startsWith("plugin.");
            const wildcardPluginOne = registration.name.endsWith(".*") &&
                event.eventType.startsWith(registration.name.slice(0, -1));
            if (!exactMatch && !wildcardPluginAll && !wildcardPluginOne)
                continue;
            // Check filter
            if (registration.filter && !allowsEvent(registration.filter, event))
                continue;
            try {
                await registration.fn(event);
            }
            catch (err) {
                // Log error but continue processing other handlers so one failing
                // handler doesn't prevent the rest from running.
                notifyHost("log", {
                    level: "error",
                    message: `Event handler for "${registration.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
                    meta: { eventType: event.eventType, stack: err instanceof Error ? err.stack : undefined },
                });
            }
        }
    }
    async function handleRunJob(params) {
        const handler = jobHandlers.get(params.job.jobKey);
        if (!handler) {
            throw new Error(`No handler registered for job "${params.job.jobKey}"`);
        }
        await handler(params.job);
    }
    async function handleWebhook(params) {
        if (!plugin.definition.onWebhook) {
            throw Object.assign(new Error("handleWebhook is not implemented by this plugin"), { code: PLUGIN_RPC_ERROR_CODES.METHOD_NOT_IMPLEMENTED });
        }
        await plugin.definition.onWebhook(params);
    }
    async function handleGetData(params) {
        const handler = dataHandlers.get(params.key);
        if (!handler) {
            throw new Error(`No data handler registered for key "${params.key}"`);
        }
        return handler(params.renderEnvironment === undefined
            ? params.params
            : { ...params.params, renderEnvironment: params.renderEnvironment });
    }
    async function handlePerformAction(params) {
        const handler = actionHandlers.get(params.key);
        if (!handler) {
            throw new Error(`No action handler registered for key "${params.key}"`);
        }
        return handler(params.renderEnvironment === undefined
            ? params.params
            : { ...params.params, renderEnvironment: params.renderEnvironment });
    }
    async function handleExecuteTool(params) {
        const entry = toolHandlers.get(params.toolName);
        if (!entry) {
            throw new Error(`No tool handler registered for "${params.toolName}"`);
        }
        return entry.fn(params.parameters, params.runContext);
    }
    // -----------------------------------------------------------------------
    // Event filter helper
    // -----------------------------------------------------------------------
    function allowsEvent(filter, event) {
        const payload = event.payload;
        if (filter.companyId !== undefined) {
            const companyId = event.companyId ?? String(payload?.companyId ?? "");
            if (companyId !== filter.companyId)
                return false;
        }
        if (filter.projectId !== undefined) {
            const projectId = event.entityType === "project"
                ? event.entityId
                : String(payload?.projectId ?? "");
            if (projectId !== filter.projectId)
                return false;
        }
        if (filter.agentId !== undefined) {
            const agentId = event.entityType === "agent"
                ? event.entityId
                : String(payload?.agentId ?? "");
            if (agentId !== filter.agentId)
                return false;
        }
        return true;
    }
    // -----------------------------------------------------------------------
    // Inbound response handling (host → worker, response to our outbound call)
    // -----------------------------------------------------------------------
    function handleHostResponse(response) {
        const id = response.id;
        if (id === null || id === undefined)
            return;
        const pending = pendingRequests.get(id);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        pendingRequests.delete(id);
        pending.resolve(response);
    }
    // -----------------------------------------------------------------------
    // Incoming line handler
    // -----------------------------------------------------------------------
    function handleLine(line) {
        if (!line.trim())
            return;
        let message;
        try {
            message = parseMessage(line);
        }
        catch (err) {
            if (err instanceof JsonRpcParseError) {
                // Send parse error response
                sendMessage(createErrorResponse(null, JSONRPC_ERROR_CODES.PARSE_ERROR, `Parse error: ${err.message}`));
            }
            return;
        }
        if (isJsonRpcResponse(message)) {
            // This is a response to one of our outbound worker→host calls
            handleHostResponse(message);
        }
        else if (isJsonRpcRequest(message)) {
            // This is a host→worker RPC call — dispatch it
            handleHostRequest(message).catch((err) => {
                // Unhandled error in the async handler — send error response
                const errorMessage = err instanceof Error ? err.message : String(err);
                const errorCode = err?.code ?? PLUGIN_RPC_ERROR_CODES.WORKER_ERROR;
                try {
                    sendMessage(createErrorResponse(message.id, typeof errorCode === "number" ? errorCode : PLUGIN_RPC_ERROR_CODES.WORKER_ERROR, errorMessage));
                }
                catch {
                    // Cannot send response, stdout may be closed
                }
            });
        }
        else if (isJsonRpcNotification(message)) {
            // Dispatch host→worker push notifications
            const notif = message;
            if (notif.method === "agents.sessions.event" && notif.params) {
                const event = notif.params;
                const cb = sessionEventCallbacks.get(event.sessionId);
                if (cb)
                    cb(event);
            }
            else if (notif.method === "onEvent" && notif.params) {
                // Plugin event bus notifications — dispatch to registered event handlers
                handleOnEvent(notif.params).catch((err) => {
                    notifyHost("log", {
                        level: "error",
                        message: `Failed to handle event notification: ${err instanceof Error ? err.message : String(err)}`,
                    });
                });
            }
        }
    }
    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------
    function cleanup() {
        running = false;
        // Close readline
        if (readline) {
            readline.close();
            readline = null;
        }
        // Reject all pending outbound calls
        for (const [id, pending] of pendingRequests) {
            clearTimeout(pending.timer);
            pending.resolve(createErrorResponse(id, PLUGIN_RPC_ERROR_CODES.WORKER_UNAVAILABLE, "Worker RPC host is shutting down"));
        }
        pendingRequests.clear();
        sessionEventCallbacks.clear();
    }
    // -----------------------------------------------------------------------
    // Bootstrap: wire up stdin readline
    // -----------------------------------------------------------------------
    let readline = createInterface({
        input: stdinStream,
        crlfDelay: Infinity,
    });
    readline.on("line", handleLine);
    // If stdin closes, we should exit gracefully
    readline.on("close", () => {
        if (running) {
            cleanup();
            if (!options.stdin && !options.stdout) {
                process.exit(0);
            }
        }
    });
    // Handle uncaught errors in the worker process.
    // Only install these when using the real process streams (not in tests
    // where the caller provides custom streams).
    if (!options.stdin && !options.stdout) {
        process.on("uncaughtException", (err) => {
            notifyHost("log", {
                level: "error",
                message: `Uncaught exception: ${err.message}`,
                meta: { stack: err.stack },
            });
            // Give the notification a moment to flush, then exit
            setTimeout(() => process.exit(1), 100);
        });
        process.on("unhandledRejection", (reason) => {
            const message = reason instanceof Error ? reason.message : String(reason);
            const stack = reason instanceof Error ? reason.stack : undefined;
            notifyHost("log", {
                level: "error",
                message: `Unhandled rejection: ${message}`,
                meta: { stack },
            });
        });
    }
    // -----------------------------------------------------------------------
    // Return the handle
    // -----------------------------------------------------------------------
    return {
        get running() {
            return running;
        },
        stop() {
            cleanup();
        },
    };
}
//# sourceMappingURL=worker-rpc-host.js.map