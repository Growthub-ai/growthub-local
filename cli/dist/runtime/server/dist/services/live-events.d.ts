import { EventEmitter } from "node:events";
import type { LiveEvent, LiveEventType } from "@paperclipai/shared";
type LiveEventPayload = Record<string, unknown>;
type LiveEventListener = (event: LiveEvent) => void;
export declare function publishLiveEvent(input: {
    companyId: string;
    type: LiveEventType;
    payload?: LiveEventPayload;
}): LiveEvent;
export declare function publishGlobalLiveEvent(input: {
    type: LiveEventType;
    payload?: LiveEventPayload;
}): LiveEvent;
export declare function subscribeCompanyLiveEvents(companyId: string, listener: LiveEventListener): () => EventEmitter<[never]>;
export declare function subscribeGlobalLiveEvents(listener: LiveEventListener): () => EventEmitter<[never]>;
export {};
//# sourceMappingURL=live-events.d.ts.map