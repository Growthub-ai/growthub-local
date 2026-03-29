export interface PluginDevServerOptions {
    /** Plugin project root. Defaults to `process.cwd()`. */
    rootDir?: string;
    /** Relative path from root to built UI assets. Defaults to `dist/ui`. */
    uiDir?: string;
    /** Bind port for local preview server. Defaults to `4177`. */
    port?: number;
    /** Bind host. Defaults to `127.0.0.1`. */
    host?: string;
}
export interface PluginDevServer {
    url: string;
    close(): Promise<void>;
}
/**
 * Start a local static server for plugin UI assets with SSE reload events.
 *
 * Endpoint summary:
 * - `GET /__paperclip__/health` for diagnostics
 * - `GET /__paperclip__/events` for hot-reload stream
 * - Any other path serves files from the configured UI build directory
 */
export declare function startPluginDevServer(options?: PluginDevServerOptions): Promise<PluginDevServer>;
/**
 * Return a stable file+mtime snapshot for a built plugin UI directory.
 *
 * Used by the polling watcher fallback and useful for tests that need to assert
 * whether a UI build has changed between runs.
 */
export declare function getUiBuildSnapshot(rootDir: string, uiDir?: string): Promise<Array<{
    file: string;
    mtimeMs: number;
}>>;
//# sourceMappingURL=dev-server.d.ts.map