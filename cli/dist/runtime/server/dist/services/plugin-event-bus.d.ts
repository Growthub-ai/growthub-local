/**
 * PluginEventBus — typed in-process event bus for the Paperclip plugin system.
 *
 * Responsibilities:
 * - Deliver core domain events to subscribing plugin workers (server-side).
 * - Apply `EventFilter` server-side so filtered-out events never reach the handler.
 * - Namespace plugin-emitted events as `plugin.<pluginId>.<eventName>`.
 * - Guard the core namespace: plugins may not emit events with the `plugin.` prefix.
 * - Isolate subscriptions per plugin — a plugin cannot enumerate or interfere with
 *   another plugin's subscriptions.
 * - Support wildcard subscriptions via prefix matching (e.g. `plugin.acme.linear.*`).
 *
 * The bus operates in-process. In the full out-of-process architecture the host
 * calls `bus.emit()` after receiving events from the DB/queue layer, and the bus
 * forwards to handlers that proxy the call to the relevant worker process via IPC.
 * That IPC layer is separate; this module only handles routing and filtering.
 *
 * @see PLUGIN_SPEC.md §16 — Event System
 * @see PLUGIN_SPEC.md §16.1 — Event Filtering
 * @see PLUGIN_SPEC.md §16.2 — Plugin-to-Plugin Events
 */
import type { PluginEventType } from "@paperclipai/shared";
import type { PluginEvent, EventFilter } from "@paperclipai/plugin-sdk";
/**
 * Creates and returns a new `PluginEventBus` instance.
 *
 * A single bus instance should be shared across the server process. Each
 * plugin interacts with the bus through a scoped handle obtained via
 * {@link PluginEventBus.forPlugin}.
 *
 * @example
 * ```ts
 * const bus = createPluginEventBus();
 *
 * // Give the Linear plugin a scoped handle
 * const linearBus = bus.forPlugin("acme.linear");
 *
 * // Subscribe from the plugin's perspective
 * linearBus.subscribe("issue.created", async (event) => {
 *   // handle event
 * });
 *
 * // Emit a core domain event (called by the host, not the plugin)
 * await bus.emit({
 *   eventId: "evt-1",
 *   eventType: "issue.created",
 *   occurredAt: new Date().toISOString(),
 *   entityId: "iss-1",
 *   entityType: "issue",
 *   payload: { title: "Fix login bug", projectId: "proj-1" },
 * });
 * ```
 */
export declare function createPluginEventBus(): PluginEventBus;
/**
 * Result returned from `emit()`. Handler errors are collected and returned
 * rather than thrown so a single misbehaving plugin cannot block delivery to
 * other plugins.
 */
export interface PluginEventBusEmitResult {
    /** Errors thrown by individual handlers, keyed by the plugin that failed. */
    errors: Array<{
        pluginId: string;
        error: unknown;
    }>;
}
/**
 * The full event bus — held by the host process.
 *
 * Call `forPlugin(id)` to obtain a `ScopedPluginEventBus` for each plugin worker.
 */
export interface PluginEventBus {
    /**
     * Emit a typed domain event to all matching subscribers.
     *
     * Called by the host when a domain event occurs (e.g. from the DB layer or
     * message queue). All registered subscriptions across all plugins are checked.
     */
    emit(event: PluginEvent): Promise<PluginEventBusEmitResult>;
    /**
     * Get a scoped handle for a specific plugin worker.
     *
     * The scoped handle isolates the plugin's subscriptions and enforces the
     * plugin namespace on outbound events.
     */
    forPlugin(pluginId: string): ScopedPluginEventBus;
    /**
     * Remove all subscriptions for a plugin (called on worker shutdown/uninstall).
     */
    clearPlugin(pluginId: string): void;
    /**
     * Return the total number of active subscriptions, or the count for a
     * specific plugin if `pluginId` is provided.
     */
    subscriptionCount(pluginId?: string): number;
}
/**
 * A plugin-scoped view of the event bus. Handed to the plugin worker (or its
 * host-side proxy) during initialisation.
 *
 * Plugins use this to:
 * 1. Subscribe to domain events (with optional server-side filter).
 * 2. Emit plugin-namespaced events for other plugins to consume.
 *
 * Note: `subscribe` overloads mirror the `PluginEventsClient.on()` interface
 * from the SDK. `emit` intentionally returns `PluginEventBusEmitResult` rather
 * than `void` so the host layer can inspect handler errors; the SDK-facing
 * `PluginEventsClient.emit()` wraps this and returns `void`.
 */
export interface ScopedPluginEventBus {
    /**
     * Subscribe to a core domain event or a plugin-namespaced event.
     *
     * **Pattern syntax:**
     * - Exact match: `"issue.created"` — receives only that event type.
     * - Wildcard suffix: `"plugin.acme.linear.*"` — receives all events emitted by
     *   the `acme.linear` plugin. The `*` is supported only as a trailing token after
     *   a `.` separator; no other glob syntax is supported.
     * - Top-level plugin wildcard: `"plugin.*"` — receives all plugin-emitted events
     *   regardless of which plugin emitted them.
     *
     * Wildcards apply only to the `plugin.*` namespace. Core domain events must be
     * subscribed to by exact name (e.g. `"issue.created"`, not `"issue.*"`).
     *
     * An optional `EventFilter` can be passed as the second argument to perform
     * server-side pre-filtering; filtered-out events are never delivered to the handler.
     */
    subscribe(eventPattern: PluginEventType | `plugin.${string}`, fn: (event: PluginEvent) => Promise<void>): void;
    subscribe(eventPattern: PluginEventType | `plugin.${string}`, filter: EventFilter, fn: (event: PluginEvent) => Promise<void>): void;
    /**
     * Emit a plugin-namespaced event. The bus automatically prepends
     * `plugin.<pluginId>.` to the `name`, so passing `"sync-done"` from plugin
     * `"acme.linear"` produces the event type `"plugin.acme.linear.sync-done"`.
     *
     * @param name  Bare event name (e.g. `"sync-done"`). Must be non-empty and
     *   must not include the `plugin.` prefix — the bus adds that automatically.
     * @param companyId  UUID of the company this event belongs to.
     * @param payload  Arbitrary JSON-serializable data to attach to the event.
     *
     * @throws {Error} if `name` is empty or whitespace-only.
     * @throws {Error} if `name` starts with `"plugin."` (namespace spoofing guard).
     */
    emit(name: string, companyId: string, payload: unknown): Promise<PluginEventBusEmitResult>;
    /**
     * Remove all subscriptions registered by this plugin.
     */
    clear(): void;
}
//# sourceMappingURL=plugin-event-bus.d.ts.map