import type { Db } from "@paperclipai/db";
import type { PluginStatus, PluginRecord } from "@paperclipai/shared";
import { type PluginLoader } from "./plugin-loader.js";
import type { PluginWorkerManager, WorkerStartOptions } from "./plugin-worker-manager.js";
/**
 * Events emitted by the PluginLifecycleManager.
 * Consumers can subscribe to these for routing-table updates, UI refresh
 * notifications, and observability.
 */
export interface PluginLifecycleEvents {
    /** Emitted after a plugin is loaded (installed → ready). */
    "plugin.loaded": {
        pluginId: string;
        pluginKey: string;
    };
    /** Emitted after a plugin transitions to ready (enabled). */
    "plugin.enabled": {
        pluginId: string;
        pluginKey: string;
    };
    /** Emitted after a plugin is disabled (ready → disabled). */
    "plugin.disabled": {
        pluginId: string;
        pluginKey: string;
        reason?: string;
    };
    /** Emitted after a plugin is unloaded (any → uninstalled). */
    "plugin.unloaded": {
        pluginId: string;
        pluginKey: string;
        removeData: boolean;
    };
    /** Emitted on any status change. */
    "plugin.status_changed": {
        pluginId: string;
        pluginKey: string;
        previousStatus: PluginStatus;
        newStatus: PluginStatus;
    };
    /** Emitted when a plugin enters an error state. */
    "plugin.error": {
        pluginId: string;
        pluginKey: string;
        error: string;
    };
    /** Emitted when a plugin enters upgrade_pending. */
    "plugin.upgrade_pending": {
        pluginId: string;
        pluginKey: string;
    };
    /** Emitted when a plugin worker process has been started. */
    "plugin.worker_started": {
        pluginId: string;
        pluginKey: string;
    };
    /** Emitted when a plugin worker process has been stopped. */
    "plugin.worker_stopped": {
        pluginId: string;
        pluginKey: string;
    };
}
type LifecycleEventName = keyof PluginLifecycleEvents;
type LifecycleEventPayload<K extends LifecycleEventName> = PluginLifecycleEvents[K];
export interface PluginLifecycleManager {
    /**
     * Load a newly installed plugin – transitions `installed` → `ready`.
     *
     * This is called after the registry has persisted the initial install record.
     * The caller should have already spawned the worker and performed health
     * checks before calling this.  If the worker fails, call `markError` instead.
     */
    load(pluginId: string): Promise<PluginRecord>;
    /**
     * Enable a plugin that is in `disabled`, `error`, or `upgrade_pending` state.
     * Transitions → `ready`.
     */
    enable(pluginId: string): Promise<PluginRecord>;
    /**
     * Disable a running plugin.
     * Transitions `ready` → `disabled`.
     */
    disable(pluginId: string, reason?: string): Promise<PluginRecord>;
    /**
     * Unload (uninstall) a plugin from any active state.
     * Transitions → `uninstalled`.
     *
     * When `removeData` is true, the plugin row and cascaded config are
     * hard-deleted.  Otherwise a soft-delete sets status to `uninstalled`.
     */
    unload(pluginId: string, removeData?: boolean): Promise<PluginRecord | null>;
    /**
     * Mark a plugin as errored (e.g. worker crash, health-check failure).
     * Transitions → `error`.
     */
    markError(pluginId: string, error: string): Promise<PluginRecord>;
    /**
     * Mark a plugin as requiring upgrade approval.
     * Transitions `ready` → `upgrade_pending`.
     */
    markUpgradePending(pluginId: string): Promise<PluginRecord>;
    /**
     * Upgrade a plugin to a newer version.
     * This is a placeholder that handles the lifecycle state transition.
     * The actual package installation is handled by plugin-loader.
     *
     * If the upgrade adds new capabilities, transitions to `upgrade_pending`.
     * Otherwise, transitions to `ready` directly.
     */
    upgrade(pluginId: string, version?: string): Promise<PluginRecord>;
    /**
     * Start the worker process for a plugin that is already in `ready` state.
     *
     * This is used by the server startup orchestration to start workers for
     * plugins that were persisted as `ready`. It requires a `PluginWorkerManager`
     * to have been provided at construction time.
     *
     * @param pluginId - The UUID of the plugin to start
     * @param options  - Worker start options (entrypoint path, config, etc.)
     * @throws if no worker manager is configured or the plugin is not ready
     */
    startWorker(pluginId: string, options: WorkerStartOptions): Promise<void>;
    /**
     * Stop the worker process for a plugin without changing lifecycle state.
     *
     * This is used during server shutdown to gracefully stop all workers.
     * It does not transition the plugin state — plugins remain in their
     * current status so they can be restarted on next server boot.
     *
     * @param pluginId - The UUID of the plugin to stop
     */
    stopWorker(pluginId: string): Promise<void>;
    /**
     * Restart the worker process for a running plugin.
     *
     * Stops and re-starts the worker process. The plugin remains in `ready`
     * state throughout. This is typically called after a config change.
     *
     * @param pluginId - The UUID of the plugin to restart
     * @throws if no worker manager is configured or the plugin is not ready
     */
    restartWorker(pluginId: string): Promise<void>;
    /**
     * Get the current lifecycle state for a plugin.
     */
    getStatus(pluginId: string): Promise<PluginStatus | null>;
    /**
     * Check whether a transition is allowed from the plugin's current state.
     */
    canTransition(pluginId: string, to: PluginStatus): Promise<boolean>;
    /**
     * Subscribe to lifecycle events.
     */
    on<K extends LifecycleEventName>(event: K, listener: (payload: LifecycleEventPayload<K>) => void): void;
    /**
     * Unsubscribe from lifecycle events.
     */
    off<K extends LifecycleEventName>(event: K, listener: (payload: LifecycleEventPayload<K>) => void): void;
    /**
     * Subscribe to a lifecycle event once.
     */
    once<K extends LifecycleEventName>(event: K, listener: (payload: LifecycleEventPayload<K>) => void): void;
}
/**
 * Options for constructing a PluginLifecycleManager.
 */
export interface PluginLifecycleManagerOptions {
    /** Plugin loader instance. Falls back to the default if omitted. */
    loader?: PluginLoader;
    /**
     * Worker process manager. When provided, lifecycle transitions that bring
     * a plugin online (load, enable, upgrade-to-ready) will start the worker
     * process, and transitions that take a plugin offline (disable, unload,
     * markError) will stop it.
     *
     * When omitted the lifecycle manager operates in state-only mode — the
     * caller is responsible for managing worker processes externally.
     */
    workerManager?: PluginWorkerManager;
}
/**
 * Create a PluginLifecycleManager.
 *
 * This service orchestrates plugin state transitions on top of the
 * `pluginRegistryService` (which handles raw DB persistence).  It enforces
 * the lifecycle state machine, emits events for downstream consumers
 * (routing tables, UI, observability), and manages worker processes via
 * the `PluginWorkerManager` when one is provided.
 *
 * Usage:
 * ```ts
 * const lifecycle = pluginLifecycleManager(db, {
 *   workerManager: createPluginWorkerManager(),
 * });
 * lifecycle.on("plugin.enabled", ({ pluginId }) => { ... });
 * await lifecycle.load(pluginId);
 * ```
 *
 * @see PLUGIN_SPEC.md §21.3 — `plugins.status` column
 * @see PLUGIN_SPEC.md §12 — Process Model
 */
export declare function pluginLifecycleManager(db: Db, options?: PluginLoader | PluginLifecycleManagerOptions): PluginLifecycleManager;
export {};
//# sourceMappingURL=plugin-lifecycle.d.ts.map