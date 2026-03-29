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
import type { PaperclipPlugin } from "./define-plugin.js";
/**
 * Options for starting the worker-side RPC host.
 */
export interface WorkerRpcHostOptions {
    /**
     * The plugin definition returned by `definePlugin()`.
     *
     * The worker entrypoint should import its plugin and pass it here.
     */
    plugin: PaperclipPlugin;
    /**
     * Input stream to read JSON-RPC messages from.
     * Defaults to `process.stdin`.
     */
    stdin?: NodeJS.ReadableStream;
    /**
     * Output stream to write JSON-RPC messages to.
     * Defaults to `process.stdout`.
     */
    stdout?: NodeJS.WritableStream;
    /**
     * Default timeout (ms) for worker→host RPC calls.
     * Defaults to 30 000 ms.
     */
    rpcTimeoutMs?: number;
}
/**
 * A running worker RPC host instance.
 *
 * Returned by `startWorkerRpcHost()`. Callers (usually just the worker
 * bootstrap) hold a reference so they can inspect status or force-stop.
 */
export interface WorkerRpcHost {
    /** Whether the host is currently running and listening for messages. */
    readonly running: boolean;
    /**
     * Stop the RPC host immediately. Closes readline, rejects pending
     * outbound calls, and does NOT call the plugin's shutdown hook (that
     * should have already been called via the `shutdown` RPC method).
     */
    stop(): void;
}
/**
 * Options for runWorker when testing (optional stdio to avoid using process streams).
 * When both stdin and stdout are provided, the "is main module" check is skipped
 * and the host is started with these streams. Used by tests.
 */
export interface RunWorkerOptions {
    stdin?: NodeJS.ReadableStream;
    stdout?: NodeJS.WritableStream;
}
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
export declare function runWorker(plugin: PaperclipPlugin, moduleUrl: string, options?: RunWorkerOptions): WorkerRpcHost | void;
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
export declare function startWorkerRpcHost(options: WorkerRpcHostOptions): WorkerRpcHost;
//# sourceMappingURL=worker-rpc-host.d.ts.map