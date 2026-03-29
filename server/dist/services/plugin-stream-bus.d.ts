/**
 * In-memory pub/sub bus for plugin SSE streams.
 *
 * Workers emit stream events via JSON-RPC notifications. The bus fans out
 * each event to all connected SSE clients that match the (pluginId, channel,
 * companyId) tuple.
 *
 * @see PLUGIN_SPEC.md §19.8 — Real-Time Streaming
 */
/** Valid SSE event types for plugin streams. */
export type StreamEventType = "message" | "open" | "close" | "error";
export type StreamSubscriber = (event: unknown, eventType: StreamEventType) => void;
export interface PluginStreamBus {
    /**
     * Subscribe to stream events for a specific (pluginId, channel, companyId).
     * Returns an unsubscribe function.
     */
    subscribe(pluginId: string, channel: string, companyId: string, listener: StreamSubscriber): () => void;
    /**
     * Publish an event to all subscribers of (pluginId, channel, companyId).
     * Called by the worker manager when it receives a stream notification.
     */
    publish(pluginId: string, channel: string, companyId: string, event: unknown, eventType?: StreamEventType): void;
}
/**
 * Create a new PluginStreamBus instance.
 */
export declare function createPluginStreamBus(): PluginStreamBus;
//# sourceMappingURL=plugin-stream-bus.d.ts.map