import type { Db } from "@paperclipai/db";
import type { PaperclipPluginManifestV1, PluginLauncherDeclaration, PluginRecord, PluginUiSlotDeclaration } from "@paperclipai/shared";
import type { PluginWorkerManager, WorkerToHostHandlers } from "./plugin-worker-manager.js";
import type { PluginEventBus } from "./plugin-event-bus.js";
import type { PluginJobScheduler } from "./plugin-job-scheduler.js";
import type { PluginJobStore } from "./plugin-job-store.js";
import type { PluginToolDispatcher } from "./plugin-tool-dispatcher.js";
import type { PluginLifecycleManager } from "./plugin-lifecycle.js";
/**
 * Naming convention for npm-published Paperclip plugins.
 * Packages matching this pattern are considered Paperclip plugins.
 *
 * @see PLUGIN_SPEC.md §10 — Package Contract
 */
export declare const NPM_PLUGIN_PACKAGE_PREFIX = "paperclip-plugin-";
/**
 * Default local plugin directory.  The loader scans this directory for
 * locally-installed plugin packages.
 *
 * @see PLUGIN_SPEC.md §8.1 — On-Disk Layout
 */
export declare const DEFAULT_LOCAL_PLUGIN_DIR: string;
/**
 * A plugin package found during discovery from any source.
 */
export interface DiscoveredPlugin {
    /** Absolute path to the root of the npm package directory. */
    packagePath: string;
    /** The npm package name as declared in package.json. */
    packageName: string;
    /** Semver version from package.json. */
    version: string;
    /** Source that found this package. */
    source: PluginSource;
    /** The parsed and validated manifest if available, null if discovery-only. */
    manifest: PaperclipPluginManifestV1 | null;
}
/**
 * Sources from which plugins can be discovered.
 *
 * @see PLUGIN_SPEC.md §8.1 — On-Disk Layout
 */
export type PluginSource = "local-filesystem" | "npm" | "registry";
/**
 * Result of a discovery scan.
 */
export interface PluginDiscoveryResult {
    /** Plugins successfully discovered and validated. */
    discovered: DiscoveredPlugin[];
    /** Packages found but with validation errors. */
    errors: Array<{
        packagePath: string;
        packageName: string;
        error: string;
    }>;
    /** Source(s) that were scanned. */
    sources: PluginSource[];
}
/**
 * Options for the plugin loader service.
 */
export interface PluginLoaderOptions {
    /**
     * Path to the local plugin directory to scan.
     * Defaults to ~/.paperclip/plugins/
     */
    localPluginDir?: string;
    /**
     * Whether to scan the local filesystem directory for plugins.
     * Defaults to true.
     */
    enableLocalFilesystem?: boolean;
    /**
     * Whether to discover installed npm packages matching the paperclip-plugin-*
     * naming convention.
     * Defaults to true.
     */
    enableNpmDiscovery?: boolean;
    /**
     * Future: URL of the remote plugin registry to query.
     * When set, the loader will also fetch available plugins from this endpoint.
     * Registry support is not yet implemented; this field is reserved.
     */
    registryUrl?: string;
}
/**
 * Options for installing a single plugin package.
 */
export interface PluginInstallOptions {
    /**
     * npm package name to install (e.g. "paperclip-plugin-linear" or "@acme/plugin-linear").
     * Either packageName or localPath must be set.
     */
    packageName?: string;
    /**
     * Absolute or relative path to a local plugin directory for development installs.
     * When set, the plugin is loaded from this path without npm install.
     * Either packageName or localPath must be set.
     */
    localPath?: string;
    /**
     * Version specifier passed to npm install (e.g. "^1.2.0", "latest").
     * Ignored when localPath is set.
     */
    version?: string;
    /**
     * Plugin install directory where packages are managed.
     * Defaults to the localPluginDir configured on the service.
     */
    installDir?: string;
}
/**
 * Runtime services passed to the loader for plugin initialization.
 *
 * When these are provided, the loader can fully activate plugins (spawn
 * workers, register event subscriptions, sync jobs, register tools).
 * When omitted, the loader operates in discovery/install-only mode.
 *
 * @see PLUGIN_SPEC.md §8.3 — Install Process
 * @see PLUGIN_SPEC.md §12 — Process Model
 */
