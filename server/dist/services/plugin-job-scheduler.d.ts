/**
 * PluginJobScheduler — tick-based scheduler for plugin scheduled jobs.
 *
 * The scheduler is the central coordinator for all plugin cron jobs. It
 * periodically ticks (default every 30 seconds), queries the `plugin_jobs`
 * table for jobs whose `nextRunAt` has passed, dispatches `runJob` RPC calls
 * to the appropriate worker processes, records each execution in the
 * `plugin_job_runs` table, and advances the scheduling pointer.
 *
 * ## Responsibilities
 *
 * 1. **Tick loop** — A `setInterval`-based loop fires every `tickIntervalMs`
 *    (default 30s). Each tick scans for due jobs and dispatches them.
 *
 * 2. **Cron parsing & next-run calculation** — Uses the lightweight built-in
 *    cron parser ({@link parseCron}, {@link nextCronTick}) to compute the
 *    `nextRunAt` timestamp after each run or when a new job is registered.
 *
 * 3. **Overlap prevention** — Before dispatching a job, the scheduler checks
 *    for an existing `running` run for the same job. If one exists, the job
 *    is skipped for that tick.
 *
 * 4. **Job run recording** — Every execution creates a `plugin_job_runs` row:
 *    `queued` → `running` → `succeeded` | `failed`. Duration and error are
 *    captured.
 *
 * 5. **Lifecycle integration** — The scheduler exposes `registerPlugin()` and
 *    `unregisterPlugin()` so the host lifecycle manager can wire up job
 *    scheduling when plugins start/stop. On registration, the scheduler
 *    computes `nextRunAt` for all active jobs that don't already have one.
 *
 * @see PLUGIN_SPEC.md §17 — Scheduled Jobs
 * @see ./plugin-job-store.ts — Persistence layer
 * @see ./cron.ts — Cron parsing utilities
 */
import type { Db } from "@paperclipai/db";
import type { PluginJobStore } from "./plugin-job-store.js";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
/**
 * Options for creating a PluginJobScheduler.
 */
export interface PluginJobSchedulerOptions {
    /** Drizzle database instance. */
    db: Db;
    /** Persistence layer for jobs and runs. */
    jobStore: PluginJobStore;
    /** Worker process manager for RPC calls. */
    workerManager: PluginWorkerManager;
    /** Interval between scheduler ticks in ms (default: 30s). */
    tickIntervalMs?: number;
    /** Timeout for individual job RPC calls in ms (default: 5min). */
    jobTimeoutMs?: number;
    /** Maximum number of concurrent job executions (default: 10). */
    maxConcurrentJobs?: number;
}
/**
 * Result of a manual job trigger.
 */
export interface TriggerJobResult {
    /** The created run ID. */
    runId: string;
    /** The job ID that was triggered. */
    jobId: string;
}
/**
 * Diagnostic information about the scheduler.
 */
export interface SchedulerDiagnostics {
    /** Whether the tick loop is running. */
    running: boolean;
    /** Number of jobs currently executing. */
    activeJobCount: number;
    /** Set of job IDs currently in-flight. */
    activeJobIds: string[];
    /** Total number of ticks executed since start. */
    tickCount: number;
    /** Timestamp of the last tick (ISO 8601). */
    lastTickAt: string | null;
}
/**
 * The public interface of the job scheduler.
 */
export interface PluginJobScheduler {
    /**
     * Start the scheduler tick loop.
     *
     * Safe to call multiple times — subsequent calls are no-ops.
     */
    start(): void;
    /**
     * Stop the scheduler tick loop.
     *
     * In-flight job runs are NOT cancelled — they are allowed to finish
     * naturally. The tick loop simply stops firing.
     */
    stop(): void;
    /**
     * Register a plugin with the scheduler.
     *
     * Computes `nextRunAt` for all active jobs that are missing it. This is
     * typically called after a plugin's worker process starts and
     * `syncJobDeclarations()` has been called.
     *
     * @param pluginId - UUID of the plugin
     */
    registerPlugin(pluginId: string): Promise<void>;
    /**
     * Unregister a plugin from the scheduler.
     *
     * Cancels any in-flight runs for the plugin and removes tracking state.
     *
     * @param pluginId - UUID of the plugin
     */
    unregisterPlugin(pluginId: string): Promise<void>;
    /**
     * Manually trigger a specific job (outside of the cron schedule).
     *
     * Creates a run with `trigger: "manual"` and dispatches immediately,
     * respecting the overlap prevention check.
     *
     * @param jobId - UUID of the job to trigger
     * @param trigger - What triggered this run (default: "manual")
     * @returns The created run info
     * @throws {Error} if the job is not found, not active, or already running
     */
    triggerJob(jobId: string, trigger?: "manual" | "retry"): Promise<TriggerJobResult>;
    /**
     * Run a single scheduler tick immediately (for testing).
     *
     * @internal
     */
    tick(): Promise<void>;
    /**
     * Get diagnostic information about the scheduler state.
     */
    diagnostics(): SchedulerDiagnostics;
}
/**
 * Create a new PluginJobScheduler.
 *
 * @example
 * ```ts
 * const scheduler = createPluginJobScheduler({
 *   db,
 *   jobStore,
 *   workerManager,
 * });
 *
 * // Start the tick loop
 * scheduler.start();
 *
 * // When a plugin comes online, register it
 * await scheduler.registerPlugin(pluginId);
 *
 * // Manually trigger a job
 * const { runId } = await scheduler.triggerJob(jobId);
 *
 * // On server shutdown
 * scheduler.stop();
 * ```
 */
export declare function createPluginJobScheduler(options: PluginJobSchedulerOptions): PluginJobScheduler;
//# sourceMappingURL=plugin-job-scheduler.d.ts.map