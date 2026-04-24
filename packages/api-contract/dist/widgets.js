// ---------------------------------------------------------------------------
// Helper — defineWidget
// ---------------------------------------------------------------------------
/**
 * Type-narrowing helper for declaring widgets inside a `growthub.config.ts`.
 *
 * Runtime identity function — exists purely to attach the
 * {@link WidgetDefinition} type to a literal object without forcing
 * authors to annotate manually.
 */
export function defineWidget(widget) {
    return widget;
}
//# sourceMappingURL=widgets.js.map