export interface PluginRuntimeServices {
    /** Worker process manager for spawning and managing plugin workers. */
    workerManager: PluginWorkerManager;
    /** Event bus for registering plugin event subscriptions. */
    eventBus: PluginEventBus;
    /** Job scheduler for registering plugin cron jobs. */
    jobScheduler: PluginJobScheduler;
    /** Job store for syncing manifest job declarations to the DB. */
    jobStore: PluginJobStore;
    /** Tool dispatcher for registering plugin-contributed agent tools. */
    toolDispatcher: PluginToolDispatcher;
    /** Lifecycle manager for state transitions and worker lifecycle events. */
    lifecycleManager: PluginLifecycleManager;
    /**
     * Factory that creates worker-to-host RPC handlers for a given plugin.
     *
     * The returned handlers service worker→host calls (e.g. state.get,
     * events.emit, config.get). Each plugin gets its own set of handlers
     * scoped to its capabilities and plugin ID.
     */
    buildHostHandlers: (pluginId: string, manifest: PaperclipPluginManifestV1) => WorkerToHostHandlers;
    /**
     * Host instance information passed to the worker during initialization.
     * Includes the instance ID and host version.
     */
    instanceInfo: {
        instanceId: string;
        hostVersion: string;
    };
}
/**
 * Result of activating (loading) a single plugin at runtime.
 *
 * Contains the plugin record, activation status, and any error that
 * occurred during the process.
 */
export interface PluginLoadResult {
    /** The plugin record from the database. */
    plugin: PluginRecord;
    /** Whether the plugin was successfully activated. */
    success: boolean;
    /** Error message if activation failed. */
    error?: string;
    /** Which subsystems were registered during activation. */
    registered: {
        /** True if the worker process was started. */
        worker: boolean;
        /** Number of event subscriptions registered (from manifest event declarations). */
        eventSubscriptions: number;
        /** Number of job declarations synced to the database. */
        jobs: number;
        /** Number of webhook endpoints declared in manifest. */
        webhooks: number;
        /** Number of agent tools registered. */
        tools: number;
    };
}
/**
 * Result of activating all ready plugins at server startup.
 */
export interface PluginLoadAllResult {
    /** Total number of plugins that were attempted. */
    total: number;
    /** Number of plugins successfully activated. */
    succeeded: number;
    /** Number of plugins that failed to activate. */
    failed: number;
    /** Per-plugin results. */
    results: PluginLoadResult[];
}
/**
 * Normalized UI contribution metadata extracted from a plugin manifest.
 *
 * The host serves all plugin UI bundles from the manifest's `entrypoints.ui`
 * directory and currently expects the bundle entry module to be `index.js`.
 */
