/**
 * PluginJobCoordinator — bridges the plugin lifecycle manager with the
 * job scheduler and job store.
 *
 * This service listens to lifecycle events and performs the corresponding
 * scheduler and job store operations:
 *
 * - **plugin.loaded** → sync job declarations from manifest, then register
 *   the plugin with the scheduler (computes `nextRunAt` for active jobs).
 *
 * - **plugin.disabled / plugin.unloaded** → unregister the plugin from the
 *   scheduler (cancels in-flight runs, clears tracking state).
 *
 * ## Why a separate coordinator?
 *
 * The lifecycle manager, scheduler, and job store are independent services
 * with clean single-responsibility boundaries. The coordinator provides
 * the "glue" between them without adding coupling. This pattern is used
 * throughout Paperclip (e.g. heartbeat service coordinates timers + runs).
 *
 * @see PLUGIN_SPEC.md §17 — Scheduled Jobs
 * @see ./plugin-job-scheduler.ts — Scheduler service
 * @see ./plugin-job-store.ts — Persistence layer
 * @see ./plugin-lifecycle.ts — Plugin state machine
 */
import type { PluginLifecycleManager } from "./plugin-lifecycle.js";
import type { PluginJobScheduler } from "./plugin-job-scheduler.js";
import type { PluginJobStore } from "./plugin-job-store.js";
import type { Db } from "@paperclipai/db";
/**
 * Options for creating a PluginJobCoordinator.
 */
export interface PluginJobCoordinatorOptions {
    /** Drizzle database instance. */
    db: Db;
    /** The plugin lifecycle manager to listen to. */
    lifecycle: PluginLifecycleManager;
    /** The job scheduler to register/unregister plugins with. */
    scheduler: PluginJobScheduler;
    /** The job store for syncing declarations. */
    jobStore: PluginJobStore;
}
/**
 * The public interface of the job coordinator.
 */
export interface PluginJobCoordinator {
    /**
     * Start listening to lifecycle events.
     *
     * This wires up the `plugin.loaded`, `plugin.disabled`, and
     * `plugin.unloaded` event handlers.
     */
    start(): void;
    /**
     * Stop listening to lifecycle events.
     *
     * Removes all event subscriptions added by `start()`.
     */
    stop(): void;
}
/**
 * Create a PluginJobCoordinator.
 *
 * @example
 * ```ts
 * const coordinator = createPluginJobCoordinator({
 *   db,
 *   lifecycle,
 *   scheduler,
 *   jobStore,
 * });
 *
 * // Start listening to lifecycle events
 * coordinator.start();
 *
 * // On server shutdown
 * coordinator.stop();
 * ```
 */
export declare function createPluginJobCoordinator(options: PluginJobCoordinatorOptions): PluginJobCoordinator;
//# sourceMappingURL=plugin-job-coordinator.d.ts.map