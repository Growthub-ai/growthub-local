/**
 * `plugin_webhook_deliveries` table — inbound webhook delivery history for plugins.
 *
 * When an external system sends an HTTP POST to a plugin's registered webhook
 * endpoint (e.g. `/api/plugins/:pluginKey/webhooks/:webhookKey`), the server
 * creates a row in this table before dispatching the payload to the plugin
 * worker. This provides an auditable log of every delivery attempt.
 *
 * The `webhook_key` matches the key declared in the plugin manifest's
 * `webhooks` array. `external_id` is an optional identifier supplied by the
 * remote system (e.g. a GitHub delivery GUID) that can be used to detect
 * and reject duplicate deliveries.
 *
 * Status values:
 * - `pending` — received but not yet dispatched to the worker
 * - `processing` — currently being handled by the plugin worker
 * - `succeeded` — worker processed the payload successfully
 * - `failed` — worker returned an error or timed out
 *
 * @see PLUGIN_SPEC.md §21.3 — `plugin_webhook_deliveries`
 */
export declare const pluginWebhookDeliveries: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "plugin_webhook_deliveries";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugin_webhook_deliveries";
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
            tableName: "plugin_webhook_deliveries";
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
        webhookKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "webhook_key";
            tableName: "plugin_webhook_deliveries";
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
        externalId: import("drizzle-orm/pg-core").PgColumn<{
            name: "external_id";
            tableName: "plugin_webhook_deliveries";
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
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "plugin_webhook_deliveries";
            dataType: "string";
            columnType: "PgText";
            data: "pending" | "failed" | "success";
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
        }, {}, {
            $type: "pending" | "failed" | "success";
        }>;
        durationMs: import("drizzle-orm/pg-core").PgColumn<{
            name: "duration_ms";
            tableName: "plugin_webhook_deliveries";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        error: import("drizzle-orm/pg-core").PgColumn<{
            name: "error";
            tableName: "plugin_webhook_deliveries";
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
        payload: import("drizzle-orm/pg-core").PgColumn<{
            name: "payload";
            tableName: "plugin_webhook_deliveries";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
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
        }, {}, {
            $type: Record<string, unknown>;
        }>;
        headers: import("drizzle-orm/pg-core").PgColumn<{
            name: "headers";
            tableName: "plugin_webhook_deliveries";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, string>;
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: Record<string, string>;
        }>;
        startedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "started_at";
            tableName: "plugin_webhook_deliveries";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        finishedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "finished_at";
            tableName: "plugin_webhook_deliveries";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "plugin_webhook_deliveries";
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
//# sourceMappingURL=plugin_webhooks.d.ts.map