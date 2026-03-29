/**
 * PluginWorkerManager — spawns and manages out-of-process plugin worker child
 * processes, routes JSON-RPC 2.0 calls over stdio, and handles lifecycle
 * management including crash recovery with exponential backoff.
 *
 * Each installed plugin gets one dedicated worker process. The host sends
 * JSON-RPC requests over the child's stdin and reads responses from stdout.
 * Worker stderr is captured and forwarded to the host logger.
 *
 * Process Model (from PLUGIN_SPEC.md §12):
 * - One worker process per installed plugin
 * - Failure isolation: plugin crashes do not affect the host
 * - Graceful shutdown: 10-second drain, then SIGTERM, then SIGKILL
 * - Automatic restart with exponential backoff on unexpected exits
 *
 * @see PLUGIN_SPEC.md §12 — Process Model
 * @see PLUGIN_SPEC.md §12.5 — Graceful Shutdown Policy
 * @see PLUGIN_SPEC.md §13 — Host-Worker Protocol
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
import type { HostToWorkerMethodName, HostToWorkerMethods, WorkerToHostMethodName, WorkerToHostMethods } from "@paperclipai/plugin-sdk";
/**
 * Status of a managed worker process.
 */
export type WorkerStatus = "stopped" | "starting" | "running" | "stopping" | "crashed" | "backoff";
/**
 * Worker-to-host method handler. The host registers these to service calls
 * that the plugin worker makes back to the host (e.g. state.get, events.emit).
 */
export type WorkerToHostHandler<M extends WorkerToHostMethodName> = (params: WorkerToHostMethods[M][0]) => Promise<WorkerToHostMethods[M][1]>;
/**
 * A map of all worker-to-host method handlers provided by the host.
 */
export type WorkerToHostHandlers = {
    [M in WorkerToHostMethodName]?: WorkerToHostHandler<M>;
};
/**
 * Events emitted by a PluginWorkerHandle.
 */
export interface WorkerHandleEvents {
    /** Worker process started and is ready (initialize succeeded). */
    "ready": {
        pluginId: string;
    };
    /** Worker process exited. */
    "exit": {
        pluginId: string;
        code: number | null;
        signal: NodeJS.Signals | null;
    };
    /** Worker process crashed unexpectedly. */
    "crash": {
        pluginId: string;
        code: number | null;
        signal: NodeJS.Signals | null;
        willRestart: boolean;
    };
    /** Worker process errored (e.g. spawn failure). */
    "error": {
        pluginId: string;
        error: Error;
    };
    /** Worker status changed. */
    "status": {
        pluginId: string;
        status: WorkerStatus;
        previousStatus: WorkerStatus;
    };
}
type WorkerHandleEventName = keyof WorkerHandleEvents;
export declare function appendStderrExcerpt(current: string, chunk: string): string;
export declare function formatWorkerFailureMessage(message: string, stderrExcerpt: string): string;
/**
 * Options for starting a worker process.
 */
export interface WorkerStartOptions {
    /** Absolute path to the plugin worker entrypoint (CJS bundle). */
    entrypointPath: string;
    /** Plugin manifest. */
    manifest: PaperclipPluginManifestV1;
    /** Resolved plugin configuration. */
    config: Record<string, unknown>;
    /** Host instance information for the initialize call. */
    instanceInfo: {
        instanceId: string;
        hostVersion: string;
    };
    /** Host API version. */
    apiVersion: number;
    /** Handlers for worker→host RPC calls. */
    hostHandlers: WorkerToHostHandlers;
    /** Default timeout for RPC calls (ms). Defaults to 30s. */
    rpcTimeoutMs?: number;
    /** Whether to auto-restart on crash. Defaults to true. */
    autoRestart?: boolean;
    /** Node.js execArgv passed to the child process. */
    execArgv?: string[];
    /** Environment variables passed to the child process. */
    env?: Record<string, string>;
    /**
     * Callback for stream notifications from the worker (streams.open/emit/close).
     * The host wires this to the PluginStreamBus to fan out events to SSE clients.
     */
    onStreamNotification?: (method: string, params: Record<string, unknown>) => void;
}
/**
 * Handle for a single plugin worker process.
 *
 * Callers use `start()` to spawn the worker, `call()` to send RPC requests,
 * and `stop()` to gracefully shut down. The handle manages crash recovery
 * with exponential backoff automatically when `autoRestart` is enabled.
 */
