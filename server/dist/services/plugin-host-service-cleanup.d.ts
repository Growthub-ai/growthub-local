import type { PluginLifecycleManager } from "./plugin-lifecycle.js";
type LifecycleLike = Pick<PluginLifecycleManager, "on" | "off">;
export interface PluginWorkerRuntimeEvent {
    type: "plugin.worker.crashed" | "plugin.worker.restarted";
    pluginId: string;
}
export interface PluginHostServiceCleanupController {
    handleWorkerEvent(event: PluginWorkerRuntimeEvent): void;
    disposeAll(): void;
    teardown(): void;
}
export declare function createPluginHostServiceCleanup(lifecycle: LifecycleLike, disposers: Map<string, () => void>): PluginHostServiceCleanupController;
export {};
//# sourceMappingURL=plugin-host-service-cleanup.d.ts.map