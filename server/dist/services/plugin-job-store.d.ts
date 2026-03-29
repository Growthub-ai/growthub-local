/**
 * Plugin Job Store — persistence layer for scheduled plugin jobs and their
 * execution history.
 *
 * This service manages the `plugin_jobs` and `plugin_job_runs` tables. It is
 * the server-side backing store for the `ctx.jobs` SDK surface exposed to
 * plugin workers.
 *
 * ## Responsibilities
 *
 * 1. **Sync job declarations** — When a plugin is installed or started, the
 *    host calls `syncJobDeclarations()` to upsert the manifest's declared jobs
 *    into the `plugin_jobs` table. Jobs removed from the manifest are marked
 *    `paused` (not deleted) to preserve history.
 *
 * 2. **Job CRUD** — List, get, pause, and resume jobs for a given plugin.
 *
 * 3. **Run lifecycle** — Create job run records, update their status, and
 *    record results (duration, errors, logs).
 *
 * 4. **Next-run calculation** — After a run completes the host should call
 *    `updateNextRunAt()` with the next cron tick so the scheduler knows when
 *    to fire next.
 *
 * The capability check (`jobs.schedule`) is enforced upstream by the host
 * client factory and manifest validator — this store trusts that the caller
 * has already been authorised.
 *
 * @see PLUGIN_SPEC.md §17 — Scheduled Jobs
 * @see PLUGIN_SPEC.md §21.3 — `plugin_jobs` / `plugin_job_runs` tables
 */
import type { Db } from "@paperclipai/db";
import { pluginJobs, pluginJobRuns } from "@paperclipai/db";
import type { PluginJobDeclaration, PluginJobRunStatus, PluginJobRunTrigger, PluginJobRecord } from "@paperclipai/shared";
/**
 * The statuses used for job *definitions* in the `plugin_jobs` table.
 * Aliased from `PluginJobRecord` to keep the store API aligned with
 * the domain type (`"active" | "paused" | "failed"`).
 */
type JobDefinitionStatus = PluginJobRecord["status"];
/**
 * Input for creating a job run record.
 */
export interface CreateJobRunInput {
    /** FK to the plugin_jobs row. */
    jobId: string;
    /** FK to the plugins row. */
    pluginId: string;
    /** What triggered this run. */
    trigger: PluginJobRunTrigger;
}
/**
 * Input for completing (or failing) a job run.
 */
export interface CompleteJobRunInput {
    /** Final run status. */
    status: PluginJobRunStatus;
    /** Error message if the run failed. */
    error?: string | null;
    /** Run duration in milliseconds. */
    durationMs?: number | null;
}
/**
 * Create a PluginJobStore backed by the given Drizzle database instance.
 *
 * @example
 * ```ts
 * const jobStore = pluginJobStore(db);
 *
 * // On plugin install/start — sync declared jobs into the DB
 * await jobStore.syncJobDeclarations(pluginId, manifest.jobs ?? []);
 *
 * // Before dispatching a runJob RPC — create a run record
 * const run = await jobStore.createRun({ jobId, pluginId, trigger: "schedule" });
 *
 * // After the RPC completes — record the result
 * await jobStore.completeRun(run.id, {
 *   status: "succeeded",
 *   durationMs: Date.now() - startedAt,
 * });
 * ```
 */
