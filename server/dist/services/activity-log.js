import { randomUUID } from "node:crypto";
import { activityLog } from "@paperclipai/db";
import { PLUGIN_EVENT_TYPES } from "@paperclipai/shared";
import { publishLiveEvent } from "./live-events.js";
import { redactCurrentUserValue } from "../log-redaction.js";
import { sanitizeRecord } from "../redaction.js";
import { logger } from "../middleware/logger.js";
const PLUGIN_EVENT_SET = new Set(PLUGIN_EVENT_TYPES);
let _pluginEventBus = null;
/** Wire the plugin event bus so domain events are forwarded to plugins. */
export function setPluginEventBus(bus) {
    if (_pluginEventBus) {
        logger.warn("setPluginEventBus called more than once, replacing existing bus");
    }
    _pluginEventBus = bus;
}
export async function logActivity(db, input) {
    const sanitizedDetails = input.details ? sanitizeRecord(input.details) : null;
    const redactedDetails = sanitizedDetails ? redactCurrentUserValue(sanitizedDetails) : null;
    await db.insert(activityLog).values({
        companyId: input.companyId,
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        agentId: input.agentId ?? null,
        runId: input.runId ?? null,
        details: redactedDetails,
    });
    publishLiveEvent({
        companyId: input.companyId,
        type: "activity.logged",
        payload: {
            actorType: input.actorType,
            actorId: input.actorId,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId,
            agentId: input.agentId ?? null,
            runId: input.runId ?? null,
            details: redactedDetails,
        },
    });
    if (_pluginEventBus && PLUGIN_EVENT_SET.has(input.action)) {
        const event = {
            eventId: randomUUID(),
            eventType: input.action,
            occurredAt: new Date().toISOString(),
            actorId: input.actorId,
            actorType: input.actorType,
            entityId: input.entityId,
            entityType: input.entityType,
            companyId: input.companyId,
            payload: {
                ...redactedDetails,
                agentId: input.agentId ?? null,
                runId: input.runId ?? null,
            },
        };
        void _pluginEventBus.emit(event).then(({ errors }) => {
            for (const { pluginId, error } of errors) {
                logger.warn({ pluginId, eventType: event.eventType, err: error }, "plugin event handler failed");
            }
        }).catch(() => { });
    }
}
//# sourceMappingURL=activity-log.js.map