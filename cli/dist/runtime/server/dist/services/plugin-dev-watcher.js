/**
 * PluginDevWatcher — watches local-path plugin directories for file changes
 * and triggers worker restarts so plugin authors get a fast rebuild-and-reload
 * cycle without manually restarting the server.
 *
 * Only plugins installed from a local path (i.e. those with a non-null
 * `packagePath` in the DB) are watched. File changes in the plugin's package
 * directory trigger a debounced worker restart via the lifecycle manager.
 *
 * Uses chokidar rather than raw fs.watch so we get a production-grade watcher
 * backend across platforms and avoid exhausting file descriptors as quickly in
 * large dev workspaces.
 *
 * @see PLUGIN_SPEC.md §27.2 — Local Development Workflow
 */
import chokidar from "chokidar";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { logger } from "../middleware/logger.js";
const log = logger.child({ service: "plugin-dev-watcher" });
/** Debounce interval for file changes (ms). */
const DEBOUNCE_MS = 500;
function shouldIgnorePath(filename) {
    if (!filename)
        return false;
    const normalized = filename.replace(/\\/g, "/");
    const segments = normalized.split("/").filter(Boolean);
    return segments.some((segment) => segment === "node_modules" ||
        segment === ".git" ||
        segment === ".vite" ||
        segment === ".paperclip-sdk" ||
        segment.startsWith("."));
}
export function resolvePluginWatchTargets(packagePath, fsDeps) {
    const fileExists = fsDeps?.existsSync ?? existsSync;
    const readFile = fsDeps?.readFileSync ?? readFileSync;
    const readDir = fsDeps?.readdirSync ?? readdirSync;
    const statFile = fsDeps?.statSync ?? statSync;
    const absPath = path.resolve(packagePath);
    const targets = new Map();
    function addWatchTarget(targetPath, recursive, kind) {
        const resolved = path.resolve(targetPath);
        if (!fileExists(resolved))
            return;
        const inferredKind = kind ?? (statFile(resolved).isDirectory() ? "dir" : "file");
        const existing = targets.get(resolved);
        if (existing) {
            existing.recursive = existing.recursive || recursive;
            return;
        }
        targets.set(resolved, { path: resolved, recursive, kind: inferredKind });
    }
    function addRuntimeFilesFromDir(dirPath) {
        if (!fileExists(dirPath))
            return;
        for (const entry of readDir(dirPath, { withFileTypes: true })) {
            const entryPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                addRuntimeFilesFromDir(entryPath);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (!entry.name.endsWith(".js") && !entry.name.endsWith(".css"))
                continue;
            addWatchTarget(entryPath, false, "file");
        }
    }
    const packageJsonPath = path.join(absPath, "package.json");
    addWatchTarget(packageJsonPath, false, "file");
    if (!fileExists(packageJsonPath)) {
        return [...targets.values()];
    }
    let packageJson = null;
    try {
        packageJson = JSON.parse(readFile(packageJsonPath, "utf8"));
    }
    catch {
        packageJson = null;
    }
    const entrypointPaths = [
        packageJson?.paperclipPlugin?.manifest,
        packageJson?.paperclipPlugin?.worker,
        packageJson?.paperclipPlugin?.ui,
    ].filter((value) => typeof value === "string" && value.length > 0);
    if (entrypointPaths.length === 0) {
        addRuntimeFilesFromDir(path.join(absPath, "dist"));
        return [...targets.values()];
    }
    for (const relativeEntrypoint of entrypointPaths) {
        const resolvedEntrypoint = path.resolve(absPath, relativeEntrypoint);
        if (!fileExists(resolvedEntrypoint))
            continue;
        const stat = statFile(resolvedEntrypoint);
        if (stat.isDirectory()) {
            addRuntimeFilesFromDir(resolvedEntrypoint);
        }
        else {
            addWatchTarget(resolvedEntrypoint, false, "file");
        }
    }
    return [...targets.values()].sort((a, b) => a.path.localeCompare(b.path));
}
/**
 * Create a PluginDevWatcher that monitors local plugin directories and
 * restarts workers on file changes.
 */
