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
// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------
/**
 * Surfaces may read this to confirm the v1 widget contract is in
 * scope. Additive changes keep this literal `1`.
 */
export const WIDGETS_CONTRACT_VERSION = 1;
//# sourceMappingURL=widgets.js.map