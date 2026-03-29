import { z } from "zod";
/**
 * Permissive validator for JSON Schema objects. Accepts any `Record<string, unknown>`
 * that contains at least a `type`, `$ref`, or composition keyword (`oneOf`/`anyOf`/`allOf`).
 * Empty objects are also accepted.
 *
 * Used to validate `instanceConfigSchema` and `parametersSchema` fields in the
 * plugin manifest without fully parsing JSON Schema.
 *
 * @see PLUGIN_SPEC.md §10.1 — Manifest shape
 */
export declare const jsonSchemaSchema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodUnknown>, Record<string, unknown>, Record<string, unknown>>;
export declare const pluginJobDeclarationSchema: z.ZodObject<{
    jobKey: z.ZodString;
    displayName: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    schedule: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    jobKey: string;
    displayName: string;
    schedule?: string | undefined;
    description?: string | undefined;
}, {
    jobKey: string;
    displayName: string;
    schedule?: string | undefined;
    description?: string | undefined;
}>;
export type PluginJobDeclarationInput = z.infer<typeof pluginJobDeclarationSchema>;
/**
 * Validates a {@link PluginWebhookDeclaration} — a webhook endpoint declared
 * in the plugin manifest. Requires `endpointKey` and `displayName`.
 *
 * @see PLUGIN_SPEC.md §18 — Webhooks
 */
export declare const pluginWebhookDeclarationSchema: z.ZodObject<{
    endpointKey: z.ZodString;
    displayName: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    displayName: string;
    endpointKey: string;
    description?: string | undefined;
}, {
    displayName: string;
    endpointKey: string;
    description?: string | undefined;
}>;
export type PluginWebhookDeclarationInput = z.infer<typeof pluginWebhookDeclarationSchema>;
/**
 * Validates a {@link PluginToolDeclaration} — an agent tool contributed by the
 * plugin. Requires `name`, `displayName`, `description`, and a valid
 * `parametersSchema`. Requires the `agent.tools.register` capability.
 *
 * @see PLUGIN_SPEC.md §11 — Agent Tools
 */
export declare const pluginToolDeclarationSchema: z.ZodObject<{
    name: z.ZodString;
    displayName: z.ZodString;
    description: z.ZodString;
    parametersSchema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodUnknown>, Record<string, unknown>, Record<string, unknown>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    displayName: string;
    parametersSchema: Record<string, unknown>;
}, {
    name: string;
    description: string;
    displayName: string;
    parametersSchema: Record<string, unknown>;
}>;
export type PluginToolDeclarationInput = z.infer<typeof pluginToolDeclarationSchema>;
/**
 * Validates a {@link PluginUiSlotDeclaration} — a UI extension slot the plugin
 * fills with a React component. Includes `superRefine` checks for slot-specific
 * requirements such as `entityTypes` for context-sensitive slots.
 *
 * @see PLUGIN_SPEC.md §19 — UI Extension Model
 */
export declare const pluginUiSlotDeclarationSchema: z.ZodEffects<z.ZodObject<{
    type: z.ZodEnum<["page", "detailTab", "taskDetailView", "dashboardWidget", "sidebar", "sidebarPanel", "projectSidebarItem", "globalToolbarButton", "toolbarButton", "contextMenuItem", "commentAnnotation", "commentContextMenuItem", "settingsPage"]>;
    id: z.ZodString;
    displayName: z.ZodString;
    exportName: z.ZodString;
    entityTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<["project", "issue", "agent", "goal", "run", "comment"]>, "many">>;
    routePath: z.ZodOptional<z.ZodString>;
    order: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
    id: string;
    displayName: string;
    exportName: string;
    entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
    routePath?: string | undefined;
    order?: number | undefined;
}, {
    type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
    id: string;
    displayName: string;
    exportName: string;
    entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
    routePath?: string | undefined;
    order?: number | undefined;
}>, {
    type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
    id: string;
    displayName: string;
    exportName: string;
    entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
    routePath?: string | undefined;
    order?: number | undefined;
}, {
    type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
    id: string;
    displayName: string;
    exportName: string;
    entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
    routePath?: string | undefined;
    order?: number | undefined;
}>;
export type PluginUiSlotDeclarationInput = z.infer<typeof pluginUiSlotDeclarationSchema>;
/**
 * Validates the action payload for a declarative plugin launcher.
 */
