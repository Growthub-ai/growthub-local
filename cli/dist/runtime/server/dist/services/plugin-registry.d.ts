import type { Db } from "@paperclipai/db";
import { pluginEntities } from "@paperclipai/db";
import type { PaperclipPluginManifestV1, PluginStatus, InstallPlugin, UpdatePluginStatus, UpsertPluginConfig, PatchPluginConfig, PluginEntityQuery, PluginJobStatus, PluginJobRunStatus, PluginJobRunTrigger, PluginWebhookDeliveryStatus } from "@paperclipai/shared";
/**
 * PluginRegistry – CRUD operations for the `plugins` and `plugin_config`
 * tables.  Follows the same factory-function pattern used by the rest of
 * the Paperclip service layer.
 *
 * This is the lowest-level persistence layer for plugins. Higher-level
 * concerns such as lifecycle state-machine enforcement and capability
 * gating are handled by {@link pluginLifecycleManager} and
 * {@link pluginCapabilityValidator} respectively.
 *
 * @see PLUGIN_SPEC.md §21.3 — Required Tables
 */
export declare function pluginRegistryService(db: Db): {
    /** List all registered plugins ordered by install order. */
    list: () => Omit<import("drizzle-orm/pg-core").PgSelectBase<"plugins", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugins";
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
        pluginKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "plugin_key";
            tableName: "plugins";
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
        packageName: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_name";
            tableName: "plugins";
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
        version: import("drizzle-orm/pg-core").PgColumn<{
            name: "version";
            tableName: "plugins";
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
        apiVersion: import("drizzle-orm/pg-core").PgColumn<{
            name: "api_version";
            tableName: "plugins";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        categories: import("drizzle-orm/pg-core").PgColumn<{
            name: "categories";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: ("automation" | "connector" | "workspace" | "ui")[];
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
            $type: ("automation" | "connector" | "workspace" | "ui")[];
        }>;
        manifestJson: import("drizzle-orm/pg-core").PgColumn<{
            name: "manifest_json";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: PaperclipPluginManifestV1;
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
            $type: PaperclipPluginManifestV1;
        }>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "plugins";
            dataType: "string";
            columnType: "PgText";
            data: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
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
            $type: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        }>;
        installOrder: import("drizzle-orm/pg-core").PgColumn<{
            name: "install_order";
            tableName: "plugins";
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
        packagePath: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_path";
            tableName: "plugins";
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
        lastError: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_error";
            tableName: "plugins";
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
        installedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "installed_at";
            tableName: "plugins";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugins";
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
    }, "single", Record<"plugins", "not-null">, false, "orderBy", {
        id: string;
        status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        updatedAt: Date;
        lastError: string | null;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        packageName: string;
        packagePath: string | null;
        pluginKey: string;
        manifestJson: PaperclipPluginManifestV1;
        installOrder: number | null;
        installedAt: Date;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugins";
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
        pluginKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "plugin_key";
            tableName: "plugins";
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
        packageName: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_name";
            tableName: "plugins";
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
        version: import("drizzle-orm/pg-core").PgColumn<{
            name: "version";
            tableName: "plugins";
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
        apiVersion: import("drizzle-orm/pg-core").PgColumn<{
            name: "api_version";
            tableName: "plugins";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        categories: import("drizzle-orm/pg-core").PgColumn<{
            name: "categories";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: ("automation" | "connector" | "workspace" | "ui")[];
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
            $type: ("automation" | "connector" | "workspace" | "ui")[];
        }>;
        manifestJson: import("drizzle-orm/pg-core").PgColumn<{
            name: "manifest_json";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: PaperclipPluginManifestV1;
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
            $type: PaperclipPluginManifestV1;
        }>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "plugins";
            dataType: "string";
            columnType: "PgText";
            data: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
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
            $type: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        }>;
        installOrder: import("drizzle-orm/pg-core").PgColumn<{
            name: "install_order";
            tableName: "plugins";
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
        packagePath: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_path";
            tableName: "plugins";
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
        lastError: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_error";
            tableName: "plugins";
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
        installedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "installed_at";
            tableName: "plugins";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugins";
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
    }>, "orderBy">;
    /**
     * List installed plugins (excludes soft-deleted/uninstalled).
     * Use for Plugin Manager and default API list so uninstalled plugins do not appear.
     */
    listInstalled: () => Omit<import("drizzle-orm/pg-core").PgSelectBase<"plugins", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugins";
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
        pluginKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "plugin_key";
            tableName: "plugins";
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
        packageName: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_name";
            tableName: "plugins";
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
        version: import("drizzle-orm/pg-core").PgColumn<{
            name: "version";
            tableName: "plugins";
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
        apiVersion: import("drizzle-orm/pg-core").PgColumn<{
            name: "api_version";
            tableName: "plugins";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        categories: import("drizzle-orm/pg-core").PgColumn<{
            name: "categories";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: ("automation" | "connector" | "workspace" | "ui")[];
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
            $type: ("automation" | "connector" | "workspace" | "ui")[];
        }>;
        manifestJson: import("drizzle-orm/pg-core").PgColumn<{
            name: "manifest_json";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: PaperclipPluginManifestV1;
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
            $type: PaperclipPluginManifestV1;
        }>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "plugins";
            dataType: "string";
            columnType: "PgText";
            data: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
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
            $type: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        }>;
        installOrder: import("drizzle-orm/pg-core").PgColumn<{
            name: "install_order";
            tableName: "plugins";
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
        packagePath: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_path";
            tableName: "plugins";
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
        lastError: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_error";
            tableName: "plugins";
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
        installedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "installed_at";
            tableName: "plugins";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugins";
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
    }, "single", Record<"plugins", "not-null">, false, "where" | "orderBy", {
        id: string;
        status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        updatedAt: Date;
        lastError: string | null;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        packageName: string;
        packagePath: string | null;
        pluginKey: string;
        manifestJson: PaperclipPluginManifestV1;
        installOrder: number | null;
        installedAt: Date;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugins";
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
        pluginKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "plugin_key";
            tableName: "plugins";
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
        packageName: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_name";
            tableName: "plugins";
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
        version: import("drizzle-orm/pg-core").PgColumn<{
            name: "version";
            tableName: "plugins";
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
        apiVersion: import("drizzle-orm/pg-core").PgColumn<{
            name: "api_version";
            tableName: "plugins";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        categories: import("drizzle-orm/pg-core").PgColumn<{
            name: "categories";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: ("automation" | "connector" | "workspace" | "ui")[];
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
            $type: ("automation" | "connector" | "workspace" | "ui")[];
        }>;
        manifestJson: import("drizzle-orm/pg-core").PgColumn<{
            name: "manifest_json";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: PaperclipPluginManifestV1;
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
            $type: PaperclipPluginManifestV1;
        }>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "plugins";
            dataType: "string";
            columnType: "PgText";
            data: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
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
            $type: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        }>;
        installOrder: import("drizzle-orm/pg-core").PgColumn<{
            name: "install_order";
            tableName: "plugins";
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
        packagePath: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_path";
            tableName: "plugins";
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
        lastError: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_error";
            tableName: "plugins";
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
        installedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "installed_at";
            tableName: "plugins";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugins";
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
    }>, "where" | "orderBy">;
    /** List plugins filtered by status. */
    listByStatus: (status: PluginStatus) => Omit<import("drizzle-orm/pg-core").PgSelectBase<"plugins", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugins";
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
        pluginKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "plugin_key";
            tableName: "plugins";
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
        packageName: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_name";
            tableName: "plugins";
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
        version: import("drizzle-orm/pg-core").PgColumn<{
            name: "version";
            tableName: "plugins";
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
        apiVersion: import("drizzle-orm/pg-core").PgColumn<{
            name: "api_version";
            tableName: "plugins";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        categories: import("drizzle-orm/pg-core").PgColumn<{
            name: "categories";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: ("automation" | "connector" | "workspace" | "ui")[];
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
            $type: ("automation" | "connector" | "workspace" | "ui")[];
        }>;
        manifestJson: import("drizzle-orm/pg-core").PgColumn<{
            name: "manifest_json";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: PaperclipPluginManifestV1;
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
            $type: PaperclipPluginManifestV1;
        }>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "plugins";
            dataType: "string";
            columnType: "PgText";
            data: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
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
            $type: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        }>;
        installOrder: import("drizzle-orm/pg-core").PgColumn<{
            name: "install_order";
            tableName: "plugins";
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
        packagePath: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_path";
            tableName: "plugins";
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
        lastError: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_error";
            tableName: "plugins";
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
        installedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "installed_at";
            tableName: "plugins";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugins";
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
    }, "single", Record<"plugins", "not-null">, false, "where" | "orderBy", {
        id: string;
        status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        updatedAt: Date;
        lastError: string | null;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        packageName: string;
        packagePath: string | null;
        pluginKey: string;
        manifestJson: PaperclipPluginManifestV1;
        installOrder: number | null;
        installedAt: Date;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugins";
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
        pluginKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "plugin_key";
            tableName: "plugins";
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
        packageName: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_name";
            tableName: "plugins";
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
        version: import("drizzle-orm/pg-core").PgColumn<{
            name: "version";
            tableName: "plugins";
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
        apiVersion: import("drizzle-orm/pg-core").PgColumn<{
            name: "api_version";
            tableName: "plugins";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        categories: import("drizzle-orm/pg-core").PgColumn<{
            name: "categories";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: ("automation" | "connector" | "workspace" | "ui")[];
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
            $type: ("automation" | "connector" | "workspace" | "ui")[];
        }>;
        manifestJson: import("drizzle-orm/pg-core").PgColumn<{
            name: "manifest_json";
            tableName: "plugins";
            dataType: "json";
            columnType: "PgJsonb";
            data: PaperclipPluginManifestV1;
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
            $type: PaperclipPluginManifestV1;
        }>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "plugins";
            dataType: "string";
            columnType: "PgText";
            data: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
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
            $type: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        }>;
        installOrder: import("drizzle-orm/pg-core").PgColumn<{
            name: "install_order";
            tableName: "plugins";
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
        packagePath: import("drizzle-orm/pg-core").PgColumn<{
            name: "package_path";
            tableName: "plugins";
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
        lastError: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_error";
            tableName: "plugins";
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
        installedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "installed_at";
            tableName: "plugins";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugins";
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
    }>, "where" | "orderBy">;
    /** Get a single plugin by primary key. */
    getById: (id: string) => Promise<{
        id: string;
        status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        updatedAt: Date;
        lastError: string | null;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        packageName: string;
        packagePath: string | null;
        pluginKey: string;
        manifestJson: PaperclipPluginManifestV1;
        installOrder: number | null;
        installedAt: Date;
    }>;
    /** Get a single plugin by its unique `pluginKey`. */
    getByKey: (pluginKey: string) => Promise<{
        id: string;
        status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        updatedAt: Date;
        lastError: string | null;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        packageName: string;
        packagePath: string | null;
        pluginKey: string;
        manifestJson: PaperclipPluginManifestV1;
        installOrder: number | null;
        installedAt: Date;
    }>;
    /**
     * Register (install) a new plugin.
     *
     * The caller is expected to have already resolved and validated the
     * manifest from the package.  This method persists the plugin row and
     * assigns the next install order.
     */
    install: (input: InstallPlugin, manifest: PaperclipPluginManifestV1) => Promise<{
        id: string;
        status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        updatedAt: Date;
        lastError: string | null;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        packageName: string;
        packagePath: string | null;
        pluginKey: string;
        manifestJson: PaperclipPluginManifestV1;
        installOrder: number | null;
        installedAt: Date;
    }>;
    /**
     * Update a plugin's manifest and version (e.g. on upgrade).
     * The plugin must already exist.
     */
    update: (id: string, data: {
        packageName?: string;
        version?: string;
        manifest?: PaperclipPluginManifestV1;
    }) => Promise<{
        id: string;
        pluginKey: string;
        packageName: string;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        manifestJson: PaperclipPluginManifestV1;
        status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        installOrder: number | null;
        packagePath: string | null;
        lastError: string | null;
        installedAt: Date;
        updatedAt: Date;
    }>;
    /** Update a plugin's lifecycle status and optional error message. */
    updateStatus: (id: string, input: UpdatePluginStatus) => Promise<{
        id: string;
        pluginKey: string;
        packageName: string;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        manifestJson: PaperclipPluginManifestV1;
        status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        installOrder: number | null;
        packagePath: string | null;
        lastError: string | null;
        installedAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Uninstall a plugin.
     *
     * When `removeData` is true the plugin row (and cascaded config) is
     * hard-deleted.  Otherwise the status is set to `"uninstalled"` for
     * a soft-delete that preserves the record.
     */
    uninstall: (id: string, removeData?: boolean) => Promise<{
        id: string;
        status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
        updatedAt: Date;
        lastError: string | null;
        version: string;
        apiVersion: number;
        categories: ("automation" | "connector" | "workspace" | "ui")[];
        packageName: string;
        packagePath: string | null;
        pluginKey: string;
        manifestJson: PaperclipPluginManifestV1;
        installOrder: number | null;
        installedAt: Date;
    }>;
    /** Retrieve a plugin's instance configuration. */
    getConfig: (pluginId: string) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastError: string | null;
        configJson: Record<string, unknown>;
        pluginId: string;
    }>;
    /**
     * Create or fully replace a plugin's instance configuration.
     * If a config row already exists for the plugin it is replaced;
     * otherwise a new row is inserted.
     */
    upsertConfig: (pluginId: string, input: UpsertPluginConfig) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastError: string | null;
        configJson: Record<string, unknown>;
        pluginId: string;
    }>;
    /**
     * Partially update a plugin's instance configuration via shallow merge.
     * If no config row exists yet one is created with the supplied values.
     */
    patchConfig: (pluginId: string, input: PatchPluginConfig) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastError: string | null;
        configJson: Record<string, unknown>;
        pluginId: string;
    }>;
    /**
     * Record an error against a plugin's config (e.g. validation failure
     * against the plugin's instanceConfigSchema).
     */
    setConfigError: (pluginId: string, lastError: string | null) => Promise<{
        id: string;
        pluginId: string;
        configJson: Record<string, unknown>;
        lastError: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Delete a plugin's config row. */
    deleteConfig: (pluginId: string) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastError: string | null;
        configJson: Record<string, unknown>;
        pluginId: string;
    }>;
    /**
     * List persistent entity mappings owned by a specific plugin, with filtering and pagination.
     *
     * @param pluginId - The UUID of the plugin.
     * @param query - Optional filters (type, externalId) and pagination (limit, offset).
     * @returns A list of matching `PluginEntityRecord` objects.
     */
    listEntities: (pluginId: string, query?: PluginEntityQuery) => Omit<import("drizzle-orm/pg-core").PgSelectBase<"plugin_entities", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugin_entities";
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
            tableName: "plugin_entities";
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
        entityType: import("drizzle-orm/pg-core").PgColumn<{
            name: "entity_type";
            tableName: "plugin_entities";
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
        scopeKind: import("drizzle-orm/pg-core").PgColumn<{
            name: "scope_kind";
            tableName: "plugin_entities";
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
            tableName: "plugin_entities";
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
        externalId: import("drizzle-orm/pg-core").PgColumn<{
            name: "external_id";
            tableName: "plugin_entities";
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
        title: import("drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "plugin_entities";
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
            tableName: "plugin_entities";
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
        data: import("drizzle-orm/pg-core").PgColumn<{
            name: "data";
            tableName: "plugin_entities";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
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
            $type: Record<string, unknown>;
        }>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "plugin_entities";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugin_entities";
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
    }, "single", Record<"plugin_entities", "not-null">, false, "where" | "orderBy" | "limit" | "offset", {
        id: string;
        data: Record<string, unknown>;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string | null;
        scopeId: string | null;
        externalId: string | null;
        entityType: string;
        scopeKind: "company" | "agent" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
        pluginId: string;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugin_entities";
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
            tableName: "plugin_entities";
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
        entityType: import("drizzle-orm/pg-core").PgColumn<{
            name: "entity_type";
            tableName: "plugin_entities";
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
        scopeKind: import("drizzle-orm/pg-core").PgColumn<{
            name: "scope_kind";
            tableName: "plugin_entities";
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
            tableName: "plugin_entities";
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
        externalId: import("drizzle-orm/pg-core").PgColumn<{
            name: "external_id";
            tableName: "plugin_entities";
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
        title: import("drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "plugin_entities";
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
            tableName: "plugin_entities";
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
        data: import("drizzle-orm/pg-core").PgColumn<{
            name: "data";
            tableName: "plugin_entities";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
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
            $type: Record<string, unknown>;
        }>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "plugin_entities";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugin_entities";
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
    }>, "where" | "orderBy" | "limit" | "offset">;
    /**
     * Look up a plugin-owned entity mapping by its external identifier.
     *
     * @param pluginId - The UUID of the plugin.
     * @param entityType - The type of entity (e.g., 'project', 'issue').
     * @param externalId - The identifier in the external system.
     * @returns The matching `PluginEntityRecord` or null.
     */
    getEntityByExternalId: (pluginId: string, entityType: string, externalId: string) => Promise<{
        id: string;
        data: Record<string, unknown>;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string | null;
        scopeId: string | null;
        externalId: string | null;
        entityType: string;
        scopeKind: "company" | "agent" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
        pluginId: string;
    }>;
    /**
     * Create or update a persistent mapping between a Paperclip object and an
     * external entity.
     *
     * @param pluginId - The UUID of the plugin.
     * @param input - The entity data to persist.
     * @returns The newly created or updated `PluginEntityRecord`.
     */
    upsertEntity: (pluginId: string, input: Omit<typeof pluginEntities.$inferInsert, "id" | "pluginId" | "createdAt" | "updatedAt">) => Promise<{
        id: string;
        data: Record<string, unknown>;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string | null;
        scopeId: string | null;
        externalId: string | null;
        entityType: string;
        scopeKind: "company" | "agent" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
        pluginId: string;
    }>;
    /**
     * Delete a specific plugin-owned entity mapping by its internal UUID.
     *
     * @param id - The UUID of the entity record.
     * @returns The deleted record, or null if not found.
     */
    deleteEntity: (id: string) => Promise<{
        id: string;
        data: Record<string, unknown>;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string | null;
        scopeId: string | null;
        externalId: string | null;
        entityType: string;
        scopeKind: "company" | "agent" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
        pluginId: string;
    }>;
    /**
     * List all scheduled jobs registered for a specific plugin.
     *
     * @param pluginId - The UUID of the plugin.
     * @returns A list of `PluginJobRecord` objects.
     */
    listJobs: (pluginId: string) => Omit<import("drizzle-orm/pg-core").PgSelectBase<"plugin_jobs", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugin_jobs";
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
            tableName: "plugin_jobs";
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
        jobKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "job_key";
            tableName: "plugin_jobs";
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
        schedule: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule";
            tableName: "plugin_jobs";
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
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "plugin_jobs";
            dataType: "string";
            columnType: "PgText";
            data: "active" | "paused" | "failed";
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
            $type: "active" | "paused" | "failed";
        }>;
        lastRunAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_run_at";
            tableName: "plugin_jobs";
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
        nextRunAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "next_run_at";
            tableName: "plugin_jobs";
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
            tableName: "plugin_jobs";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugin_jobs";
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
    }, "single", Record<"plugin_jobs", "not-null">, false, "where" | "orderBy", {
        id: string;
        status: "active" | "paused" | "failed";
        createdAt: Date;
        updatedAt: Date;
        schedule: string;
        jobKey: string;
        pluginId: string;
        lastRunAt: Date | null;
        nextRunAt: Date | null;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "plugin_jobs";
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
            tableName: "plugin_jobs";
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
        jobKey: import("drizzle-orm/pg-core").PgColumn<{
            name: "job_key";
            tableName: "plugin_jobs";
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
        schedule: import("drizzle-orm/pg-core").PgColumn<{
            name: "schedule";
            tableName: "plugin_jobs";
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
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "plugin_jobs";
            dataType: "string";
            columnType: "PgText";
            data: "active" | "paused" | "failed";
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
            $type: "active" | "paused" | "failed";
        }>;
        lastRunAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_run_at";
            tableName: "plugin_jobs";
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
        nextRunAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "next_run_at";
            tableName: "plugin_jobs";
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
            tableName: "plugin_jobs";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "plugin_jobs";
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
    }>, "where" | "orderBy">;
    /**
     * Look up a plugin job by its unique job key.
     *
     * @param pluginId - The UUID of the plugin.
     * @param jobKey - The key defined in the plugin manifest.
     * @returns The matching `PluginJobRecord` or null.
     */
    getJobByKey: (pluginId: string, jobKey: string) => Promise<{
        id: string;
        status: "active" | "paused" | "failed";
        createdAt: Date;
        updatedAt: Date;
        schedule: string;
        jobKey: string;
        pluginId: string;
        lastRunAt: Date | null;
        nextRunAt: Date | null;
    }>;
    /**
     * Register or update a scheduled job for a plugin.
     *
     * @param pluginId - The UUID of the plugin.
     * @param jobKey - The unique key for the job.
     * @param input - The schedule (cron) and optional status.
     * @returns The updated or created `PluginJobRecord`.
     */
    upsertJob: (pluginId: string, jobKey: string, input: {
        schedule: string;
        status?: PluginJobStatus;
    }) => Promise<{
        id: string;
        status: "active" | "paused" | "failed";
        createdAt: Date;
        updatedAt: Date;
        schedule: string;
        jobKey: string;
        pluginId: string;
        lastRunAt: Date | null;
        nextRunAt: Date | null;
    }>;
    /**
     * Record the start of a specific job execution.
     *
     * @param pluginId - The UUID of the plugin.
     * @param jobId - The UUID of the parent job record.
     * @param trigger - What triggered this run (e.g., 'schedule', 'manual').
     * @returns The newly created `PluginJobRunRecord` in 'pending' status.
     */
    createJobRun: (pluginId: string, jobId: string, trigger: PluginJobRunTrigger) => Promise<{
        id: string;
        status: "pending" | "queued" | "running" | "cancelled" | "failed" | "succeeded";
        createdAt: Date;
        finishedAt: Date | null;
        error: string | null;
        startedAt: Date | null;
        pluginId: string;
        jobId: string;
        trigger: "manual" | "schedule" | "retry";
        durationMs: number | null;
        logs: string[];
    }>;
    /**
     * Update the status, duration, and logs of a job execution record.
     *
     * @param runId - The UUID of the job run.
     * @param input - The update fields (status, error, duration, etc.).
     * @returns The updated `PluginJobRunRecord`.
     */
    updateJobRun: (runId: string, input: {
        status: PluginJobRunStatus;
        durationMs?: number;
        error?: string;
        logs?: string[];
        startedAt?: Date;
        finishedAt?: Date;
    }) => Promise<{
        id: string;
        jobId: string;
        pluginId: string;
        trigger: "manual" | "schedule" | "retry";
        status: "pending" | "queued" | "running" | "cancelled" | "failed" | "succeeded";
        durationMs: number | null;
        error: string | null;
        logs: string[];
        startedAt: Date | null;
        finishedAt: Date | null;
        createdAt: Date;
    }>;
    /**
     * Create a record for an incoming webhook delivery.
     *
     * @param pluginId - The UUID of the receiving plugin.
     * @param webhookKey - The endpoint key defined in the manifest.
     * @param input - The payload, headers, and optional external ID.
     * @returns The newly created `PluginWebhookDeliveryRecord` in 'pending' status.
     */
    createWebhookDelivery: (pluginId: string, webhookKey: string, input: {
        externalId?: string;
        payload: Record<string, unknown>;
        headers?: Record<string, string>;
    }) => Promise<{
        id: string;
        status: "pending" | "failed" | "success";
        createdAt: Date;
        payload: Record<string, unknown>;
        finishedAt: Date | null;
        error: string | null;
        startedAt: Date | null;
        externalId: string | null;
        pluginId: string;
        durationMs: number | null;
        webhookKey: string;
        headers: Record<string, string>;
    }>;
    /**
     * Update the status and processing metrics of a webhook delivery.
     *
     * @param deliveryId - The UUID of the delivery record.
     * @param input - The update fields (status, error, duration, etc.).
     * @returns The updated `PluginWebhookDeliveryRecord`.
     */
    updateWebhookDelivery: (deliveryId: string, input: {
        status: PluginWebhookDeliveryStatus;
        durationMs?: number;
        error?: string;
        startedAt?: Date;
        finishedAt?: Date;
    }) => Promise<{
        id: string;
        pluginId: string;
        webhookKey: string;
        externalId: string | null;
        status: "pending" | "failed" | "success";
        durationMs: number | null;
        error: string | null;
        payload: Record<string, unknown>;
        headers: Record<string, string>;
        startedAt: Date | null;
        finishedAt: Date | null;
        createdAt: Date;
    }>;
};
//# sourceMappingURL=plugin-registry.d.ts.map