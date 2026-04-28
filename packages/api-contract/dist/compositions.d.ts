/**
 * @growthub/api-contract — Compositions (CMS SDK v1)
 *
 * Public, type-only surface for the **Composition** primitive — the
 * top-level manifest a governed-workspace kit ships from a
 * `growthub.config.ts` file. A composition stitches together the
 * declarative primitives every governed workspace already exposes
 * (capabilities, integrations, pipelines) and an optional widget
 * grid (`./widgets`) into one diffable manifest.
 *
 * Mental model parity with Twenty CRM
 * -----------------------------------
 *
 *   Twenty CRM SDK              →  Growthub equivalent (this module)
 *   ────────────────────────       ──────────────────────────────────────
 *   defineApplication           →  defineComposition
 *   defineObject                →  PortalObjectDefinition
 *   defineField                 →  PortalFieldRef
 *   defineView                  →  PortalView (+ `views[]` slot)
 *   widget grid editor          →  CanvasDefinition (./widgets)
 *
 * The contract is intentionally a strict superset of the literal
 * shapes the agency-portal kit already ships in production
 * (`apps/agency-portal/lib/domain/portal.js` after commit `55561ef`).
 * Existing kits keep working with no code change; the SDK only adds
 * a public name for shapes the kit already produces.
 *
 * Rules
 * -----
 *
 *   - Additive only. Every field beyond `id` (and `kind` / `position`
 *     for widgets) is optional.
 *   - No runtime behavior except four pure identity helpers
 *     (`definePortalCapability`, `definePortalObject`,
 *     `defineIntegration`, `defineComposition`) and one zero-cost
 *     filter (`groupIntegrationsByLane`). Same precedent as
 *     `isExecutionEvent` / `isPipelineTraceEvent`.
 *   - Identity helpers DO NOT generate ids. Non-determinism would
 *     break manifest diffing and fork-sync drift detection
 *     (`cli/src/kits/fork-sync.ts::detectKitForkDrift`).
 *   - Open-ended unions on lane / category / field-type so kits
 *     introduce new vocabulary without an SDK release.
 */
import type { CanvasDefinition, WidgetDefinition } from "./widgets.js";
import type { AdapterKind, AdapterMode } from "./adapters.js";
/**
 * Field types a `PortalObjectDefinition` may declare. Mirrors the
 * literal set the agency-portal kit ships
 * (`apps/agency-portal/lib/domain/portal.js:1-22`); open-ended so kits
 * can declare richer types without an SDK release.
 */
export type PortalFieldType = "text" | "long_text" | "number" | "currency" | "percentage" | "date" | "datetime" | "select" | "multi_select" | "boolean" | "relation" | "multi_relation" | "formula" | "rollup" | "url" | "email" | "phone" | "json" | "file" | "rating" | "user" | (string & {});
/**
 * Per-field reference inside a `PortalObjectDefinition`.
 *
 *   - `name` — field key (camelCase); stable across manifests
 *   - `type` — one of `PortalFieldType`
 *   - `label` — display label; renderer falls back to `name`
 */
export interface PortalFieldRef {
    name: string;
    type: PortalFieldType;
    label?: string;
}
/**
 * View kinds a `PortalObjectDefinition` declares it supports. Mirrors
 * the literal set in `portal.js:51-58`. Open-ended for future views.
 */
export type PortalView = "table" | "kanban" | "record" | "dashboard" | "calendar" | "gallery" | (string & {});
/**
 * One declared object in the composition. Same shape the agency-portal
 * kit already emits in `objectDefinitions` (`portal.js:23-50`).
 *
 *   - `id`       — object key, unique within the composition
 *   - `label`    — display label
 *   - `fields`   — typed field refs
 *   - `views`    — view kinds the object supports
 *   - `contract` — informational, free-form contract reference
 *                  (e.g. `"twenty-sdk/define"`)
 */
export interface PortalObjectDefinition {
    id: string;
    label?: string;
    fields: PortalFieldRef[];
    views?: PortalView[];
    contract?: string;
}
/**
 * One capability tab in the composition. Strict superset of the shape
 * `portalCapabilities` already exports in production
 * (`portal.js:48-50` produces `{ id, label, objectType, bindings }`).
 *
 *   - `id`         — tab id, stable across manifests
 *   - `label`      — display label
 *   - `objectType` — primary object the tab is bound to
 *   - `objects`    — secondary objects displayed alongside (optional)
 *   - `widgets`    — widget ids the tab renders (optional, free form)
 *   - `bindings`   — adapter-kind ids the tab depends on (optional)
 *   - `description` / `metric` — optional renderer hints used by
 *                                the kit's studio preview
 */
