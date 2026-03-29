/**
 * In-memory pub/sub bus for plugin SSE streams.
 *
 * Workers emit stream events via JSON-RPC notifications. The bus fans out
 * each event to all connected SSE clients that match the (pluginId, channel,
 * companyId) tuple.
 *
 * @see PLUGIN_SPEC.md §19.8 — Real-Time Streaming
 */
/**
 * Composite key for stream subscriptions: pluginId:channel:companyId
 */
function streamKey(pluginId, channel, companyId) {
    return `${pluginId}:${channel}:${companyId}`;
}
/**
 * Create a new PluginStreamBus instance.
 */
export function createPluginStreamBus() {
    const subscribers = new Map();
    return {
        subscribe(pluginId, channel, companyId, listener) {
            const key = streamKey(pluginId, channel, companyId);
            let set = subscribers.get(key);
            if (!set) {
                set = new Set();
                subscribers.set(key, set);
            }
            set.add(listener);
            return () => {
                set.delete(listener);
                if (set.size === 0) {
                    subscribers.delete(key);
                }
            };
        },
        publish(pluginId, channel, companyId, event, eventType = "message") {
            const key = streamKey(pluginId, channel, companyId);
            const set = subscribers.get(key);
            if (!set)
                return;
            for (const listener of set) {
                listener(event, eventType);
            }
        },
    };
}
//# sourceMappingURL=plugin-stream-bus.js.map