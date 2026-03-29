/**
 * @fileoverview Plugin management REST API routes
 *
 * This module provides Express routes for managing the complete plugin lifecycle:
 * - Listing and filtering plugins by status
 * - Installing plugins from npm or local paths
 * - Uninstalling plugins (soft delete or hard purge)
 * - Enabling/disabling plugins
 * - Running health diagnostics
 * - Upgrading plugins
 * - Retrieving UI slot contributions for frontend rendering
 * - Discovering and executing plugin-contributed agent tools
 *
 * All routes require board-level authentication (assertBoard middleware).
 *
 * @module server/routes/plugins
 * @see doc/plugins/PLUGIN_SPEC.md for the full plugin specification
 */
import type { Db } from "@paperclipai/db";
import { pluginLoader } from "../services/plugin-loader.js";
import type { PluginJobScheduler } from "../services/plugin-job-scheduler.js";
import type { PluginJobStore } from "../services/plugin-job-store.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";
import type { PluginStreamBus } from "../services/plugin-stream-bus.js";
import type { PluginToolDispatcher } from "../services/plugin-tool-dispatcher.js";
/**
 * Optional dependencies for plugin job scheduling routes.
 *
 * When provided, job-related routes (list jobs, list runs, trigger job) are
 * mounted. When omitted, the routes return 501 Not Implemented.
 */
export interface PluginRouteJobDeps {
    /** The job scheduler instance. */
    scheduler: PluginJobScheduler;
    /** The job persistence store. */
    jobStore: PluginJobStore;
}
/**
 * Optional dependencies for plugin webhook routes.
 *
 * When provided, the webhook ingestion route is enabled. When omitted,
 * webhook POST requests return 501 Not Implemented.
 */
export interface PluginRouteWebhookDeps {
    /** The worker manager for dispatching handleWebhook RPC calls. */
    workerManager: PluginWorkerManager;
}
/**
 * Optional dependencies for plugin tool routes.
 *
 * When provided, tool discovery and execution routes are enabled.
 * When omitted, the tool routes return 501 Not Implemented.
 */
export interface PluginRouteToolDeps {
    /** The tool dispatcher for listing and executing plugin tools. */
    toolDispatcher: PluginToolDispatcher;
}
/**
 * Optional dependencies for plugin UI bridge routes.
 *
 * When provided, the getData and performAction bridge proxy routes are enabled,
 * allowing plugin UI components to communicate with their worker backend via
 * `usePluginData()` and `usePluginAction()` hooks.
 *
 * @see PLUGIN_SPEC.md §13.8 — `getData`
 * @see PLUGIN_SPEC.md §13.9 — `performAction`
 * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
 */
export interface PluginRouteBridgeDeps {
    /** The worker manager for dispatching getData/performAction RPC calls. */
    workerManager: PluginWorkerManager;
    /** Optional stream bus for SSE push from worker to UI. */
    streamBus?: PluginStreamBus;
}
/**
 * Create Express router for plugin management API.
 *
 * Routes provided:
 *
 * | Method | Path | Description |
 * |--------|------|-------------|
 * | GET | /plugins | List all plugins (optional ?status= filter) |
 * | GET | /plugins/ui-contributions | Get UI slots from ready plugins |
 * | GET | /plugins/:pluginId | Get single plugin by ID or key |
 * | POST | /plugins/install | Install from npm or local path |
 * | DELETE | /plugins/:pluginId | Uninstall (optional ?purge=true) |
 * | POST | /plugins/:pluginId/enable | Enable a plugin |
 * | POST | /plugins/:pluginId/disable | Disable a plugin |
 * | GET | /plugins/:pluginId/health | Run health diagnostics |
 * | POST | /plugins/:pluginId/upgrade | Upgrade to newer version |
 * | GET | /plugins/:pluginId/jobs | List jobs for a plugin |
 * | GET | /plugins/:pluginId/jobs/:jobId/runs | List runs for a job |
 * | POST | /plugins/:pluginId/jobs/:jobId/trigger | Manually trigger a job |
 * | POST | /plugins/:pluginId/webhooks/:endpointKey | Receive inbound webhook |
 * | GET | /plugins/tools | List all available plugin tools |
 * | GET | /plugins/tools?pluginId=... | List tools for a specific plugin |
 * | POST | /plugins/tools/execute | Execute a plugin tool |
 * | GET | /plugins/:pluginId/config | Get current plugin config |
 * | POST | /plugins/:pluginId/config | Save (upsert) plugin config |
 * | POST | /plugins/:pluginId/config/test | Test config via validateConfig RPC |
 * | POST | /plugins/:pluginId/bridge/data | Proxy getData to plugin worker |
 * | POST | /plugins/:pluginId/bridge/action | Proxy performAction to plugin worker |
 * | POST | /plugins/:pluginId/data/:key | Proxy getData to plugin worker (key in URL) |
 * | POST | /plugins/:pluginId/actions/:key | Proxy performAction to plugin worker (key in URL) |
 * | GET | /plugins/:pluginId/bridge/stream/:channel | SSE stream from worker to UI |
 * | GET | /plugins/:pluginId/dashboard | Aggregated health dashboard data |
 *
 * **Route Ordering Note:** Static routes (like /ui-contributions, /tools) must be
 * registered before parameterized routes (like /:pluginId) to prevent Express from
 * matching them as a plugin ID.
 *
 * @param db - Database connection instance
 * @param jobDeps - Optional job scheduling dependencies
 * @param webhookDeps - Optional webhook ingestion dependencies
 * @param toolDeps - Optional tool dispatcher dependencies
 * @param bridgeDeps - Optional bridge proxy dependencies for getData/performAction
 * @returns Express router with plugin routes mounted
 */
export declare function pluginRoutes(db: Db, loader: ReturnType<typeof pluginLoader>, jobDeps?: PluginRouteJobDeps, webhookDeps?: PluginRouteWebhookDeps, toolDeps?: PluginRouteToolDeps, bridgeDeps?: PluginRouteBridgeDeps): import("express-serve-static-core").Router;
//# sourceMappingURL=plugins.d.ts.map