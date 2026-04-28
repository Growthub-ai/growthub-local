/**
 * @growthub/api-contract — Widgets (CMS SDK v1)
 *
 * Public, type-only surface for the **Widget Grid** primitive — the
 * visual composability layer that turns governed-workspace data
 * primitives (capabilities, integrations, pipelines, artifacts, chat
 * sessions) into a code-first, declarative dashboard surface.
 *
 * Mental model parity with Twenty CRM
 * -----------------------------------
 *
 *   Twenty CRM hierarchy        →  Growthub equivalent
 *   ────────────────────────       ──────────────────────────────────────
 *   defineObject                →  PortalObjectDefinition (./compositions)
 *   defineField                 →  PortalFieldRef         (./compositions)
 *   defineView                  →  PortalView             (./compositions)
 *   Dashboard → Tabs → Widgets  →  CanvasDefinition + WidgetDefinition
 *   Drag/resize grid            →  GridLayout + WidgetDefinition.position
 *   Aggregations / filters      →  WidgetDefinition.bindings.* (open shape)
 *
 * The same code → manifest → instant runtime loop applies: a kit
 * exports `defineComposition({ ... canvas: { widgets: [ ... ] } })`
 * from a `growthub.config.ts` file, the CLI reads it, and the
 * governed workspace renders the grid identically across local
 * preview, Vercel app, and (future) hosted GH-app surfaces.
 *
 * Why this lives in the SDK
 * -------------------------
 *
 * Worker kits cannot share runtime code (each export is a static
 * directory). They CAN share types and tiny pure helpers via this
 * package. Promoting widget primitives here makes every kit
 * — Agency Portal, Custom Workspace Starter, Creative Video Pipeline,
 * future kits — speak the same canvas vocabulary without copy-paste
 * drift.
 *
 * Rules
 * -----
 *
 *   - Additive only. Every field beyond `id` / `kind` / `position`
 *     is optional.
 *   - No runtime behavior. Identity helpers ship in `./compositions`
 *     and are pure passthroughs.
 *   - Open-ended unions on `WidgetKind` and chart types so kits can
 *     introduce new widget shapes without an SDK release.
 *   - `WidgetDefinition.bindings` is `Record<string, unknown>` — kits
 *     own their binding vocabulary; the SDK does not branch on it.
 *   - IDs are required on user input. The SDK does NOT generate IDs;
 *     non-determinism would break manifest diffing and fork-sync drift
 *     detection (`cli/src/kits/fork-sync.ts::detectKitForkDrift`).
 */
/**
 * What a widget renders. The first five mirror Twenty CRM's current
 * widget set (chart / number / iframe / TABLE_WIDGET / fields-widget).
 * The next four are the agent-native extension that gives governed
 * workspaces their leapfrog over CRM-bound dashboards. The trailing
 * `(string & {})` keeps the union open for future kit-defined kinds
 * without an SDK release.
 *
 *   - `chart-metric`     — chart or single-value KPI bound to a
 *                          capability / object (Twenty: chart + number)
 *   - `integration-card` — live integration status row (data-source
 *                          or workspace-integration lane)
 *   - `table`            — record-table view of an object
 *                          (Twenty: TABLE_WIDGET)
 *   - `fields`           — field-value display for a single record
 *                          (Twenty: fields widget)
 *   - `iframe`           — external content embed (Twenty: iframe)
 *   - `chat-session`     — embedded streaming console / agent chat
 *                          (Growthub-native, no Twenty analogue)
 *   - `workflow-runner`  — pipeline runner with live ExecutionEvent
 *                          stream (Growthub-native)
 *   - `artifact-viewer`  — media + ExecutionArtifactRef preview
 *                          (Growthub-native)
 *   - `custom-component` — kit-supplied React component slot
 */
export type WidgetKind = "chart-metric" | "integration-card" | "table" | "fields" | "iframe" | "chat-session" | "workflow-runner" | "artifact-viewer" | "custom-component" | (string & {});
/**
 * Chart sub-kind, when `WidgetKind` is `"chart-metric"`. Open-ended so
 * kits can declare richer chart families without an SDK release.
 */
export type WidgetChartKind = "number" | "bar" | "line" | "pie" | "area" | "gauge" | (string & {});
/**
 * Aggregation function applied to the bound field. Mirrors Twenty's
 * aggregation set; open-ended for future kit-specific aggregates.
 */
export type WidgetAggregate = "count" | "sum" | "avg" | "min" | "max" | "first" | "last" | (string & {});
/**
 * Per-widget grid position. Coordinate space is `react-grid-layout`-
 * compatible so the same manifest renders inside any compatible
 * grid renderer (RGL, custom CSS grid, hosted editor) without
 * re-encoding.
 *
 *   - `x`, `y`  — column / row origin (zero-indexed)
 *   - `w`, `h`  — column / row span (1+)
 *   - `static` — when true, the widget cannot be dragged / resized
 *                in-place (used for governance-locked widgets)
 *   - `minW` / `minH` / `maxW` / `maxH` — optional bounds; renderer
 *                hints, not enforced by the contract
 */
