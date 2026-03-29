/**
 * PluginLifecycleManager — state-machine controller for plugin status
 * transitions and worker process coordination.
 *
 * Each plugin moves through a well-defined state machine:
 *
 * ```
 *   installed ──→ ready ──→ disabled
 *       │            │         │
 *       │            ├──→ error│
 *       │            ↓         │
 *       │     upgrade_pending  │
 *       │            │         │
 *       ↓            ↓         ↓
 *              uninstalled
 * ```
 *
 * The lifecycle manager:
 *
 * 1. **Validates transitions** — Only transitions defined in
 *    `VALID_TRANSITIONS` are allowed; invalid transitions throw.
 *
 * 2. **Coordinates workers** — When a plugin moves to `ready`, its
 *    worker process is started. When it moves out of `ready`, the
 *    worker is stopped gracefully.
 *
 * 3. **Emits events** — `plugin.loaded`, `plugin.enabled`,
 *    `plugin.disabled`, `plugin.unloaded`, `plugin.status_changed`
 *    events are emitted so that other services (job coordinator,
 *    tool dispatcher, event bus) can react accordingly.
 *
 * 4. **Persists state** — Status changes are written to the database
 *    through the plugin registry service.
 *
 * @see PLUGIN_SPEC.md §12 — Process Model
 * @see PLUGIN_SPEC.md §12.5 — Graceful Shutdown Policy
 */
