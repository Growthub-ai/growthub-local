import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
export class PluginSandboxError extends Error {
    constructor(message) {
        super(message);
        this.name = "PluginSandboxError";
    }
}
const DEFAULT_TIMEOUT_MS = 2_000;
const MODULE_PATH_SUFFIXES = ["", ".js", ".mjs", ".cjs", "/index.js", "/index.mjs", "/index.cjs"];
const DEFAULT_GLOBALS = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
};
export function createCapabilityScopedInvoker(manifest, validator) {
    return {
        async invoke(operation, fn) {
            validator.assertOperation(manifest, operation);
            return await fn();
        },
    };
}
/**
 * Load a CommonJS plugin module in a VM context with explicit module import allow-listing.
 *
 * Security properties:
 * - no implicit access to host globals like `process`
 * - no unrestricted built-in module imports
 * - relative imports are resolved only inside the plugin root directory
 */
export async function loadPluginModuleInSandbox(options) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const allowedSpecifiers = options.allowedModuleSpecifiers ?? new Set();
    const entrypointPath = path.resolve(options.entrypointPath);
    const pluginRoot = path.dirname(entrypointPath);
    const context = vm.createContext({
        ...DEFAULT_GLOBALS,
        ...options.allowedGlobals,
    });
    const moduleCache = new Map();
    const allowedModules = options.allowedModules ?? {};
    const realPluginRoot = realpathSync(pluginRoot);
    const loadModuleSync = (modulePath) => {
        const resolvedPath = resolveModulePathSync(path.resolve(modulePath));
        const realPath = realpathSync(resolvedPath);
        if (!isWithinRoot(realPath, realPluginRoot)) {
            throw new PluginSandboxError(`Import '${modulePath}' escapes plugin root and is not allowed`);
        }
        const cached = moduleCache.get(realPath);
        if (cached)
            return cached;
        const code = readModuleSourceSync(realPath);
        if (looksLikeEsm(code)) {
            throw new PluginSandboxError("Sandbox loader only supports CommonJS modules. Build plugin worker entrypoints as CJS for sandboxed loading.");
        }
        const module = { exports: {} };
        // Cache the module before execution to preserve CommonJS cycle semantics.
        moduleCache.set(realPath, module.exports);
        const requireInSandbox = (specifier) => {
            if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
                if (!allowedSpecifiers.has(specifier)) {
                    throw new PluginSandboxError(`Import denied for module '${specifier}'. Add an explicit sandbox allow-list entry.`);
                }
                const binding = allowedModules[specifier];
                if (!binding) {
                    throw new PluginSandboxError(`Bare module '${specifier}' is allow-listed but no host binding is registered.`);
                }
                return binding;
            }
            const candidatePath = path.resolve(path.dirname(realPath), specifier);
            return loadModuleSync(candidatePath);
        };
        // Inject the CJS module arguments into the context so the script can call
        // the wrapper immediately. This is critical: the timeout in runInContext
        // only applies during script evaluation. By including the self-invocation
        // `(fn)(exports, module, ...)` in the script text, the timeout also covers
        // the actual module body execution — preventing infinite loops from hanging.
        const sandboxArgs = {
            __paperclip_exports: module.exports,
            __paperclip_module: module,
            __paperclip_require: requireInSandbox,
            __paperclip_filename: realPath,
            __paperclip_dirname: path.dirname(realPath),
        };
        // Temporarily inject args into the context, run, then remove to avoid pollution.
        Object.assign(context, sandboxArgs);
        const wrapped = `(function (exports, module, require, __filename, __dirname) {\n${code}\n})(__paperclip_exports, __paperclip_module, __paperclip_require, __paperclip_filename, __paperclip_dirname)`;
        const script = new vm.Script(wrapped, { filename: realPath });
        try {
            script.runInContext(context, { timeout: timeoutMs });
        }
        finally {
            for (const key of Object.keys(sandboxArgs)) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete context[key];
            }
        }
        const normalizedExports = normalizeModuleExports(module.exports);
        moduleCache.set(realPath, normalizedExports);
        return normalizedExports;
    };
    const entryExports = loadModuleSync(entrypointPath);
    return {
        namespace: { ...entryExports },
    };
}
function resolveModulePathSync(candidatePath) {
    for (const suffix of MODULE_PATH_SUFFIXES) {
        const fullPath = `${candidatePath}${suffix}`;
        if (existsSync(fullPath)) {
            return fullPath;
        }
    }
    throw new PluginSandboxError(`Unable to resolve module import at path '${candidatePath}'`);
}
/**
 * True when `targetPath` is inside `rootPath` (or equals rootPath), false otherwise.
 * Uses `path.relative` so sibling-prefix paths (e.g. `/root-a` vs `/root`) cannot bypass checks.
 */
function isWithinRoot(targetPath, rootPath) {
    const relative = path.relative(rootPath, targetPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function readModuleSourceSync(modulePath) {
    try {
        return readFileSync(modulePath, "utf8");
    }
    catch (error) {
        throw new PluginSandboxError(`Failed to read sandbox module '${modulePath}': ${error instanceof Error ? error.message : String(error)}`);
    }
}
function normalizeModuleExports(exportsValue) {
    if (typeof exportsValue === "object" && exportsValue !== null) {
        return exportsValue;
    }
    return { default: exportsValue };
}
/**
 * Lightweight guard to reject ESM syntax in the VM CommonJS loader.
 */
function looksLikeEsm(code) {
    return /(^|\n)\s*import\s+/m.test(code) || /(^|\n)\s*export\s+/m.test(code);
}
//# sourceMappingURL=plugin-runtime-sandbox.js.map