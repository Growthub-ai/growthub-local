# Widget Presentation Options V1

Optional, additive widget configuration that lets a view widget render
business data as governed cards instead of (or in addition to) the default
table layout. Lives inside `widget.config.presentationOptions` and persists
through the existing `PATCH /api/workspace` boundary.

## Scope

- **In scope:** view widget rendering (table vs. card engines), field mapping
  for card layouts (title, subtitle, description, status, tone, icon, accent,
  label, image, CTA).
- **Out of scope:** new widget kinds, new PATCH top-level fields, Data Model
  mutations, workflow/sandbox execution, integration credentials, branding.

## Contract

```jsonc
// widget.config.presentationOptions  (all keys optional)
{
  "engine":           "table | project-card | creative-card | metric-card | compact-list",
  "titleField":       "row key bound to card title",
  "subtitleField":    "row key bound to card subtitle",
  "descriptionField": "row key bound to card description",
  "statusField":      "row key bound to status pill",
  "toneField":        "row key driving status pill tone",
  "iconField":        "row key bound to leading icon glyph",
  "accentField":      "row key bound to accent stripe",
  "labelField":       "row key bound to floating label chip",
  "imageField":       "row key bound to card image/media",
  "ctaLabelField":    "row key bound to CTA label",
  "ctaUrlField":      "row key bound to CTA URL",
  "density":          "compact | comfortable",
  "showLabels":       true,
  "showIcon":         true,
  "showAccent":       true,
  "maxItems":         12
}
```

Validation rules live in `lib/workspace-schema.js`:

- All keys are optional. A widget with no `presentationOptions` keeps the
  legacy table rendering.
- `engine` and `density` must be one of the known enums when present.
- Field-mapping keys must be strings when present.
- Toggle keys (`showLabels`, `showIcon`, `showAccent`) must be booleans.
- `maxItems` must be a positive finite integer.
- Unknown keys inside `presentationOptions` are rejected at validation time
  so drift cannot leak in through PATCH or import.

## Sidecar

The widget panel exposes a `Presentation` row inside the view-widget settings
list (next to `Source`, `Fields`, `Filter`, `Sort`). Clicking it opens a
focused sub-panel with:

- engine dropdown
- field-mapping dropdowns (sourced from `widget.config.columns` plus any keys
  observed in `widget.config.rows`)
- density dropdown
- icon / accent / labels toggles
- max-items input
- preview summary and reset-to-defaults button

Field options are derived live from the bound source. Selecting a Data Model
object on the Source sub-panel re-populates the available fields.

## Renderer

`WidgetPreview` in `app/workspace-builder.jsx` switches between the table and
card render paths based on `presentationOptions.engine`:

- `table` (default) — existing table render is preserved.
- `project-card | creative-card | metric-card | compact-list` — renders cards
  using the mapped fields.

Fallback behavior is intentional and forgiving:

- Missing `titleField` → first visible text field is used.
- Missing `subtitleField` → first remaining text field is used.
- Missing `statusField` → no status pill is rendered.
- Missing `iconField` → a neutral placeholder is rendered.
- Mapped field removed from the source → the dropdown still surfaces the
  stale value as `value (missing)`, and the renderer skips it.

## Persistence

All mutations go through the existing widget config write path
(`replaceSelectedWidgetConfig`) and persist via the existing
`PATCH /api/workspace` allowlist (`dashboards`, `widgetTypes`, `canvas`,
`dataModel`). No new API route. No new persistence adapter. No Data Model
writes.