export function createPluginDevWatcher(lifecycle, resolvePluginPackagePath, fsDeps) {
    const watchers = new Map();
    const debounceTimers = new Map();
    const fileExists = fsDeps?.existsSync ?? existsSync;
    function watchPlugin(pluginId, packagePath) {
        // Don't double-watch
        if (watchers.has(pluginId))
            return;
        const absPath = path.resolve(packagePath);
        if (!fileExists(absPath)) {
            log.warn({ pluginId, packagePath: absPath }, "plugin-dev-watcher: package path does not exist, skipping watch");
            return;
        }
        try {
            const watcherTargets = resolvePluginWatchTargets(absPath, fsDeps);
            if (watcherTargets.length === 0) {
                log.warn({ pluginId, packagePath: absPath }, "plugin-dev-watcher: no valid watch targets found, skipping watch");
                return;
            }
            const watcher = chokidar.watch(watcherTargets.map((target) => target.path), {
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 200,
                    pollInterval: 100,
                },
                ignored: (watchedPath) => {
                    const relativePath = path.relative(absPath, watchedPath);
                    return shouldIgnorePath(relativePath);
                },
            });
            watcher.on("all", (_eventName, changedPath) => {
                const relativePath = path.relative(absPath, changedPath);
                if (shouldIgnorePath(relativePath))
                    return;
                const existing = debounceTimers.get(pluginId);
                if (existing)
                    clearTimeout(existing);
                debounceTimers.set(pluginId, setTimeout(() => {
                    debounceTimers.delete(pluginId);
                    log.info({ pluginId, changedFile: relativePath || path.basename(changedPath) }, "plugin-dev-watcher: file change detected, restarting worker");
                    lifecycle.restartWorker(pluginId).catch((err) => {
                        log.warn({
                            pluginId,
                            err: err instanceof Error ? err.message : String(err),
                        }, "plugin-dev-watcher: failed to restart worker after file change");
                    });
                }, DEBOUNCE_MS));
            });
            watcher.on("error", (err) => {
                log.warn({
                    pluginId,
                    packagePath: absPath,
                    err: err instanceof Error ? err.message : String(err),
                }, "plugin-dev-watcher: watcher error, stopping watch for this plugin");
                unwatchPlugin(pluginId);
            });
            watchers.set(pluginId, watcher);
            log.info({
                pluginId,
                packagePath: absPath,
                watchTargets: watcherTargets.map((target) => ({
                    path: target.path,
                    kind: target.kind,
                })),
            }, "plugin-dev-watcher: watching local plugin for changes");
        }
        catch (err) {
            log.warn({
                pluginId,
                packagePath: absPath,
                err: err instanceof Error ? err.message : String(err),
            }, "plugin-dev-watcher: failed to start file watcher");
        }
    }
    function unwatchPlugin(pluginId) {
        const pluginWatcher = watchers.get(pluginId);
        if (pluginWatcher) {
            void pluginWatcher.close();
            watchers.delete(pluginId);
        }
        const timer = debounceTimers.get(pluginId);
        if (timer) {
            clearTimeout(timer);
            debounceTimers.delete(pluginId);
        }
    }
    function close() {
        lifecycle.off("plugin.loaded", handlePluginLoaded);
        lifecycle.off("plugin.enabled", handlePluginEnabled);
        lifecycle.off("plugin.disabled", handlePluginDisabled);
        lifecycle.off("plugin.unloaded", handlePluginUnloaded);
        for (const [pluginId] of watchers) {
            unwatchPlugin(pluginId);
        }
    }
    async function watchLocalPluginById(pluginId) {
        if (!resolvePluginPackagePath)
            return;
        try {
            const packagePath = await resolvePluginPackagePath(pluginId);
            if (!packagePath)
                return;
            watchPlugin(pluginId, packagePath);
        }
        catch (err) {
            log.warn({
                pluginId,
                err: err instanceof Error ? err.message : String(err),
            }, "plugin-dev-watcher: failed to resolve plugin package path");
        }
    }
    function handlePluginLoaded(payload) {
        void watchLocalPluginById(payload.pluginId);
    }
    function handlePluginEnabled(payload) {
        void watchLocalPluginById(payload.pluginId);
    }
    function handlePluginDisabled(payload) {
        unwatchPlugin(payload.pluginId);
    }
    function handlePluginUnloaded(payload) {
        unwatchPlugin(payload.pluginId);
    }
    lifecycle.on("plugin.loaded", handlePluginLoaded);
    lifecycle.on("plugin.enabled", handlePluginEnabled);
    lifecycle.on("plugin.disabled", handlePluginDisabled);
    lifecycle.on("plugin.unloaded", handlePluginUnloaded);
    return {
        watch: watchPlugin,
        unwatch: unwatchPlugin,
        close,
    };
}
//# sourceMappingURL=plugin-dev-watcher.js.map