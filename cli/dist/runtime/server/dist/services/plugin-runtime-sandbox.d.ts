import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
import type { PluginCapabilityValidator } from "./plugin-capability-validator.js";
export declare class PluginSandboxError extends Error {
    constructor(message: string);
}
/**
 * Sandbox runtime options used when loading a plugin worker module.
 *
 * `allowedModuleSpecifiers` controls which bare module specifiers are permitted.
 * `allowedModules` provides concrete host-provided bindings for those specifiers.
 */
export interface PluginSandboxOptions {
    entrypointPath: string;
    allowedModuleSpecifiers?: ReadonlySet<string>;
    allowedModules?: Readonly<Record<string, Record<string, unknown>>>;
    allowedGlobals?: Record<string, unknown>;
    timeoutMs?: number;
}
/**
 * Operation-level runtime gate for plugin host API calls.
 * Every host operation must be checked against manifest capabilities before execution.
 */
export interface CapabilityScopedInvoker {
    invoke<T>(operation: string, fn: () => Promise<T> | T): Promise<T>;
}
interface LoadedModule {
    namespace: Record<string, unknown>;
}
export declare function createCapabilityScopedInvoker(manifest: PaperclipPluginManifestV1, validator: PluginCapabilityValidator): CapabilityScopedInvoker;
/**
 * Load a CommonJS plugin module in a VM context with explicit module import allow-listing.
 *
 * Security properties:
 * - no implicit access to host globals like `process`
 * - no unrestricted built-in module imports
 * - relative imports are resolved only inside the plugin root directory
 */
export declare function loadPluginModuleInSandbox(options: PluginSandboxOptions): Promise<LoadedModule>;
export {};
//# sourceMappingURL=plugin-runtime-sandbox.d.ts.map