export declare const pluginLauncherActionDeclarationSchema: z.ZodEffects<z.ZodObject<{
    type: z.ZodEnum<["navigate", "openModal", "openDrawer", "openPopover", "performAction", "deepLink"]>;
    target: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    target: string;
    type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
    params?: Record<string, unknown> | undefined;
}, {
    target: string;
    type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
    params?: Record<string, unknown> | undefined;
}>, {
    target: string;
    type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
    params?: Record<string, unknown> | undefined;
}, {
    target: string;
    type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
    params?: Record<string, unknown> | undefined;
}>;
export type PluginLauncherActionDeclarationInput = z.infer<typeof pluginLauncherActionDeclarationSchema>;
/**
 * Validates optional render hints for a plugin launcher destination.
 */
export declare const pluginLauncherRenderDeclarationSchema: z.ZodEffects<z.ZodObject<{
    environment: z.ZodEnum<["hostInline", "hostOverlay", "hostRoute", "external", "iframe"]>;
    bounds: z.ZodOptional<z.ZodEnum<["inline", "compact", "default", "wide", "full"]>>;
}, "strip", z.ZodTypeAny, {
    environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
    bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
}, {
    environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
    bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
}>, {
    environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
    bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
}, {
    environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
    bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
}>;
export type PluginLauncherRenderDeclarationInput = z.infer<typeof pluginLauncherRenderDeclarationSchema>;
/**
 * Validates declarative launcher metadata in a plugin manifest.
 */
export declare const pluginLauncherDeclarationSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    placementZone: z.ZodEnum<["page", "detailTab", "taskDetailView", "dashboardWidget", "sidebar", "sidebarPanel", "projectSidebarItem", "globalToolbarButton", "toolbarButton", "contextMenuItem", "commentAnnotation", "commentContextMenuItem", "settingsPage"]>;
    exportName: z.ZodOptional<z.ZodString>;
    entityTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<["project", "issue", "agent", "goal", "run", "comment"]>, "many">>;
    order: z.ZodOptional<z.ZodNumber>;
    action: z.ZodEffects<z.ZodObject<{
        type: z.ZodEnum<["navigate", "openModal", "openDrawer", "openPopover", "performAction", "deepLink"]>;
        target: z.ZodString;
        params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        target: string;
        type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
        params?: Record<string, unknown> | undefined;
    }, {
        target: string;
        type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
        params?: Record<string, unknown> | undefined;
    }>, {
        target: string;
        type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
        params?: Record<string, unknown> | undefined;
    }, {
        target: string;
        type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
        params?: Record<string, unknown> | undefined;
    }>;
    render: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        environment: z.ZodEnum<["hostInline", "hostOverlay", "hostRoute", "external", "iframe"]>;
        bounds: z.ZodOptional<z.ZodEnum<["inline", "compact", "default", "wide", "full"]>>;
    }, "strip", z.ZodTypeAny, {
        environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
        bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
    }, {
        environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
        bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
    }>, {
        environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
        bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
    }, {
        environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
        bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    action: {
        target: string;
        type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
        params?: Record<string, unknown> | undefined;
    };
    displayName: string;
    placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
    description?: string | undefined;
    exportName?: string | undefined;
    entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
    order?: number | undefined;
    render?: {
        environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
        bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
    } | undefined;
}, {
    id: string;
    action: {
        target: string;
        type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
        params?: Record<string, unknown> | undefined;
    };
    displayName: string;
    placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
    description?: string | undefined;
    exportName?: string | undefined;
    entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
    order?: number | undefined;
    render?: {
        environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
        bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
    } | undefined;
}>, {
    id: string;
    action: {
        target: string;
        type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
        params?: Record<string, unknown> | undefined;
    };
    displayName: string;
    placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
    description?: string | undefined;
    exportName?: string | undefined;
    entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
    order?: number | undefined;
    render?: {
        environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
        bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
    } | undefined;
}, {
    id: string;
    action: {
        target: string;
        type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
        params?: Record<string, unknown> | undefined;
    };
    displayName: string;
    placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
    description?: string | undefined;
    exportName?: string | undefined;
    entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
    order?: number | undefined;
    render?: {
        environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
        bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
    } | undefined;
}>;
export type PluginLauncherDeclarationInput = z.infer<typeof pluginLauncherDeclarationSchema>;
/**
 * Zod schema for {@link PaperclipPluginManifestV1} — the complete runtime
 * validator for plugin manifests read at install time.
 *
 * Field-level constraints (see PLUGIN_SPEC.md §10.1 for the normative rules):
 *
 * | Field                    | Type       | Constraints                                  |
 * |--------------------------|------------|----------------------------------------------|
 * | `id`                     | string     | `^[a-z0-9][a-z0-9._-]*$`                    |
 * | `apiVersion`             | literal 1  | must equal `PLUGIN_API_VERSION`              |
 * | `version`                | string     | semver (`\d+\.\d+\.\d+`)                    |
 * | `displayName`            | string     | 1–100 chars                                  |
 * | `description`            | string     | 1–500 chars                                  |
 * | `author`                 | string     | 1–200 chars                                  |
 * | `categories`             | enum[]     | at least one; values from PLUGIN_CATEGORIES  |
 * | `minimumHostVersion`     | string?    | semver lower bound if present, no leading `v`|
 * | `minimumPaperclipVersion`| string?    | legacy alias of `minimumHostVersion`         |
 * | `capabilities`           | enum[]     | at least one; values from PLUGIN_CAPABILITIES|
 * | `entrypoints.worker`     | string     | min 1 char                                   |
 * | `entrypoints.ui`         | string?    | required when `ui.slots` is declared         |
 *
 * Cross-field rules enforced via `superRefine`:
 * - `entrypoints.ui` required when `ui.slots` declared
 * - `agent.tools.register` capability required when `tools` declared
 * - `jobs.schedule` capability required when `jobs` declared
 * - `webhooks.receive` capability required when `webhooks` declared
 * - duplicate `jobs[].jobKey` values are rejected
 * - duplicate `webhooks[].endpointKey` values are rejected
 * - duplicate `tools[].name` values are rejected
 * - duplicate `ui.slots[].id` values are rejected
 *
 * @see PLUGIN_SPEC.md §10.1 — Manifest shape
 * @see {@link PaperclipPluginManifestV1} — the inferred TypeScript type
 */