export interface PortalCapability {
    id: string;
    label?: string;
    objectType?: string;
    objects?: string[];
    widgets?: string[];
    bindings?: string[];
    description?: string;
    metric?: string;
}
/**
 * Lane a portal integration belongs to. Mirrors the production
 * `groupIntegrationsByLane` partition; open-ended so kits can declare
 * new lanes without an SDK release.
 *
 *   - `data-source`         — pipelines that bring marketing /
 *                             commerce / analytics data into the
 *                             workspace
 *   - `workspace-integration` — operational integrations (CRM,
 *                             messaging, email, scheduling)
 */
export type IntegrationLane = "data-source" | "workspace-integration" | (string & {});
/**
 * Setup mode an integration uses. Mirrors the literal values the
 * production kit emits (`hosted-authority` | `bring-your-own-key` |
 * `local-catalog`). Open-ended.
 */
export type IntegrationSetupMode = "hosted-authority" | "bring-your-own-key" | "local-catalog" | (string & {});
/**
 * Auth path an integration resolves through. Open-ended.
 */
export type IntegrationAuthPath = "growthub-mcp-bridge" | "byo-api-key" | "local-catalog" | (string & {});
/**
 * Status the integration reports. Open-ended.
 */
export type IntegrationStatus = "connected" | "needs-connection" | "error" | "disabled" | (string & {});
/**
 * One row in the kit's integration catalog. Strict superset of every
 * row the agency-portal kit emits in `agencyPortalIntegrationCatalog`
 * (`apps/agency-portal/lib/domain/integrations.js`).
 *
 * The shape stays generic across kits: every other kit that ships
 * an integration catalog can adopt this type without a code change.
 */
export interface PortalIntegration {
    /** Stable row id (e.g. `"windsor-ai"`); unique within the catalog. */
    id: string;
    /** Provider key (often equal to `id`). */
    provider?: string;
    /** Display label. */
    label?: string;
    /** Long-form display name. */
    name?: string;
    /** Single-character icon glyph the kit's UI renders. */
    icon?: string;
    /** Free-form description. */
    description?: string;
    /** Free-form category label (e.g. `"mcp_connector"`). */
    category?: string;
    /** Free-form auth-type label (e.g. `"oauth_first_party"`). */
    authType?: string;
    /** True when the integration is wired up. */
    isConnected?: boolean;
    /** True when the integration is currently active for the workspace. */
    isActive?: boolean;
    /** Lane partition (data-source vs workspace-integration). */
    lane: IntegrationLane;
    /** Object type the integration emits or consumes. */
    objectType?: string;
    /** Status the integration reports. */
    status?: IntegrationStatus;
    /** Auth path id. */
    authPath?: IntegrationAuthPath;
    /** Setup mode id. */
    setupMode?: IntegrationSetupMode;
    /** Hosted-bridge connection id, when available. */
    connectionId?: string;
    /** Hosted-bridge account id, when available. */
    accountId?: string;
    /** Env-var name carrying the secret, when applicable. */
    secretEnvName?: string;
    /** Bridge / catalog-supplied connection metadata, opaque. */
    connectionMetadata?: Record<string, unknown>;
    /** Generic metadata bag, opaque. */
    metadata?: Record<string, unknown>;
}
/**
 * The lane-grouped shape `groupIntegrationsByLane` returns. Same
 * partition the production kit uses
 * (`integrations.js:176-183`).
 */