export interface WidgetGridPosition {
    x: number;
    y: number;
    w: number;
    h: number;
    static?: boolean;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
}
/**
 * Canvas-level grid configuration. A canvas is a single dashboard
 * tab; `GridLayout` describes the geometry that hosts its widgets.
 *
 *   - `columns`    — column count (default kits use 4 or 12)
 *   - `rowHeight`  — pixel height of one row unit; renderer hint
 *   - `gap`        — pixel gap between widgets
 *   - `responsive` — when true, the grid reflows at narrower
 *                    breakpoints (renderer hint)
 *   - `breakpoints` — optional named breakpoints, `name` → min width
 *                     in px; opaque to the contract
 */
export interface GridLayout {
    columns: number;
    rowHeight?: number;
    gap?: number;
    responsive?: boolean;
    breakpoints?: Readonly<Record<string, number>>;
}
/**
 * A single widget on a canvas. Bindings carry kit-specific semantics
 * (data-source slug, capability id, integration provider, custom
 * component path, …); the contract does not branch on them so future
 * kits can introduce new widget kinds purely additively.
 */
export interface WidgetDefinition {
    /**
     * Stable id, unique within the parent canvas. Required so the
     * manifest is diffable across fork-sync runs and hosted-bridge
     * snapshots. The SDK does not generate ids.
     */
    id: string;
    /** What to render (open-ended union). */
    kind: WidgetKind;
    /** Human-readable title; renderer falls back to `id` when omitted. */
    title?: string;
    /**
     * Reference slug — capability id, integration provider, pipeline
     * id, artifact ref, custom component path — interpreted per
     * `kind`. Open contract; the SDK does not enforce shape.
     */
    slug?: string;
    /** Geometry inside the parent `GridLayout`. */
    position: WidgetGridPosition;
    /**
     * Chart sub-kind when `kind === "chart-metric"`. Renderer hint
     * for non-chart kinds; otherwise ignored.
     */
    chart?: WidgetChartKind;
    /**
     * Aggregate function for chart / metric widgets. Renderer hint;
     * unused for narrative widgets (`chat-session`, `iframe`, etc.).
     */
    aggregate?: WidgetAggregate;
    /**
     * Open binding map. Kits decide their own binding vocabulary
     * (e.g. `{ adapter: "growthub-bridge", objectType: "client",
     * groupBy: "stage", filters: [...] }`). The SDK preserves the
     * shape verbatim across the manifest boundary.
     */
    bindings?: Record<string, unknown>;
    /**
     * When true, the widget surfaces media inline (artifact thumbnails,
     * inline preview). Renderer hint.
     */
    mediaPreview?: boolean;
    /**
     * Path to a kit-supplied React component when `kind ===
     * "custom-component"`. Resolved by the host app's bundler; the SDK
     * treats it as an opaque string.
     */
    customComponentPath?: string;
    /**
     * Entitlements required to render the widget. Reuses the existing
     * `Entitlement` vocabulary from `./profile`; renderer hides the
     * widget when the active session lacks the entitlement.
     */
    requiredEntitlements?: string[];
}
/**
 * Scope the canvas is shared at. Mirrors Twenty's "workspace dashboard"
 * vs. "personal favorite" distinction; open-ended for future kit-defined
 * scopes.
 */
export type CanvasScope = "workspace" | "user-favorite" | (string & {});
/**
 * A canvas is one dashboard tab — the unit a user toggles between
 * inside a composition. Widgets live inside; layout governs geometry.
 */
export interface CanvasDefinition {
    /** Stable id, unique within the parent composition. */
    id: string;
    /** Display name. Renderer falls back to `id` when omitted. */
    name?: string;
    /** Workspace-shared by default; falls back to `"workspace"` if omitted. */
    scope?: CanvasScope;
    /** Grid geometry hosting the canvas's widgets. */
    layout: GridLayout;
    /** Widget definitions; render order follows array order. */
    widgets: WidgetDefinition[];
    /**
     * Cross-primitive bridges the canvas opts into. All optional so
     * kits can adopt them incrementally:
     *
     *   - `chatToCanvas`              — chat sessions emit canvas
     *                                   selection events
     *   - `workflowOutputsToArtifacts`— workflow-runner widgets pipe
     *                                   completed runs into artifact-
     *                                   viewer widgets
     *   - `sessionContext`            — widgets share the active
     *                                   session context bus
     *   - `portalCapabilities`        — widgets bind to the kit's
     *                                   `PortalCapability` catalog
     *                                   (./compositions)
     */
    bindings?: {
        chatToCanvas?: boolean;
        workflowOutputsToArtifacts?: boolean;
        sessionContext?: boolean;
        portalCapabilities?: boolean;
    };
}
/**
 * Surfaces may read this to confirm the v1 widget contract is in
 * scope. Additive changes keep this literal `1`.
 */
export declare const WIDGETS_CONTRACT_VERSION: 1;
//# sourceMappingURL=widgets.d.ts.map