export interface PluginUiContributionMetadata {
    uiEntryFile: string;
    slots: PluginUiSlotDeclaration[];
    launchers: PluginLauncherDeclaration[];
}
export interface PluginLoader {
    /**
     * Discover all available plugins from configured sources.
     *
     * This performs a non-destructive scan of all enabled sources and returns
     * the discovered plugins with their parsed manifests.  No installs or DB
     * writes happen during discovery.
     *
     * @param npmSearchDirs - Optional override for node_modules directories to search.
     *   Passed through to discoverFromNpm. When omitted the defaults are used.
     *
     * @see PLUGIN_SPEC.md §8.1 — On-Disk Layout
     * @see PLUGIN_SPEC.md §8.3 — Install Process
     */
    discoverAll(npmSearchDirs?: string[]): Promise<PluginDiscoveryResult>;
    /**
     * Scan the local filesystem plugin directory for installed plugin packages.
     *
     * Reads the plugin directory, attempts to load each subdirectory as an npm
     * package, and validates the plugin manifest.
     *
     * @param dir - Directory to scan (defaults to configured localPluginDir).
     */
    discoverFromLocalFilesystem(dir?: string): Promise<PluginDiscoveryResult>;
    /**
     * Discover Paperclip plugins installed as npm packages in the current
     * Node.js environment matching the "paperclip-plugin-*" naming convention.
     *
     * Looks for packages in node_modules that match the naming convention.
     *
     * @param searchDirs - node_modules directories to search (defaults to process cwd resolution).
     */
    discoverFromNpm(searchDirs?: string[]): Promise<PluginDiscoveryResult>;
    /**
     * Load and parse the plugin manifest from a package directory.
     *
     * Reads the package.json, finds the manifest entrypoint declared under
     * the "paperclipPlugin.manifest" key, loads the manifest module, and
     * validates it against the plugin manifest schema.
     *
     * Returns null if the package is not a Paperclip plugin.
     * Throws if the package is a Paperclip plugin but the manifest is invalid.
     *
     * @see PLUGIN_SPEC.md §10 — Package Contract
     */
    loadManifest(packagePath: string): Promise<PaperclipPluginManifestV1 | null>;
    /**
     * Install a plugin package and register it in the database.
     *
     * Follows the install process described in PLUGIN_SPEC.md §8.3:
     * 1. Resolve npm package / local path.
     * 2. Install into the plugin directory (npm install).
     * 3. Read and validate plugin manifest.
     * 4. Reject incompatible plugin API versions.
     * 5. Validate manifest capabilities.
     * 6. Persist install record in Postgres.
     * 7. Return the discovered plugin for the caller to use.
     *
     * Worker spawning and lifecycle management are handled by the caller
     * (pluginLifecycleManager and the server startup orchestration).
     *
     * @see PLUGIN_SPEC.md §8.3 — Install Process
     */
    installPlugin(options: PluginInstallOptions): Promise<DiscoveredPlugin>;
    /**
     * Upgrade an already-installed plugin to a newer version.
     *
     * Similar to installPlugin, but:
     * 1. Requires the plugin to already exist in the database.
     * 2. Uses the existing packageName if not provided in options.
     * 3. Updates the existing plugin record instead of creating a new one.
     * 4. Returns the old and new manifests for capability comparison.
     *
     * @see PLUGIN_SPEC.md §25.3 — Upgrade Lifecycle
     */
    upgradePlugin(pluginId: string, options: Omit<PluginInstallOptions, "installDir">): Promise<{
        oldManifest: PaperclipPluginManifestV1;
        newManifest: PaperclipPluginManifestV1;
        discovered: DiscoveredPlugin;
    }>;
    /**
     * Check whether a plugin API version is supported by this host.
     */
    isSupportedApiVersion(apiVersion: number): boolean;
    /**
     * Remove runtime-managed on-disk install artifacts for a plugin.
     *
     * This only cleans files under the managed local plugin directory. Local-path
     * source checkouts outside that directory are intentionally left alone.
     */
    cleanupInstallArtifacts(plugin: PluginRecord): Promise<void>;
    /**
     * Get the local plugin directory this loader is configured to use.
     */
    getLocalPluginDir(): string;
    /**
     * Load and activate all plugins that are in `ready` status.
     *
     * This is the main server-startup orchestration method. For each plugin
     * that is persisted as `ready`, it:
     * 1. Resolves the worker entrypoint from the manifest.
     * 2. Spawns the worker process via the worker manager.
     * 3. Syncs job declarations from the manifest to the `plugin_jobs` table.
     * 4. Registers the plugin with the job scheduler.
     * 5. Registers event subscriptions declared in the manifest (scoped via the event bus).
     * 6. Registers agent tools from the manifest via the tool dispatcher.
     *
     * Plugins that fail to activate are marked as `error` in the database.
     * Activation failures are non-fatal — other plugins continue loading.
     *
     * **Requires** `PluginRuntimeServices` to have been provided at construction.
     * Throws if runtime services are not available.
     *
     * @returns Aggregated results for all attempted plugin loads.
     *
     * @see PLUGIN_SPEC.md §8.4 — Server-Start Plugin Loading
     * @see PLUGIN_SPEC.md §12 — Process Model
     */
    loadAll(): Promise<PluginLoadAllResult>;
    /**
     * Activate a single plugin that is in `installed` or `ready` status.
     *
     * Used after a fresh install (POST /api/plugins/install) or after
     * enabling a previously disabled plugin. Performs the same subsystem
     * registration as `loadAll()` but for a single plugin.
     *
     * If the plugin is in `installed` status, transitions it to `ready`
     * via the lifecycle manager before spawning the worker.
     *
     * **Requires** `PluginRuntimeServices` to have been provided at construction.
     *
     * @param pluginId - UUID of the plugin to activate
     * @returns The activation result for this plugin
     *
     * @see PLUGIN_SPEC.md §8.3 — Install Process
     */
    loadSingle(pluginId: string): Promise<PluginLoadResult>;
    /**
     * Deactivate a single plugin — stop its worker and unregister all
     * subsystem registrations (events, jobs, tools).
     *
     * Used during plugin disable, uninstall, and before upgrade. Does NOT
     * change the plugin's status in the database — that is the caller's
     * responsibility (via the lifecycle manager).
     *
     * **Requires** `PluginRuntimeServices` to have been provided at construction.
     *
     * @param pluginId - UUID of the plugin to deactivate
     * @param pluginKey - The plugin key (manifest ID) for scoped cleanup
     *
     * @see PLUGIN_SPEC.md §8.5 — Uninstall Process
     */
    unloadSingle(pluginId: string, pluginKey: string): Promise<void>;
    /**
     * Stop all managed plugin workers. Called during server shutdown.
     *
     * Stops the job scheduler and then stops all workers via the worker
     * manager. Does NOT change plugin statuses in the database — plugins
     * remain in `ready` so they are restarted on next boot.
     *
     * **Requires** `PluginRuntimeServices` to have been provided at construction.
     */
    shutdownAll(): Promise<void>;
    /**
     * Whether runtime services are available for plugin activation.
     */
    hasRuntimeServices(): boolean;
}
/**
 * Check whether a package name matches the Paperclip plugin naming convention.
 * Accepts both the "paperclip-plugin-" prefix and scoped "@scope/plugin-" packages.
 *
 * @see PLUGIN_SPEC.md §10 — Package Contract
 */
