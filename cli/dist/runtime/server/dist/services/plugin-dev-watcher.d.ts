import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import type { PluginLifecycleManager } from "./plugin-lifecycle.js";
export interface PluginDevWatcher {
    /** Start watching a local-path plugin directory. */
    watch(pluginId: string, packagePath: string): void;
    /** Stop watching a specific plugin. */
    unwatch(pluginId: string): void;
    /** Stop all watchers and clean up. */
    close(): void;
}
export type ResolvePluginPackagePath = (pluginId: string) => Promise<string | null | undefined>;
export interface PluginDevWatcherFsDeps {
    existsSync?: typeof existsSync;
    readFileSync?: typeof readFileSync;
    readdirSync?: typeof readdirSync;
    statSync?: typeof statSync;
}
type PluginWatchTarget = {
    path: string;
    recursive: boolean;
    kind: "file" | "dir";
};
export declare function resolvePluginWatchTargets(packagePath: string, fsDeps?: Pick<PluginDevWatcherFsDeps, "existsSync" | "readFileSync" | "readdirSync" | "statSync">): PluginWatchTarget[];
/**
 * Create a PluginDevWatcher that monitors local plugin directories and
 * restarts workers on file changes.
 */
export declare function createPluginDevWatcher(lifecycle: PluginLifecycleManager, resolvePluginPackagePath?: ResolvePluginPackagePath, fsDeps?: PluginDevWatcherFsDeps): PluginDevWatcher;
export {};
//# sourceMappingURL=plugin-dev-watcher.d.ts.map