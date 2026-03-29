import type { Db } from "@paperclipai/db";
import { pluginState } from "@paperclipai/db";
import type { PluginStateScopeKind, SetPluginState, ListPluginState } from "@paperclipai/shared";
/**
 * Plugin State Store — scoped key-value persistence for plugin workers.
 *
 * Provides `get`, `set`, `delete`, and `list` operations over the
 * `plugin_state` table. Each plugin's data is strictly namespaced by
 * `pluginId` so plugins cannot read or write each other's state.
 *
 * This service implements the server-side backing for the `ctx.state` SDK
 * client exposed to plugin workers. The host is responsible for:
 * - enforcing `plugin.state.read` capability before calling `get` / `list`
 * - enforcing `plugin.state.write` capability before calling `set` / `delete`
 *
 * @see PLUGIN_SPEC.md §14 — SDK Surface (`ctx.state`)
 * @see PLUGIN_SPEC.md §15.1 — Capabilities: Plugin State
 * @see PLUGIN_SPEC.md §21.3 — `plugin_state` table
 */
export declare function pluginStateStore(db: Db): {
    /**
     * Read a state value.
     *
     * Returns the stored JSON value, or `null` if no entry exists for the
     * given scope and key.
     *
     * Requires `plugin.state.read` capability (enforced by the caller).
     *
     * @param pluginId - UUID of the owning plugin
     * @param scopeKind - Granularity of the scope
     * @param scopeId - Identifier for the scoped entity (null for `instance` scope)
     * @param stateKey - The key to read
     * @param namespace - Sub-namespace (defaults to `"default"`)
     */
    get: (pluginId: string, scopeKind: PluginStateScopeKind, stateKey: string, { scopeId, namespace, }?: {
        scopeId?: string;
        namespace?: string;
    }) => Promise<unknown>;
    /**
     * Write (create or replace) a state value.
     *
     * Uses an upsert so the caller does not need to check for prior existence.
     * On conflict (same composite key) the existing row's `value_json` and
     * `updated_at` are overwritten.
     *
     * Requires `plugin.state.write` capability (enforced by the caller).
     *
     * @param pluginId - UUID of the owning plugin
     * @param input - Scope key and value to store
     */
    set: (pluginId: string, input: SetPluginState) => Promise<void>;
    /**
     * Delete a state value.
     *
     * No-ops silently if the entry does not exist (idempotent by design).
     *
     * Requires `plugin.state.write` capability (enforced by the caller).
     *
     * @param pluginId - UUID of the owning plugin
     * @param scopeKind - Granularity of the scope
     * @param stateKey - The key to delete
     * @param scopeId - Identifier for the scoped entity (null for `instance` scope)
     * @param namespace - Sub-namespace (defaults to `"default"`)
     */
    delete: (pluginId: string, scopeKind: PluginStateScopeKind, stateKey: string, { scopeId, namespace, }?: {
        scopeId?: string;
        namespace?: string;
    }) => Promise<void>;
    /**
     * List all state entries for a plugin, optionally filtered by scope.
     *
     * Returns all matching rows as `PluginStateRecord`-shaped objects.
     * The `valueJson` field contains the stored value.
     *
     * Requires `plugin.state.read` capability (enforced by the caller).
     *
     * @param pluginId - UUID of the owning plugin
     * @param filter - Optional scope filters (scopeKind, scopeId, namespace)
     */
    list: (pluginId: string, filter?: ListPluginState) => Promise<(typeof pluginState.$inferSelect)[]>;
    /**
     * Delete all state entries owned by a plugin.
     *
     * Called during plugin uninstall when `removeData = true`. Also useful
     * for resetting a plugin's state during testing.
     *
     * @param pluginId - UUID of the owning plugin
     */
    deleteAll: (pluginId: string) => Promise<void>;
};
export type PluginStateStore = ReturnType<typeof pluginStateStore>;
//# sourceMappingURL=plugin-state-store.d.ts.map