export declare function isPluginPackageName(name: string): boolean;
/**
 * Extract UI contribution metadata from a manifest for route serialization.
 *
 * Returns `null` when the plugin does not declare any UI slots or launchers.
 * Launcher declarations are aggregated from both the legacy top-level
 * `launchers` field and the preferred `ui.launchers` field.
 */
export declare function getPluginUiContributionMetadata(manifest: PaperclipPluginManifestV1): PluginUiContributionMetadata | null;
/**
 * Create a PluginLoader service.
 *
 * The loader is responsible for plugin discovery, installation, and runtime
 * activation.  It reads plugin packages from the local filesystem and npm,
 * validates their manifests, registers them in the database, and — when
 * runtime services are provided — initialises worker processes, event
 * subscriptions, job schedules, webhook endpoints, and agent tools.
 *
 * Usage (discovery & install only):
 * ```ts
 * const loader = pluginLoader(db, { enableLocalFilesystem: true });
 *
 * // Discover all available plugins
 * const result = await loader.discoverAll();
 * for (const plugin of result.discovered) {
 *   console.log(plugin.packageName, plugin.manifest?.id);
 * }
 *
 * // Install a specific plugin
 * const discovered = await loader.installPlugin({
 *   packageName: "paperclip-plugin-linear",
 *   version: "^1.0.0",
 * });
 * ```
 *
 * Usage (full runtime activation at server startup):
 * ```ts
 * const loader = pluginLoader(db, loaderOpts, {
 *   workerManager,
 *   eventBus,
 *   jobScheduler,
 *   jobStore,
 *   toolDispatcher,
 *   lifecycleManager,
 *   buildHostHandlers: (pluginId, manifest) => ({ ... }),
 *   instanceInfo: { instanceId: "inst-1", hostVersion: "1.0.0" },
 * });
 *
 * // Load all ready plugins at startup
 * const loadResult = await loader.loadAll();
 * console.log(`Loaded ${loadResult.succeeded}/${loadResult.total} plugins`);
 *
 * // Load a single plugin after install
 * const singleResult = await loader.loadSingle(pluginId);
 *
 * // Shutdown all plugin workers on server exit
 * await loader.shutdownAll();
 * ```
 *
 * @see PLUGIN_SPEC.md §8.1 — On-Disk Layout
 * @see PLUGIN_SPEC.md §8.3 — Install Process
 * @see PLUGIN_SPEC.md §12 — Process Model
 */
export declare function pluginLoader(db: Db, options?: PluginLoaderOptions, runtimeServices?: PluginRuntimeServices): PluginLoader;
//# sourceMappingURL=plugin-loader.d.ts.map