export interface PluginWorkerHandle {
    /** The plugin ID this worker serves. */
    readonly pluginId: string;
    /** Current worker status. */
    readonly status: WorkerStatus;
    /** Start the worker process. Resolves when initialize completes. */
    start(): Promise<void>;
    /**
     * Stop the worker process gracefully.
     *
     * Sends a `shutdown` RPC call, waits up to 10 seconds for the worker to
     * exit, then escalates to SIGTERM, and finally SIGKILL if needed.
     */
    stop(): Promise<void>;
    /**
     * Restart the worker process (stop + start).
     */
    restart(): Promise<void>;
    /**
     * Send a typed host→worker RPC call.
     *
     * @param method - The RPC method name
     * @param params - Method parameters
     * @param timeoutMs - Optional per-call timeout override
     * @returns The method result
     * @throws {JsonRpcCallError} if the worker returns an error response
     * @throws {Error} if the worker is not running or the call times out
     */
    call<M extends HostToWorkerMethodName>(method: M, params: HostToWorkerMethods[M][0], timeoutMs?: number): Promise<HostToWorkerMethods[M][1]>;
    /**
     * Send a fire-and-forget notification to the worker (no response expected).
     */
    notify(method: string, params: unknown): void;
    /** Subscribe to worker events. */
    on<K extends WorkerHandleEventName>(event: K, listener: (payload: WorkerHandleEvents[K]) => void): void;
    /** Unsubscribe from worker events. */
    off<K extends WorkerHandleEventName>(event: K, listener: (payload: WorkerHandleEvents[K]) => void): void;
    /** Optional methods the worker reported during initialization. */
    readonly supportedMethods: string[];
    /** Get diagnostic info about the worker. */
    diagnostics(): WorkerDiagnostics;
}
/**
 * Diagnostic information about a worker process.
 */
export interface WorkerDiagnostics {
    pluginId: string;
    status: WorkerStatus;
    pid: number | null;
    uptime: number | null;
    consecutiveCrashes: number;
    totalCrashes: number;
    pendingRequests: number;
    lastCrashAt: number | null;
    nextRestartAt: number | null;
}
/**
 * The top-level manager that holds all plugin worker handles.
 *
 * Provides a registry of workers keyed by plugin ID, with convenience methods
 * for starting/stopping all workers and routing RPC calls.
 */
export interface PluginWorkerManager {
    /**
     * Register and start a worker for a plugin.
     *
     * @returns The worker handle
     * @throws if a worker is already registered for this plugin
     */
    startWorker(pluginId: string, options: WorkerStartOptions): Promise<PluginWorkerHandle>;
    /**
     * Stop and unregister a specific plugin worker.
     */
    stopWorker(pluginId: string): Promise<void>;
    /**
     * Get the worker handle for a plugin.
     */
    getWorker(pluginId: string): PluginWorkerHandle | undefined;
    /**
     * Check if a worker is registered and running for a plugin.
     */
    isRunning(pluginId: string): boolean;
    /**
     * Stop all managed workers. Called during server shutdown.
     */
    stopAll(): Promise<void>;
    /**
     * Get diagnostic info for all workers.
     */
    diagnostics(): WorkerDiagnostics[];
    /**
     * Send an RPC call to a specific plugin worker.
     *
     * @throws if the worker is not running
     */
    call<M extends HostToWorkerMethodName>(pluginId: string, method: M, params: HostToWorkerMethods[M][0], timeoutMs?: number): Promise<HostToWorkerMethods[M][1]>;
}
/**
 * Create a handle for a single plugin worker process.
 *
 * @internal Exported for testing; consumers should use `createPluginWorkerManager`.
 */
export declare function createPluginWorkerHandle(pluginId: string, options: WorkerStartOptions): PluginWorkerHandle;
/**
 * Options for creating a PluginWorkerManager.
 */
export interface PluginWorkerManagerOptions {
    /**
     * Optional callback invoked when a worker emits a lifecycle event
     * (crash, restart). Used by the server to publish global live events.
     */
    onWorkerEvent?: (event: {
        type: "plugin.worker.crashed" | "plugin.worker.restarted";
        pluginId: string;
        code?: number | null;
        signal?: string | null;
        willRestart?: boolean;
    }) => void;
}
/**
 * Create a new PluginWorkerManager.
 *
 * The manager holds all plugin worker handles and provides a unified API for
 * starting, stopping, and communicating with plugin workers.
 *
 * @example
 * ```ts
 * const manager = createPluginWorkerManager();
 *
 * const handle = await manager.startWorker("acme.linear", {
 *   entrypointPath: "/path/to/worker.cjs",
 *   manifest,
 *   config: resolvedConfig,
 *   instanceInfo: { instanceId: "inst-1", hostVersion: "1.0.0" },
 *   apiVersion: 1,
 *   hostHandlers: { "config.get": async () => resolvedConfig, ... },
 * });
 *
 * // Send RPC call to the worker
 * const health = await manager.call("acme.linear", "health", {});
 *
 * // Shutdown all workers on server exit
 * await manager.stopAll();
 * ```
 */
export declare function createPluginWorkerManager(managerOptions?: PluginWorkerManagerOptions): PluginWorkerManager;
export {};
//# sourceMappingURL=plugin-worker-manager.d.ts.map