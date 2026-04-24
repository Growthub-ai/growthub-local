/**
 * @growthub/api-contract — Widgets (CMS SDK v1, composability primitives)
 *
 * A widget is a render-time surface placed on a canvas/dashboard and
 * backed by capability/pipeline/artifact data. Widgets are the "LEGO
 * bricks" of a Growthub composition.
 *
 * Rules:
 *   - Additive, type-only. No runtime behavior is implied.
 *   - A widget never owns execution truth. It references an existing
 *     capability slug, pipeline id, artifact id, or chat thread id.
 *   - Layout is grid-based. Free-form positioning is intentionally
 *     not part of v1.
 */
import type { CapabilityExecutionHints } from "./manifests.js";
/**
 * Canonical widget kinds.
 *
 *   - `chart`            — renders a metric or data series.
 *   - `chat-session`     — embeds a chat thread / agent session.
 *   - `workflow-runner`  — triggers and observes a pipeline execution.
 *   - `artifact-viewer`  — displays a produced artifact (video/image/text).
 *   - `capability-card`  — compact card pointing at a capability slug.
 *   - `markdown`         — static prose / documentation block.
 *   - `custom`           — kit-specific widget; consumer must resolve `kind`.
 */
export type WidgetKind = "chart" | "chat-session" | "workflow-runner" | "artifact-viewer" | "capability-card" | "markdown" | "custom";
/**
 * Grid position for a widget on a 12-column canvas.
 *
 * `x` and `y` are 0-based grid cells. `w` and `h` are span sizes in cells.
 * Consumers MAY clamp values to the canvas column count.
 */
export interface GridLayout {
    x: number;
    y: number;
    w: number;
    h: number;
    /** Optional per-widget minimum span (consumer-advisory). */
    minW?: number;
    /** Optional per-widget minimum span (consumer-advisory). */
    minH?: number;
}
/**
 * The set of references a widget may resolve at render time.
 *
 * A widget SHOULD carry at most one authoritative reference (e.g. a
 * `capabilitySlug` for a capability-card, or an `artifactId` for an
 * artifact-viewer), plus optional auxiliary references.
 */
export interface WidgetBindings {
    /** CMS capability slug this widget is about. */
    capabilitySlug?: string;
    /** Saved workflow / pipeline id this widget runs or observes. */
    pipelineId?: string;
    /** Persisted artifact id this widget displays. */
    artifactId?: string;
    /** Chat thread / session id this widget embeds. */
    threadId?: string;
    /** Free-form binding bag for `custom` widgets. */
    custom?: Record<string, unknown>;
}
/**
 * Per-widget manifest entry.
 *
 * A widget definition is declarative: it names what to render, where to
 * render it, and what data to bind. It does not express execution
 * policy — that remains owned by the capability / pipeline it points at.
 */
export interface WidgetDefinition {
    /** Stable widget id, unique within a composition. */
    id: string;
    /** Widget kind; drives the render resolver. */
    kind: WidgetKind;
    /** Human-facing title rendered in the widget header. */
    title: string;
    /** Optional sub-title / descriptive caption. */
    subtitle?: string;
    /** References the widget renders against. */
    bindings?: WidgetBindings;
    /** Grid layout for the widget on the canvas. */
    layout: GridLayout;
    /** Optional capability execution hints (consumer-advisory). */
    executionHints?: CapabilityExecutionHints;
    /** Arbitrary widget configuration (chart options, viewer options, …). */
    config?: Record<string, unknown>;
    /** Optional tags used by harnesses for filtering / navigation. */
    tags?: string[];
}
/**
 * Type-narrowing helper for declaring widgets inside a `growthub.config.ts`.
 *
 * Runtime identity function — exists purely to attach the
 * {@link WidgetDefinition} type to a literal object without forcing
 * authors to annotate manually.
 */
export declare function defineWidget(widget: WidgetDefinition): WidgetDefinition;
//# sourceMappingURL=widgets.d.ts.map