export interface GroupedIntegrations<T extends PortalIntegration = PortalIntegration> {
    dataSources: T[];
    workspaceIntegrations: T[];
}
/**
 * Top-level composition manifest. Stitches the declarative
 * primitives every governed workspace already exposes (capabilities,
 * integrations, pipelines) and an optional widget grid into one
 * diffable shape.
 *
 *   - `id`           — composition id, stable across manifests
 *   - `name`         — display name
 *   - `description`  — free-form description
 *   - `capabilities` — capability slugs (tab ids) the composition
 *                      activates. Strings, not embedded objects, so
 *                      the manifest stays small and the kit owns the
 *                      catalog.
 *   - `pipelines`    — pipeline ids the composition activates
 *   - `integrations` — integration row ids the composition surfaces
 *   - `objects`      — object definitions the composition ships
 *                      (when the kit prefers to inline them rather
 *                      than reference a separate catalog)
 *   - `canvas`       — optional default widget grid (CanvasDefinition)
 *   - `provenance`   — origin metadata, opaque
 */
export interface Composition {
    id: string;
    name?: string;
    description?: string;
    capabilities?: string[];
    pipelines?: string[];
    integrations?: string[];
    objects?: PortalObjectDefinition[];
    canvas?: CanvasDefinition;
    provenance?: {
        localPath?: string;
        createdBy?: "user" | "agent" | "cli" | (string & {});
        createdAt?: string;
        note?: string;
    };
}
/**
 * One adapter selector inside a kit's runtime config. Mirrors the
 * shape `apps/agency-portal/lib/adapters/env.js::readAdapterConfig`
 * already produces. The `kind` reuses the existing `AdapterKind`
 * union from `./adapters` so every kit speaks one adapter
 * vocabulary.
 */
export interface AdapterSelector {
    kind: AdapterKind;
    /** Selected mode (one of the kit's named provider paths). */
    mode: AdapterMode | (string & {});
    /** Env var that drives the selection, when applicable. */
    envVar?: string;
    /** Required env vars the chosen mode depends on. */
    requiredEnv?: string[];
}
/**
 * Typed identity helper. Returns the spec verbatim; constrains the
 * call site to `PortalCapability` shape at compile time. Pure;
 * deterministic; safe inside fork-sync diffs.
 */
export declare function definePortalCapability<T extends PortalCapability>(spec: T): T;
/**
 * Typed identity helper for `PortalObjectDefinition`. Pure passthrough.
 */
export declare function definePortalObject<T extends PortalObjectDefinition>(spec: T): T;
/**
 * Typed identity helper for `PortalIntegration`. Pure passthrough.
 */
export declare function defineIntegration<T extends PortalIntegration>(spec: T): T;
/**
 * Typed identity helper for `WidgetDefinition`. Pure passthrough; the
 * widget contract lives in `./widgets` but the helper sits here so
 * `growthub.config.ts` files can import every `define*` helper from a
 * single subpath.
 */
export declare function defineWidget<T extends WidgetDefinition>(spec: T): T;
/**
 * Typed identity helper for `CanvasDefinition`. Pure passthrough.
 */
export declare function defineCanvas<T extends CanvasDefinition>(spec: T): T;
/**
 * Typed identity helper for `Composition`. Pure passthrough; the
 * shape kits ship from `growthub.config.ts`.
 *
 * @example
 * ```ts
 * import { defineComposition, defineCanvas, defineWidget } from
 *   "@growthub/api-contract/compositions";
 *
 * export default defineComposition({
 *   id: "agency-portal-default",
 *   name: "Agency Portal Dashboard",
 *   capabilities: ["dashboard", "clients", "pipeline"],
 *   canvas: defineCanvas({
 *     id: "default",
 *     layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
 *     widgets: [
 *       defineWidget({ id: "mrr", kind: "chart-metric",
 *         position: { x: 0, y: 0, w: 3, h: 2 } }),
 *     ],
 *   }),
 * });
 * ```
 */
export declare function defineComposition<T extends Composition>(spec: T): T;
/**
 * Partitions integrations by lane. Behavior is identical to the
 * production helper the agency-portal kit ships
 * (`apps/agency-portal/lib/domain/integrations.js:176-183`); promoting
 * it here lets every kit reuse it without copy-paste.
 *
 * Pure; no side effects.
 */
export declare function groupIntegrationsByLane<T extends PortalIntegration>(integrations: ReadonlyArray<T>): GroupedIntegrations<T>;
/**
 * Surfaces may read this to confirm the v1 compositions contract is
 * in scope. Additive changes keep this literal `1`.
 */
export declare const COMPOSITIONS_CONTRACT_VERSION: 1;
//# sourceMappingURL=compositions.d.ts.map