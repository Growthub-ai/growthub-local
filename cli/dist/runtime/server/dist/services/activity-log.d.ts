import type { Db } from "@paperclipai/db";
import type { PluginEventBus } from "./plugin-event-bus.js";
/** Wire the plugin event bus so domain events are forwarded to plugins. */
export declare function setPluginEventBus(bus: PluginEventBus): void;
export interface LogActivityInput {
    companyId: string;
    actorType: "agent" | "user" | "system";
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    agentId?: string | null;
    runId?: string | null;
    details?: Record<string, unknown> | null;
}
export declare function logActivity(db: Db, input: LogActivityInput): Promise<void>;
//# sourceMappingURL=activity-log.d.ts.map