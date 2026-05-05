# Quickstart: Governed Workspace

Get a Growthub governed workspace running in under 5 minutes.

## 1. Install

```bash
npm create @growthub/growthub-local@latest -- --profile workspace --out ./my-workspace
```

## 2. Start the builder

```bash
cd my-workspace/apps/workspace
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 3. What you see

**Left rail** — workspace identity, navigation, persistence status  
**Center** — dashboards table + fixed-grid canvas  
**Right panel** — widget settings, workspace settings, management

## 4. Add a dashboard

Click **+ Dashboard** in the toolbar. A new row appears in the dashboards table. Click it to select it.

## 5. Add your first widget

Drag across cells in the canvas to select a region, then click a widget type in the right panel:

- **Chart** — bar chart with configurable values
- **View** — table with columns and rows
- **iFrame** — embedded URL content
- **Rich Text** — freeform notes and briefing text

## 6. Apply a template

Click **Templates** → select a layout → **Apply to Current Tab** to replace the canvas with a pre-built starting point.

## 7. Edit widget settings

Click any widget to select it. The right panel shows its settings: title, kind-specific config, placement, and actions (duplicate, remove).

## 8. Save

Click **Save** in the toolbar. The config is written to `apps/workspace/growthub.config.json`. Refresh to confirm persistence.

## 9. Export / Import

Click **Export** to download a JSON template file. Click **Import** to load one back.

## 10. Settings and Management

Click **Settings** in the right panel tabs to:
- Edit workspace name, logo URL, accent colour
- See persistence mode and integration adapter state

Click **Management** to:
- Inspect the API surface
- Check workflow and integration connection status
- See persistence adapter details

---

## Next steps

- [Workspace Config Contract V1](./WORKSPACE_CONFIG_CONTRACT_V1.md) — understand every config field
- [Governed Workspace Topology V1](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — file layout and authority boundaries
- [Source Import to Workspace Builder](./SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md) — bring in a GitHub repo or skill
- [Workspace Builder Runtime V1](./WORKSPACE_BUILDER_RUNTIME_V1.md) — full technical reference
