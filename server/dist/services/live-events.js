import { EventEmitter } from "node:events";
const emitter = new EventEmitter();
emitter.setMaxListeners(0);
let nextEventId = 0;
function toLiveEvent(input) {
    nextEventId += 1;
    return {
        id: nextEventId,
        companyId: input.companyId,
        type: input.type,
        createdAt: new Date().toISOString(),
        payload: input.payload ?? {},
    };
}
export function publishLiveEvent(input) {
    const event = toLiveEvent(input);
    emitter.emit(input.companyId, event);
    return event;
}
export function publishGlobalLiveEvent(input) {
    const event = toLiveEvent({ companyId: "*", type: input.type, payload: input.payload });
    emitter.emit("*", event);
    return event;
}
export function subscribeCompanyLiveEvents(companyId, listener) {
    emitter.on(companyId, listener);
    return () => emitter.off(companyId, listener);
}
export function subscribeGlobalLiveEvents(listener) {
    emitter.on("*", listener);
    return () => emitter.off("*", listener);
}
//# sourceMappingURL=live-events.js.map