export declare function pluginJobStore(db: Db): {
    /**
     * Sync declared jobs from a plugin manifest into the `plugin_jobs` table.
     *
     * This is called at plugin install and on each worker startup so the DB
     * always reflects the manifest's declared jobs:
     *
     * - **New jobs** are inserted with status `active`.
     * - **Existing jobs** have their `schedule` updated if it changed.
     * - **Removed jobs** (present in DB but absent from the manifest) are
     *   set to `paused` so their history is preserved.
     *
     * The unique constraint `(pluginId, jobKey)` is used for conflict
     * resolution.
     *
     * @param pluginId - UUID of the owning plugin
     * @param declarations - Job declarations from the plugin manifest
     */
    syncJobDeclarations(pluginId: string, declarations: PluginJobDeclaration[]): Promise<void>;
    /**
     * List all jobs for a plugin, optionally filtered by status.
     *
     * @param pluginId - UUID of the owning plugin
     * @param status - Optional status filter
     */
    listJobs(pluginId: string, status?: JobDefinitionStatus): Promise<(typeof pluginJobs.$inferSelect)[]>;
    /**
     * Get a single job by its composite key `(pluginId, jobKey)`.
     *
     * @param pluginId - UUID of the owning plugin
     * @param jobKey - Stable job identifier from the manifest
     * @returns The job row, or `null` if not found
     */
    getJobByKey(pluginId: string, jobKey: string): Promise<(typeof pluginJobs.$inferSelect) | null>;
    /**
     * Get a single job by its primary key (UUID).
     *
     * @param jobId - UUID of the job row
     * @returns The job row, or `null` if not found
     */
    getJobById(jobId: string): Promise<(typeof pluginJobs.$inferSelect) | null>;
    /**
     * Fetch a single job by ID, scoped to a specific plugin.
     *
     * Returns `null` if the job does not exist or does not belong to the
     * given plugin — callers should treat both cases as "not found".
     */
    getJobByIdForPlugin(pluginId: string, jobId: string): Promise<(typeof pluginJobs.$inferSelect) | null>;
    /**
     * Update a job's status.
     *
     * @param jobId - UUID of the job row
     * @param status - New status
     */
    updateJobStatus(jobId: string, status: JobDefinitionStatus): Promise<void>;
    /**
     * Update the `lastRunAt` and `nextRunAt` timestamps on a job.
     *
     * Called by the scheduler after a run completes to advance the
     * scheduling pointer.
     *
     * @param jobId - UUID of the job row
     * @param lastRunAt - When the last run started
     * @param nextRunAt - When the next run should fire
     */
    updateRunTimestamps(jobId: string, lastRunAt: Date, nextRunAt: Date | null): Promise<void>;
    /**
     * Delete all jobs (and cascaded runs) owned by a plugin.
     *
     * Called during plugin uninstall when `removeData = true`.
     *
     * @param pluginId - UUID of the owning plugin
     */
    deleteAllJobs(pluginId: string): Promise<void>;
    /**
     * Create a new job run record with status `queued`.
     *
     * The caller should create the run record *before* dispatching the
     * `runJob` RPC to the worker, then update it to `running` once the
     * worker begins execution.
     *
     * @param input - Job run input (jobId, pluginId, trigger)
     * @returns The newly created run row
     */
    createRun(input: CreateJobRunInput): Promise<typeof pluginJobRuns.$inferSelect>;
    /**
     * Mark a run as `running` and set its `startedAt` timestamp.
     *
     * @param runId - UUID of the run row
     */
    markRunning(runId: string): Promise<void>;
    /**
     * Complete a run — set its final status, error, duration, and
     * `finishedAt` timestamp.
     *
     * @param runId - UUID of the run row
     * @param input - Completion details
     */
    completeRun(runId: string, input: CompleteJobRunInput): Promise<void>;
    /**
     * Get a run by its primary key.
     *
     * @param runId - UUID of the run row
     * @returns The run row, or `null` if not found
     */
    getRunById(runId: string): Promise<(typeof pluginJobRuns.$inferSelect) | null>;
    /**
     * List runs for a specific job, ordered by creation time descending.
     *
     * @param jobId - UUID of the job
     * @param limit - Maximum number of rows to return (default: 50)
     */
    listRunsByJob(jobId: string, limit?: number): Promise<(typeof pluginJobRuns.$inferSelect)[]>;
    /**
     * List runs for a plugin, optionally filtered by status.
     *
     * @param pluginId - UUID of the owning plugin
     * @param status - Optional status filter
     * @param limit - Maximum number of rows to return (default: 50)
     */
    listRunsByPlugin(pluginId: string, status?: PluginJobRunStatus, limit?: number): Promise<(typeof pluginJobRuns.$inferSelect)[]>;
};
/** Type alias for the return value of `pluginJobStore()`. */
export type PluginJobStore = ReturnType<typeof pluginJobStore>;
export {};
//# sourceMappingURL=plugin-job-store.d.ts.map