import { EventEmitter } from "node:events";
import { pluginRegistryService } from "./plugin-registry.js";
import { pluginLoader } from "./plugin-loader.js";
import { badRequest, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";
// ---------------------------------------------------------------------------
// Lifecycle state machine
// ---------------------------------------------------------------------------
/**
 * Valid state transitions for the plugin lifecycle.
 *
 *   installed → ready       (initial load succeeds)
 *   installed → error       (initial load fails)
 *   installed → uninstalled (abort installation)
 *
 *   ready → disabled        (operator disables plugin)
 *   ready → error           (runtime failure)
 *   ready → upgrade_pending (upgrade with new capabilities)
 *   ready → uninstalled     (uninstall)
 *
 *   disabled → ready        (operator re-enables plugin)
 *   disabled → uninstalled  (uninstall while disabled)
 *
 *   error → ready           (retry / recovery)
 *   error → uninstalled     (give up and uninstall)
 *
 *   upgrade_pending → ready       (operator approves new capabilities)
 *   upgrade_pending → error       (upgrade worker fails)
 *   upgrade_pending → uninstalled (reject upgrade and uninstall)
 *
 *   uninstalled → installed (reinstall)
 */
const VALID_TRANSITIONS = {
    installed: ["ready", "error", "uninstalled"],
    ready: ["ready", "disabled", "error", "upgrade_pending", "uninstalled"],
    disabled: ["ready", "uninstalled"],
    error: ["ready", "uninstalled"],
    upgrade_pending: ["ready", "error", "uninstalled"],
    uninstalled: ["installed"], // reinstall
};
/**
 * Check whether a transition from `from` → `to` is valid.
 */
function isValidTransition(from, to) {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
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
export function pluginLifecycleManager(db, options) {
    // Support the legacy signature: pluginLifecycleManager(db, loader)
    // as well as the new options object form.
    let loaderArg;
    let workerManager;
    if (options && typeof options === "object" && "discoverAll" in options) {
        // Legacy: second arg is a PluginLoader directly
        loaderArg = options;
    }
    else if (options && typeof options === "object") {
        const opts = options;
        loaderArg = opts.loader;
        workerManager = opts.workerManager;
    }
    const registry = pluginRegistryService(db);
    const pluginLoaderInstance = loaderArg ?? pluginLoader(db);
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100); // plugins may have many listeners; 100 is a safe upper bound
    const log = logger.child({ service: "plugin-lifecycle" });
    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------
    async function requirePlugin(pluginId) {
        const plugin = await registry.getById(pluginId);
        if (!plugin)
            throw notFound(`Plugin not found: ${pluginId}`);
        return plugin;
    }
    function assertTransition(plugin, to) {
        if (!isValidTransition(plugin.status, to)) {
            throw badRequest(`Invalid lifecycle transition: ${plugin.status} → ${to} for plugin ${plugin.pluginKey}`);
        }
    }
    async function transition(pluginId, to, lastError = null, existingPlugin) {
        const plugin = existingPlugin ?? await requirePlugin(pluginId);
        assertTransition(plugin, to);
        const previousStatus = plugin.status;
        const updated = await registry.updateStatus(pluginId, {
            status: to,
            lastError,
        });
        if (!updated)
            throw notFound(`Plugin not found after status update: ${pluginId}`);
        const result = updated;
        log.info({ pluginId, pluginKey: result.pluginKey, from: previousStatus, to }, `plugin lifecycle: ${previousStatus} → ${to}`);
        // Emit the generic status_changed event
        emitter.emit("plugin.status_changed", {
            pluginId,
            pluginKey: result.pluginKey,
            previousStatus,
            newStatus: to,
        });
        return result;
    }
    function emitDomain(event, payload) {
        emitter.emit(event, payload);
    }
    // -----------------------------------------------------------------------
    // Worker management helpers
    // -----------------------------------------------------------------------
    /**
     * Stop the worker for a plugin if one is running.
     * This is a best-effort operation — if no worker manager is configured
     * or no worker is running, it silently succeeds.
     */
    async function stopWorkerIfRunning(pluginId, pluginKey) {
        if (!workerManager)
            return;
        if (!workerManager.isRunning(pluginId) && !workerManager.getWorker(pluginId))
            return;
        try {
            await workerManager.stopWorker(pluginId);
            log.info({ pluginId, pluginKey }, "plugin lifecycle: worker stopped");
            emitDomain("plugin.worker_stopped", { pluginId, pluginKey });
        }
        catch (err) {
            log.warn({ pluginId, pluginKey, err: err instanceof Error ? err.message : String(err) }, "plugin lifecycle: failed to stop worker (best-effort)");
        }
    }
    async function activateReadyPlugin(pluginId) {
        const supportsRuntimeActivation = typeof pluginLoaderInstance.hasRuntimeServices === "function"
            && typeof pluginLoaderInstance.loadSingle === "function";
        if (!supportsRuntimeActivation || !pluginLoaderInstance.hasRuntimeServices()) {
            return;
        }
        const loadResult = await pluginLoaderInstance.loadSingle(pluginId);
        if (!loadResult.success) {
            throw new Error(loadResult.error
                ?? `Failed to activate plugin ${loadResult.plugin.pluginKey}`);
        }
    }
    async function deactivatePluginRuntime(pluginId, pluginKey) {
        const supportsRuntimeDeactivation = typeof pluginLoaderInstance.hasRuntimeServices === "function"
            && typeof pluginLoaderInstance.unloadSingle === "function";
        if (supportsRuntimeDeactivation && pluginLoaderInstance.hasRuntimeServices()) {
            await pluginLoaderInstance.unloadSingle(pluginId, pluginKey);
            return;
        }
        await stopWorkerIfRunning(pluginId, pluginKey);
    }
    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    return {
        // -- load -------------------------------------------------------------
        /**
         * load — Transitions a plugin to 'ready' status and starts its worker.
         *
         * This method is called after a plugin has been successfully installed and
         * validated. It marks the plugin as ready in the database and immediately
         * triggers the plugin loader to start the worker process.
         *
         * @param pluginId - The UUID of the plugin to load.
         * @returns The updated plugin record.
         */
        async load(pluginId) {
            const result = await transition(pluginId, "ready");
            await activateReadyPlugin(pluginId);
            emitDomain("plugin.loaded", {
                pluginId,
                pluginKey: result.pluginKey,
            });
            emitDomain("plugin.enabled", {
                pluginId,
                pluginKey: result.pluginKey,
            });
            return result;
        },
        // -- enable -----------------------------------------------------------
        /**
         * enable — Re-enables a plugin that was previously in an error or upgrade state.
         *
         * Similar to load(), this method transitions the plugin to 'ready' and starts
         * its worker, but it specifically targets plugins that are currently disabled.
         *
         * @param pluginId - The UUID of the plugin to enable.
         * @returns The updated plugin record.
         */
        async enable(pluginId) {
            const plugin = await requirePlugin(pluginId);
            // Only allow enabling from disabled, error, or upgrade_pending states
            if (plugin.status !== "disabled" && plugin.status !== "error" && plugin.status !== "upgrade_pending") {
                throw badRequest(`Cannot enable plugin in status '${plugin.status}'. ` +
                    `Plugin must be in 'disabled', 'error', or 'upgrade_pending' status to be enabled.`);
            }
            const result = await transition(pluginId, "ready", null, plugin);
            await activateReadyPlugin(pluginId);
            emitDomain("plugin.enabled", {
                pluginId,
                pluginKey: result.pluginKey,
            });
            return result;
        },
        // -- disable ----------------------------------------------------------
        async disable(pluginId, reason) {
            const plugin = await requirePlugin(pluginId);
            // Only allow disabling from ready state
            if (plugin.status !== "ready") {
                throw badRequest(`Cannot disable plugin in status '${plugin.status}'. ` +
                    `Plugin must be in 'ready' status to be disabled.`);
            }
            await deactivatePluginRuntime(pluginId, plugin.pluginKey);
            const result = await transition(pluginId, "disabled", reason ?? null, plugin);
            emitDomain("plugin.disabled", {
                pluginId,
                pluginKey: result.pluginKey,
                reason,
            });
            return result;
        },
        // -- unload -----------------------------------------------------------
        async unload(pluginId, removeData = false) {
            const plugin = await requirePlugin(pluginId);
            // If already uninstalled and removeData, hard-delete
            if (plugin.status === "uninstalled") {
                if (removeData) {
                    await pluginLoaderInstance.cleanupInstallArtifacts(plugin);
                    const deleted = await registry.uninstall(pluginId, true);
                    log.info({ pluginId, pluginKey: plugin.pluginKey }, "plugin lifecycle: hard-deleted already-uninstalled plugin");
                    emitDomain("plugin.unloaded", {
                        pluginId,
                        pluginKey: plugin.pluginKey,
                        removeData: true,
                    });
                    return deleted;
                }
                throw badRequest(`Plugin ${plugin.pluginKey} is already uninstalled. ` +
                    `Use removeData=true to permanently delete it.`);
            }
            await deactivatePluginRuntime(pluginId, plugin.pluginKey);
            await pluginLoaderInstance.cleanupInstallArtifacts(plugin);
            // Perform the uninstall via registry (handles soft/hard delete)
            const result = await registry.uninstall(pluginId, removeData);
            log.info({ pluginId, pluginKey: plugin.pluginKey, removeData }, `plugin lifecycle: ${plugin.status} → uninstalled${removeData ? " (hard delete)" : ""}`);
            emitter.emit("plugin.status_changed", {
                pluginId,
                pluginKey: plugin.pluginKey,
                previousStatus: plugin.status,
                newStatus: "uninstalled",
            });
            emitDomain("plugin.unloaded", {
                pluginId,
                pluginKey: plugin.pluginKey,
                removeData,
            });
            return result;
        },
        // -- markError --------------------------------------------------------
        async markError(pluginId, error) {
            // Stop the worker — the plugin is in an error state and should not
            // continue running. The worker manager's auto-restart is disabled
            // because we are intentionally taking the plugin offline.
            const plugin = await requirePlugin(pluginId);
            await deactivatePluginRuntime(pluginId, plugin.pluginKey);
            const result = await transition(pluginId, "error", error, plugin);
            emitDomain("plugin.error", {
                pluginId,
                pluginKey: result.pluginKey,
                error,
            });
            return result;
        },
        // -- markUpgradePending -----------------------------------------------
        async markUpgradePending(pluginId) {
            const plugin = await requirePlugin(pluginId);
            await deactivatePluginRuntime(pluginId, plugin.pluginKey);
            const result = await transition(pluginId, "upgrade_pending", null, plugin);
            emitDomain("plugin.upgrade_pending", {
                pluginId,
                pluginKey: result.pluginKey,
            });
            return result;
        },
        // -- upgrade ----------------------------------------------------------
        /**
         * Upgrade a plugin to a newer version by performing a package update and
         * managing the lifecycle state transition.
         *
         * Following PLUGIN_SPEC.md §25.3, the upgrade process:
         * 1. Stops the current worker process (if running).
         * 2. Fetches and validates the new plugin package via the `PluginLoader`.
         * 3. Compares the capabilities declared in the new manifest against the old one.
         * 4. If new capabilities are added, transitions the plugin to `upgrade_pending`
         *    to await operator approval (worker stays stopped).
         * 5. If no new capabilities are added, transitions the plugin back to `ready`
         *    with the updated version and manifest metadata.
         *
         * @param pluginId - The UUID of the plugin to upgrade.
         * @param version - Optional target version specifier.
         * @returns The updated `PluginRecord`.
         * @throws {BadRequest} If the plugin is not in a ready or upgrade_pending state.
         */
        async upgrade(pluginId, version) {
            const plugin = await requirePlugin(pluginId);
            // Can only upgrade plugins that are ready or already in upgrade_pending
            if (plugin.status !== "ready" && plugin.status !== "upgrade_pending") {
                throw badRequest(`Cannot upgrade plugin in status '${plugin.status}'. ` +
                    `Plugin must be in 'ready' or 'upgrade_pending' status to be upgraded.`);
            }
            log.info({ pluginId, pluginKey: plugin.pluginKey, targetVersion: version }, "plugin lifecycle: upgrade requested");
            await deactivatePluginRuntime(pluginId, plugin.pluginKey);
            // 1. Download and validate new package via loader
            const { oldManifest, newManifest, discovered } = await pluginLoaderInstance.upgradePlugin(pluginId, { version });
            log.info({
                pluginId,
                pluginKey: plugin.pluginKey,
                oldVersion: oldManifest.version,
                newVersion: newManifest.version,
            }, "plugin lifecycle: package upgraded on disk");
            // 2. Compare capabilities
            const addedCaps = newManifest.capabilities.filter((cap) => !oldManifest.capabilities.includes(cap));
            // 3. Transition state
            if (addedCaps.length > 0) {
                // New capabilities require operator approval — worker stays stopped
                log.info({ pluginId, pluginKey: plugin.pluginKey, addedCaps }, "plugin lifecycle: new capabilities detected, transitioning to upgrade_pending");
                // Skip the inner stopWorkerIfRunning since we already stopped above
                const result = await transition(pluginId, "upgrade_pending", null, plugin);
                emitDomain("plugin.upgrade_pending", {
                    pluginId,
                    pluginKey: result.pluginKey,
                });
                return result;
            }
            else {
                const result = await transition(pluginId, "ready", null, {
                    ...plugin,
                    version: discovered.version,
                    manifestJson: newManifest,
                });
                await activateReadyPlugin(pluginId);
                emitDomain("plugin.loaded", {
                    pluginId,
                    pluginKey: result.pluginKey,
                });
                emitDomain("plugin.enabled", {
                    pluginId,
                    pluginKey: result.pluginKey,
                });
                return result;
            }
        },
        // -- startWorker ------------------------------------------------------
        async startWorker(pluginId, options) {
            if (!workerManager) {
                throw badRequest("Cannot start worker: no PluginWorkerManager is configured. " +
                    "Provide a workerManager option when constructing the lifecycle manager.");
            }
            const plugin = await requirePlugin(pluginId);
            if (plugin.status !== "ready") {
                throw badRequest(`Cannot start worker for plugin in status '${plugin.status}'. ` +
                    `Plugin must be in 'ready' status.`);
            }
            log.info({ pluginId, pluginKey: plugin.pluginKey }, "plugin lifecycle: starting worker");
            await workerManager.startWorker(pluginId, options);
            emitDomain("plugin.worker_started", {
                pluginId,
                pluginKey: plugin.pluginKey,
            });
            log.info({ pluginId, pluginKey: plugin.pluginKey }, "plugin lifecycle: worker started");
        },
        // -- stopWorker -------------------------------------------------------
        async stopWorker(pluginId) {
            if (!workerManager)
                return; // No worker manager — nothing to stop
            const plugin = await requirePlugin(pluginId);
            await stopWorkerIfRunning(pluginId, plugin.pluginKey);
        },
        // -- restartWorker ----------------------------------------------------
        async restartWorker(pluginId) {
            if (!workerManager) {
                throw badRequest("Cannot restart worker: no PluginWorkerManager is configured.");
            }
            const plugin = await requirePlugin(pluginId);
            if (plugin.status !== "ready") {
                throw badRequest(`Cannot restart worker for plugin in status '${plugin.status}'. ` +
                    `Plugin must be in 'ready' status.`);
            }
            const handle = workerManager.getWorker(pluginId);
            if (!handle) {
                throw badRequest(`Cannot restart worker for plugin "${plugin.pluginKey}": no worker is running.`);
            }
            log.info({ pluginId, pluginKey: plugin.pluginKey }, "plugin lifecycle: restarting worker");
            await handle.restart();
            emitDomain("plugin.worker_stopped", { pluginId, pluginKey: plugin.pluginKey });
            emitDomain("plugin.worker_started", { pluginId, pluginKey: plugin.pluginKey });
            log.info({ pluginId, pluginKey: plugin.pluginKey }, "plugin lifecycle: worker restarted");
        },
        // -- getStatus --------------------------------------------------------
        async getStatus(pluginId) {
            const plugin = await registry.getById(pluginId);
            return plugin?.status ?? null;
        },
        // -- canTransition ----------------------------------------------------
        async canTransition(pluginId, to) {
            const plugin = await registry.getById(pluginId);
            if (!plugin)
                return false;
            return isValidTransition(plugin.status, to);
        },
        // -- Event subscriptions ----------------------------------------------
        on(event, listener) {
            emitter.on(event, listener);
        },
        off(event, listener) {
            emitter.off(event, listener);
        },
        once(event, listener) {
            emitter.once(event, listener);
        },
    };
}
//# sourceMappingURL=plugin-lifecycle.js.map