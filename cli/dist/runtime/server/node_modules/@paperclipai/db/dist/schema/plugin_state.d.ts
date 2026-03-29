/**
 * `plugin_state` table — scoped key-value storage for plugin workers.
 *
 * Each row stores a single JSON value identified by
 * `(plugin_id, scope_kind, scope_id, namespace, state_key)`. Plugins use
 * this table through `ctx.state.get()`, `ctx.state.set()`, and
 * `ctx.state.delete()` in the SDK.
 *
 * Scope kinds determine the granularity of isolation:
 * - `instance` — one value shared across the whole Paperclip instance
 * - `company` — one value per company
 * - `project` — one value per project
 * - `project_workspace` — one value per project workspace
 * - `agent` — one value per agent
 * - `issue` — one value per issue
 * - `goal` — one value per goal
 * - `run` — one value per agent run
 *
 * The `namespace` column defaults to `"default"` and can be used to
 * logically group keys without polluting the root namespace.
 *
 * @see PLUGIN_SPEC.md §21.3 — `plugin_state`
 */
export declare const pluginState: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "plugin_state";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugin_state";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        pluginId: import("drizzle-orm/pg-core").PgColumn<{
            name: "plugin_id";
            tableName: "plugin_state";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scopeKind: import("drizzle-orm/pg-core").PgColumn<{
            name: "scope_kind";
            tableName: "plugin_state";
            dataType: "string";
            columnType: "PgText";
            data: "company" | "agent" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: "company" | "agent" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
        }>;
        scopeId: import("drizzle-orm/pg-core").PgColumn<{
            name: "scope_id";
            tableName: "plugin_state";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        namespace: import("drizzle-orm/pg-core").PgColumn<{
            name: "namespace";
            tableName: "plugin_state";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        stateKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "state_key";
            tableName: "plugin_state";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        valueJson: import("drizzle-orm/pg-core").PgColumn<{
            name: "value_json";
            tableName: "plugin_state";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugin_state";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
//# sourceMappingURL=plugin_state.d.ts.map