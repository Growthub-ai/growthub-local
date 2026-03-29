import type { Db } from "@paperclipai/db";
import type { HostServices } from "@paperclipai/plugin-sdk";
import type { PluginEventBus } from "./plugin-event-bus.js";
/**
 * Flush all buffered log entries to the database in a single batch insert per
 * unique db instance. Errors are swallowed with a console.error fallback so
 * flushing never crashes the process.
 */
export declare function flushPluginLogBuffer(): Promise<void>;
export declare function buildHostServices(db: Db, pluginId: string, pluginKey: string, eventBus: PluginEventBus, notifyWorker?: (method: string, params: unknown) => void): HostServices & {
    dispose(): void;
};
//# sourceMappingURL=plugin-host-services.d.ts.map