export declare const pluginManifestV1Schema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    apiVersion: z.ZodLiteral<1>;
    version: z.ZodString;
    displayName: z.ZodString;
    description: z.ZodString;
    author: z.ZodString;
    categories: z.ZodArray<z.ZodEnum<["connector", "workspace", "automation", "ui"]>, "many">;
    minimumHostVersion: z.ZodOptional<z.ZodString>;
    minimumPaperclipVersion: z.ZodOptional<z.ZodString>;
    capabilities: z.ZodArray<z.ZodEnum<["companies.read", "projects.read", "project.workspaces.read", "issues.read", "issue.comments.read", "issue.documents.read", "agents.read", "goals.read", "goals.create", "goals.update", "activity.read", "costs.read", "issues.create", "issues.update", "issue.comments.create", "issue.documents.write", "agents.pause", "agents.resume", "agents.invoke", "agent.sessions.create", "agent.sessions.list", "agent.sessions.send", "agent.sessions.close", "activity.log.write", "metrics.write", "plugin.state.read", "plugin.state.write", "events.subscribe", "events.emit", "jobs.schedule", "webhooks.receive", "http.outbound", "secrets.read-ref", "agent.tools.register", "instance.settings.register", "ui.sidebar.register", "ui.page.register", "ui.detailTab.register", "ui.dashboardWidget.register", "ui.commentAnnotation.register", "ui.action.register"]>, "many">;
    entrypoints: z.ZodObject<{
        worker: z.ZodString;
        ui: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        worker: string;
        ui?: string | undefined;
    }, {
        worker: string;
        ui?: string | undefined;
    }>;
    instanceConfigSchema: z.ZodOptional<z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodUnknown>, Record<string, unknown>, Record<string, unknown>>>;
    jobs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        jobKey: z.ZodString;
        displayName: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        schedule: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    }, "strip", z.ZodTypeAny, {
        jobKey: string;
        displayName: string;
        schedule?: string | undefined;
        description?: string | undefined;
    }, {
        jobKey: string;
        displayName: string;
        schedule?: string | undefined;
        description?: string | undefined;
    }>, "many">>;
    webhooks: z.ZodOptional<z.ZodArray<z.ZodObject<{
        endpointKey: z.ZodString;
        displayName: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        displayName: string;
        endpointKey: string;
        description?: string | undefined;
    }, {
        displayName: string;
        endpointKey: string;
        description?: string | undefined;
    }>, "many">>;
    tools: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        displayName: z.ZodString;
        description: z.ZodString;
        parametersSchema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodUnknown>, Record<string, unknown>, Record<string, unknown>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        displayName: string;
        parametersSchema: Record<string, unknown>;
    }, {
        name: string;
        description: string;
        displayName: string;
        parametersSchema: Record<string, unknown>;
    }>, "many">>;
    launchers: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        placementZone: z.ZodEnum<["page", "detailTab", "taskDetailView", "dashboardWidget", "sidebar", "sidebarPanel", "projectSidebarItem", "globalToolbarButton", "toolbarButton", "contextMenuItem", "commentAnnotation", "commentContextMenuItem", "settingsPage"]>;
        exportName: z.ZodOptional<z.ZodString>;
        entityTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<["project", "issue", "agent", "goal", "run", "comment"]>, "many">>;
        order: z.ZodOptional<z.ZodNumber>;
        action: z.ZodEffects<z.ZodObject<{
            type: z.ZodEnum<["navigate", "openModal", "openDrawer", "openPopover", "performAction", "deepLink"]>;
            target: z.ZodString;
            params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        }, {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        }>, {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        }, {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        }>;
        render: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            environment: z.ZodEnum<["hostInline", "hostOverlay", "hostRoute", "external", "iframe"]>;
            bounds: z.ZodOptional<z.ZodEnum<["inline", "compact", "default", "wide", "full"]>>;
        }, "strip", z.ZodTypeAny, {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        }, {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        }>, {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        }, {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        action: {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        };
        displayName: string;
        placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
        description?: string | undefined;
        exportName?: string | undefined;
        entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
        order?: number | undefined;
        render?: {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        } | undefined;
    }, {
        id: string;
        action: {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        };
        displayName: string;
        placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
        description?: string | undefined;
        exportName?: string | undefined;
        entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
        order?: number | undefined;
        render?: {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        } | undefined;
    }>, {
        id: string;
        action: {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        };
        displayName: string;
        placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
        description?: string | undefined;
        exportName?: string | undefined;
        entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
        order?: number | undefined;
        render?: {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        } | undefined;
    }, {
        id: string;
        action: {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        };
        displayName: string;
        placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
        description?: string | undefined;
        exportName?: string | undefined;
        entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
        order?: number | undefined;
        render?: {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        } | undefined;
    }>, "many">>;
    ui: z.ZodOptional<z.ZodObject<{
        slots: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodObject<{
            type: z.ZodEnum<["page", "detailTab", "taskDetailView", "dashboardWidget", "sidebar", "sidebarPanel", "projectSidebarItem", "globalToolbarButton", "toolbarButton", "contextMenuItem", "commentAnnotation", "commentContextMenuItem", "settingsPage"]>;
            id: z.ZodString;
            displayName: z.ZodString;
            exportName: z.ZodString;
            entityTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<["project", "issue", "agent", "goal", "run", "comment"]>, "many">>;
            routePath: z.ZodOptional<z.ZodString>;
            order: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }, {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }>, {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }, {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }>, "many">>;
        launchers: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodObject<{
            id: z.ZodString;
            displayName: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            placementZone: z.ZodEnum<["page", "detailTab", "taskDetailView", "dashboardWidget", "sidebar", "sidebarPanel", "projectSidebarItem", "globalToolbarButton", "toolbarButton", "contextMenuItem", "commentAnnotation", "commentContextMenuItem", "settingsPage"]>;
            exportName: z.ZodOptional<z.ZodString>;
            entityTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<["project", "issue", "agent", "goal", "run", "comment"]>, "many">>;
            order: z.ZodOptional<z.ZodNumber>;
            action: z.ZodEffects<z.ZodObject<{
                type: z.ZodEnum<["navigate", "openModal", "openDrawer", "openPopover", "performAction", "deepLink"]>;
                target: z.ZodString;
                params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, "strip", z.ZodTypeAny, {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            }, {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            }>, {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            }, {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            }>;
            render: z.ZodOptional<z.ZodEffects<z.ZodObject<{
                environment: z.ZodEnum<["hostInline", "hostOverlay", "hostRoute", "external", "iframe"]>;
                bounds: z.ZodOptional<z.ZodEnum<["inline", "compact", "default", "wide", "full"]>>;
            }, "strip", z.ZodTypeAny, {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            }, {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            }>, {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            }, {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }, {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }>, {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }, {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        launchers?: {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }[] | undefined;
        slots?: {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    }, {
        launchers?: {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }[] | undefined;
        slots?: {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    version: string;
    id: string;
    description: string;
    capabilities: ("companies.read" | "projects.read" | "project.workspaces.read" | "issues.read" | "issue.comments.read" | "issue.documents.read" | "agents.read" | "goals.read" | "goals.create" | "goals.update" | "activity.read" | "costs.read" | "issues.create" | "issues.update" | "issue.comments.create" | "issue.documents.write" | "agents.pause" | "agents.resume" | "agents.invoke" | "agent.sessions.create" | "agent.sessions.list" | "agent.sessions.send" | "agent.sessions.close" | "activity.log.write" | "metrics.write" | "plugin.state.read" | "plugin.state.write" | "events.subscribe" | "events.emit" | "jobs.schedule" | "webhooks.receive" | "http.outbound" | "secrets.read-ref" | "agent.tools.register" | "instance.settings.register" | "ui.sidebar.register" | "ui.page.register" | "ui.detailTab.register" | "ui.dashboardWidget.register" | "ui.commentAnnotation.register" | "ui.action.register")[];
    displayName: string;
    apiVersion: 1;
    author: string;
    categories: ("automation" | "connector" | "workspace" | "ui")[];
    entrypoints: {
        worker: string;
        ui?: string | undefined;
    };
    ui?: {
        launchers?: {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }[] | undefined;
        slots?: {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    } | undefined;
    minimumHostVersion?: string | undefined;
    minimumPaperclipVersion?: string | undefined;
    instanceConfigSchema?: Record<string, unknown> | undefined;
    jobs?: {
        jobKey: string;
        displayName: string;
        schedule?: string | undefined;
        description?: string | undefined;
    }[] | undefined;
    webhooks?: {
        displayName: string;
        endpointKey: string;
        description?: string | undefined;
    }[] | undefined;
    tools?: {
        name: string;
        description: string;
        displayName: string;
        parametersSchema: Record<string, unknown>;
    }[] | undefined;
    launchers?: {
        id: string;
        action: {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        };
        displayName: string;
        placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
        description?: string | undefined;
        exportName?: string | undefined;
        entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
        order?: number | undefined;
        render?: {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        } | undefined;
    }[] | undefined;
}, {
    version: string;
    id: string;
    description: string;
    capabilities: ("companies.read" | "projects.read" | "project.workspaces.read" | "issues.read" | "issue.comments.read" | "issue.documents.read" | "agents.read" | "goals.read" | "goals.create" | "goals.update" | "activity.read" | "costs.read" | "issues.create" | "issues.update" | "issue.comments.create" | "issue.documents.write" | "agents.pause" | "agents.resume" | "agents.invoke" | "agent.sessions.create" | "agent.sessions.list" | "agent.sessions.send" | "agent.sessions.close" | "activity.log.write" | "metrics.write" | "plugin.state.read" | "plugin.state.write" | "events.subscribe" | "events.emit" | "jobs.schedule" | "webhooks.receive" | "http.outbound" | "secrets.read-ref" | "agent.tools.register" | "instance.settings.register" | "ui.sidebar.register" | "ui.page.register" | "ui.detailTab.register" | "ui.dashboardWidget.register" | "ui.commentAnnotation.register" | "ui.action.register")[];
    displayName: string;
    apiVersion: 1;
    author: string;
    categories: ("automation" | "connector" | "workspace" | "ui")[];
    entrypoints: {
        worker: string;
        ui?: string | undefined;
    };
    ui?: {
        launchers?: {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }[] | undefined;
        slots?: {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    } | undefined;
    minimumHostVersion?: string | undefined;
    minimumPaperclipVersion?: string | undefined;
    instanceConfigSchema?: Record<string, unknown> | undefined;
    jobs?: {
        jobKey: string;
        displayName: string;
        schedule?: string | undefined;
        description?: string | undefined;
    }[] | undefined;
    webhooks?: {
        displayName: string;
        endpointKey: string;
        description?: string | undefined;
    }[] | undefined;
    tools?: {
        name: string;
        description: string;
        displayName: string;
        parametersSchema: Record<string, unknown>;
    }[] | undefined;
    launchers?: {
        id: string;
        action: {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        };
        displayName: string;
        placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
        description?: string | undefined;
        exportName?: string | undefined;
        entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
        order?: number | undefined;
        render?: {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        } | undefined;
    }[] | undefined;
}>, {
    version: string;
    id: string;
    description: string;
    capabilities: ("companies.read" | "projects.read" | "project.workspaces.read" | "issues.read" | "issue.comments.read" | "issue.documents.read" | "agents.read" | "goals.read" | "goals.create" | "goals.update" | "activity.read" | "costs.read" | "issues.create" | "issues.update" | "issue.comments.create" | "issue.documents.write" | "agents.pause" | "agents.resume" | "agents.invoke" | "agent.sessions.create" | "agent.sessions.list" | "agent.sessions.send" | "agent.sessions.close" | "activity.log.write" | "metrics.write" | "plugin.state.read" | "plugin.state.write" | "events.subscribe" | "events.emit" | "jobs.schedule" | "webhooks.receive" | "http.outbound" | "secrets.read-ref" | "agent.tools.register" | "instance.settings.register" | "ui.sidebar.register" | "ui.page.register" | "ui.detailTab.register" | "ui.dashboardWidget.register" | "ui.commentAnnotation.register" | "ui.action.register")[];
    displayName: string;
    apiVersion: 1;
    author: string;
    categories: ("automation" | "connector" | "workspace" | "ui")[];
    entrypoints: {
        worker: string;
        ui?: string | undefined;
    };
    ui?: {
        launchers?: {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }[] | undefined;
        slots?: {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    } | undefined;
    minimumHostVersion?: string | undefined;
    minimumPaperclipVersion?: string | undefined;
    instanceConfigSchema?: Record<string, unknown> | undefined;
    jobs?: {
        jobKey: string;
        displayName: string;
        schedule?: string | undefined;
        description?: string | undefined;
    }[] | undefined;
    webhooks?: {
        displayName: string;
        endpointKey: string;
        description?: string | undefined;
    }[] | undefined;
    tools?: {
        name: string;
        description: string;
        displayName: string;
        parametersSchema: Record<string, unknown>;
    }[] | undefined;
    launchers?: {
        id: string;
        action: {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        };
        displayName: string;
        placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
        description?: string | undefined;
        exportName?: string | undefined;
        entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
        order?: number | undefined;
        render?: {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        } | undefined;
    }[] | undefined;
}, {
    version: string;
    id: string;
    description: string;
    capabilities: ("companies.read" | "projects.read" | "project.workspaces.read" | "issues.read" | "issue.comments.read" | "issue.documents.read" | "agents.read" | "goals.read" | "goals.create" | "goals.update" | "activity.read" | "costs.read" | "issues.create" | "issues.update" | "issue.comments.create" | "issue.documents.write" | "agents.pause" | "agents.resume" | "agents.invoke" | "agent.sessions.create" | "agent.sessions.list" | "agent.sessions.send" | "agent.sessions.close" | "activity.log.write" | "metrics.write" | "plugin.state.read" | "plugin.state.write" | "events.subscribe" | "events.emit" | "jobs.schedule" | "webhooks.receive" | "http.outbound" | "secrets.read-ref" | "agent.tools.register" | "instance.settings.register" | "ui.sidebar.register" | "ui.page.register" | "ui.detailTab.register" | "ui.dashboardWidget.register" | "ui.commentAnnotation.register" | "ui.action.register")[];
    displayName: string;
    apiVersion: 1;
    author: string;
    categories: ("automation" | "connector" | "workspace" | "ui")[];
    entrypoints: {
        worker: string;
        ui?: string | undefined;
    };
    ui?: {
        launchers?: {
            id: string;
            action: {
                target: string;
                type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
                params?: Record<string, unknown> | undefined;
            };
            displayName: string;
            placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            description?: string | undefined;
            exportName?: string | undefined;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            order?: number | undefined;
            render?: {
                environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
                bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
            } | undefined;
        }[] | undefined;
        slots?: {
            type: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
            id: string;
            displayName: string;
            exportName: string;
            entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
            routePath?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    } | undefined;
    minimumHostVersion?: string | undefined;
    minimumPaperclipVersion?: string | undefined;
    instanceConfigSchema?: Record<string, unknown> | undefined;
    jobs?: {
        jobKey: string;
        displayName: string;
        schedule?: string | undefined;
        description?: string | undefined;
    }[] | undefined;
    webhooks?: {
        displayName: string;
        endpointKey: string;
        description?: string | undefined;
    }[] | undefined;
    tools?: {
        name: string;
        description: string;
        displayName: string;
        parametersSchema: Record<string, unknown>;
    }[] | undefined;
    launchers?: {
        id: string;
        action: {
            target: string;
            type: "navigate" | "openModal" | "openDrawer" | "openPopover" | "performAction" | "deepLink";
            params?: Record<string, unknown> | undefined;
        };
        displayName: string;
        placementZone: "page" | "detailTab" | "taskDetailView" | "dashboardWidget" | "sidebar" | "sidebarPanel" | "projectSidebarItem" | "globalToolbarButton" | "toolbarButton" | "contextMenuItem" | "commentAnnotation" | "commentContextMenuItem" | "settingsPage";
        description?: string | undefined;
        exportName?: string | undefined;
        entityTypes?: ("agent" | "project" | "issue" | "goal" | "run" | "comment")[] | undefined;
        order?: number | undefined;
        render?: {
            environment: "hostInline" | "hostOverlay" | "hostRoute" | "external" | "iframe";
            bounds?: "inline" | "compact" | "default" | "wide" | "full" | undefined;
        } | undefined;
    }[] | undefined;
}>;
export type PluginManifestV1Input = z.infer<typeof pluginManifestV1Schema>;
/**
 * Schema for installing (registering) a plugin.
 * The server receives the packageName and resolves the manifest from the
 * installed package.
 */
export declare const installPluginSchema: z.ZodObject<{
    packageName: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    /** Set by loader for local-path installs so the worker can be resolved. */
    packagePath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    packageName: string;
    version?: string | undefined;
    packagePath?: string | undefined;
}, {
    packageName: string;
    version?: string | undefined;
    packagePath?: string | undefined;
}>;
export type InstallPlugin = z.infer<typeof installPluginSchema>;
/**
 * Schema for creating or updating a plugin's instance configuration.
 * configJson is validated permissively here; runtime validation against
 * the plugin's instanceConfigSchema is done at the service layer.
 */
export declare const upsertPluginConfigSchema: z.ZodObject<{
    configJson: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    configJson: Record<string, unknown>;
}, {
    configJson: Record<string, unknown>;
}>;
export type UpsertPluginConfig = z.infer<typeof upsertPluginConfigSchema>;
/**
 * Schema for partially updating a plugin's instance configuration.
 * Allows a partial merge of config values.
 */
export declare const patchPluginConfigSchema: z.ZodObject<{
    configJson: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    configJson: Record<string, unknown>;
}, {
    configJson: Record<string, unknown>;
}>;
export type PatchPluginConfig = z.infer<typeof patchPluginConfigSchema>;
/**
 * Schema for updating a plugin's lifecycle status. Used by the lifecycle
 * manager to persist state transitions.
 *
 * @see {@link PLUGIN_STATUSES} for the valid status values
 */
export declare const updatePluginStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["installed", "ready", "disabled", "error", "upgrade_pending", "uninstalled"]>;
    lastError: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
    lastError?: string | null | undefined;
}, {
    status: "error" | "installed" | "ready" | "disabled" | "upgrade_pending" | "uninstalled";
    lastError?: string | null | undefined;
}>;
export type UpdatePluginStatus = z.infer<typeof updatePluginStatusSchema>;
/** Schema for the uninstall request. `removeData` controls hard vs soft delete. */
export declare const uninstallPluginSchema: z.ZodObject<{
    removeData: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    removeData: boolean;
}, {
    removeData?: boolean | undefined;
}>;
export type UninstallPlugin = z.infer<typeof uninstallPluginSchema>;
/**
 * Schema for a plugin state scope key — identifies the exact location where
 * state is stored. Used by the `ctx.state.get()`, `ctx.state.set()`, and
 * `ctx.state.delete()` SDK methods.
 *
 * @see PLUGIN_SPEC.md §21.3 `plugin_state`
 */
export declare const pluginStateScopeKeySchema: z.ZodObject<{
    scopeKind: z.ZodEnum<["instance", "company", "project", "project_workspace", "agent", "issue", "goal", "run"]>;
    scopeId: z.ZodOptional<z.ZodString>;
    namespace: z.ZodOptional<z.ZodString>;
    stateKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    scopeKind: "agent" | "company" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
    stateKey: string;
    scopeId?: string | undefined;
    namespace?: string | undefined;
}, {
    scopeKind: "agent" | "company" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
    stateKey: string;
    scopeId?: string | undefined;
    namespace?: string | undefined;
}>;
export type PluginStateScopeKey = z.infer<typeof pluginStateScopeKeySchema>;
/**
 * Schema for setting a plugin state value.
 */
export declare const setPluginStateSchema: z.ZodObject<{
    scopeKind: z.ZodEnum<["instance", "company", "project", "project_workspace", "agent", "issue", "goal", "run"]>;
    scopeId: z.ZodOptional<z.ZodString>;
    namespace: z.ZodOptional<z.ZodString>;
    stateKey: z.ZodString;
    /** JSON-serializable value to store. */
    value: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    scopeKind: "agent" | "company" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
    stateKey: string;
    value?: unknown;
    scopeId?: string | undefined;
    namespace?: string | undefined;
}, {
    scopeKind: "agent" | "company" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace";
    stateKey: string;
    value?: unknown;
    scopeId?: string | undefined;
    namespace?: string | undefined;
}>;
export type SetPluginState = z.infer<typeof setPluginStateSchema>;
/**
 * Schema for querying plugin state entries. All fields are optional to allow
 * flexible list queries (e.g. all state for a plugin within a scope).
 */
export declare const listPluginStateSchema: z.ZodObject<{
    scopeKind: z.ZodOptional<z.ZodEnum<["instance", "company", "project", "project_workspace", "agent", "issue", "goal", "run"]>>;
    scopeId: z.ZodOptional<z.ZodString>;
    namespace: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    scopeId?: string | undefined;
    namespace?: string | undefined;
    scopeKind?: "agent" | "company" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace" | undefined;
}, {
    scopeId?: string | undefined;
    namespace?: string | undefined;
    scopeKind?: "agent" | "company" | "project" | "issue" | "goal" | "run" | "instance" | "project_workspace" | undefined;
}>;
export type ListPluginState = z.infer<typeof listPluginStateSchema>;
//# sourceMappingURL=plugin.d.ts.map