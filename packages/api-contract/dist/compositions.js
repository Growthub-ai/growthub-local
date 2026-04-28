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
// ---------------------------------------------------------------------------
// Pure identity helpers — typed passthroughs (Twenty parity)
// ---------------------------------------------------------------------------
/**
 * Typed identity helper. Returns the spec verbatim; constrains the
 * call site to `PortalCapability` shape at compile time. Pure;
 * deterministic; safe inside fork-sync diffs.
 */
export function definePortalCapability(spec) {
    return spec;
}
/**
 * Typed identity helper for `PortalObjectDefinition`. Pure passthrough.
 */
export function definePortalObject(spec) {
    return spec;
}
/**
 * Typed identity helper for `PortalIntegration`. Pure passthrough.
 */
export function defineIntegration(spec) {
    return spec;
}
/**
 * Typed identity helper for `WidgetDefinition`. Pure passthrough; the
 * widget contract lives in `./widgets` but the helper sits here so
 * `growthub.config.ts` files can import every `define*` helper from a
 * single subpath.
 */
export function defineWidget(spec) {
    return spec;
}
/**
 * Typed identity helper for `CanvasDefinition`. Pure passthrough.
 */
export function defineCanvas(spec) {
    return spec;
}
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
export function defineComposition(spec) {
    return spec;
}
// ---------------------------------------------------------------------------
// Lane grouping — pure runtime helper (matches production behavior)
// ---------------------------------------------------------------------------
/**
 * Partitions integrations by lane. Behavior is identical to the
 * production helper the agency-portal kit ships
 * (`apps/agency-portal/lib/domain/integrations.js:176-183`); promoting
 * it here lets every kit reuse it without copy-paste.
 *
 * Pure; no side effects.
 */
export function groupIntegrationsByLane(integrations) {
    return {
        dataSources: integrations.filter((item) => item.lane === "data-source"),
        workspaceIntegrations: integrations.filter((item) => item.lane === "workspace-integration"),
    };
}
// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------
/**
 * Surfaces may read this to confirm the v1 compositions contract is
 * in scope. Additive changes keep this literal `1`.
 */
export const COMPOSITIONS_CONTRACT_VERSION = 1;
//# sourceMappingURL=compositions.js.map