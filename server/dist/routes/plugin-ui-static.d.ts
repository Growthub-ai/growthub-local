/**
 * @fileoverview Plugin UI static file serving route
 *
 * Serves plugin UI bundles from the plugin's dist/ui/ directory under the
 * `/_plugins/:pluginId/ui/*` namespace. This is specified in PLUGIN_SPEC.md
 * §19.0.3 (Bundle Serving).
 *
 * Plugin UI bundles are pre-built ESM that the host serves as static assets.
 * The host dynamically imports the plugin's UI entry module from this path,
 * resolves the named export declared in `ui.slots[].exportName`, and mounts
 * it into the extension slot.
 *
 * Security:
 * - Path traversal is prevented by resolving the requested path and verifying
 *   it stays within the plugin's UI directory.
 * - Only plugins in 'ready' status have their UI served.
 * - Only plugins that declare `entrypoints.ui` serve UI bundles.
 *
 * Cache Headers:
 * - Files with content-hash patterns in their name (e.g., `index-a1b2c3d4.js`)
 *   receive `Cache-Control: public, max-age=31536000, immutable`.
 * - Other files receive `Cache-Control: public, max-age=0, must-revalidate`
 *   with ETag-based conditional request support.
 *
 * @module server/routes/plugin-ui-static
 * @see doc/plugins/PLUGIN_SPEC.md §19.0.3 — Bundle Serving
 * @see doc/plugins/PLUGIN_SPEC.md §25.4.5 — Frontend Cache Invalidation
 */
import type { Db } from "@paperclipai/db";
/**
 * Resolve a plugin's UI directory from its package location.
 *
 * The plugin's `packageName` is stored in the DB. We resolve the package path
 * from the local plugin directory (DEFAULT_LOCAL_PLUGIN_DIR) by looking in
 * `node_modules`. If the plugin was installed from a local path, the manifest
 * `entrypoints.ui` path is resolved relative to the package directory.
 *
 * @param localPluginDir - The plugin installation directory
 * @param packageName - The npm package name
 * @param entrypointsUi - The UI entrypoint path from the manifest (e.g., "./dist/ui/")
 * @returns Absolute path to the UI directory, or null if not found
 */
export declare function resolvePluginUiDir(localPluginDir: string, packageName: string, entrypointsUi: string, packagePath?: string | null): string | null;
/**
 * Options for the plugin UI static route.
 */
export interface PluginUiStaticRouteOptions {
    /**
     * The local plugin installation directory.
     * This is where plugins are installed via `npm install --prefix`.
     * Defaults to the standard `~/.paperclip/plugins/` location.
     */
    localPluginDir: string;
}
/**
 * Create an Express router that serves plugin UI static files.
 *
 * This route handles `GET /_plugins/:pluginId/ui/*` requests by:
 * 1. Looking up the plugin in the registry by ID or key
 * 2. Verifying the plugin is in 'ready' status with UI declared
 * 3. Resolving the file path within the plugin's dist/ui/ directory
 * 4. Serving the file with appropriate cache headers
 *
 * @param db - Database connection for plugin registry lookups
 * @param options - Configuration options
 * @returns Express router
 */
export declare function pluginUiStaticRoutes(db: Db, options: PluginUiStaticRouteOptions): import("express-serve-static-core").Router;
//# sourceMappingURL=plugin-ui-static.d.ts.map