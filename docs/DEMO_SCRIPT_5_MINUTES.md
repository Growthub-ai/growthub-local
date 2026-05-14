# Five-minute demo script

Use this script for onboarding, sales engineering dry-runs, or PR evidence. It matches the **golden path** exercised in `scripts/awac-golden-path-probe.mjs` at the HTTP level.

## Prerequisites

- Node 20+
- Either `npm create @growthub/growthub-local@latest` with the custom workspace profile, or `npx -p @growthub/cli@latest growthub kit download growthub-custom-workspace-starter-v1` and `cd …/apps/workspace && npm install && npm run dev`
- For sandbox runs that hit a real local model, Ollama (or another OpenAI-compatible endpoint) optional; the **local-process** adapter works without it for a minimal receipt demo.

## Minute 0–1 — Install and boot

1. Run the guided installer or kit download path from [README.md](../README.md#install).
2. `cd apps/workspace`, `npm install`, `npm run dev`.
3. Open the app URL (default Next dev port). Confirm `GET /api/workspace` returns JSON (operators can use browser devtools Network tab).

## Minute 1–2 — Data Model and object families

1. Open **Data Model** in the workspace UI.
2. Point out the **baseline families** (People, Tasks, Data Sources, API Registry, Sandbox Environment, Custom)—see [GOVERNED_WORKSPACE_TOPOLOGY_V1.md](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md#baseline-object-model-freeze-v1).
3. Switch the **object / view picker** to a Sandbox Environment table.

## Minute 2–3 — Reference picker (no secrets in browser)

1. Open a Sandbox Environment row that supports **schedulerRegistryId** (serverless path) or show **Data Source → registryId** for the same pattern.
2. Open the reference picker; show that options load from `POST /api/workspace/reference-options` (Network tab).
3. Explain: options are normalized server-side; **authRef** resolves on the server; the browser never receives raw API keys.

## Minute 3–4 — Sandbox run and receipt

1. Ensure the row has a **Name** and a **local** adapter such as `local-process` with a trivial command, or a **local-intelligence** row if a local model is available.
2. Click **Run sandbox** (UI) or call `POST /api/workspace/sandbox-run` with `{ objectId, name }`.
3. Show **status**, **lastRunId**, **lastSourceId**, and **lastResponse** on the row; optionally **Load previous runs** to show source-record history in the drawer.
4. State clearly: execution is **route-owned**; the UI does not impersonate hosted workflow execution.

## Minute 4–5 — Local intelligence boundary (optional)

1. If a local-intelligence sandbox row exists, run it once.
2. Open the JSON envelope in **lastResponse** and highlight **`toolIntents`**: proposals only—no tool execution in the adapter.
3. Close with: distillation / training is an **export lane** ([DISTILLATION_EXPORT_LANE_V1.md](./DISTILLATION_EXPORT_LANE_V1.md)), not a new Data Model object.

## Maintainer regression

From a full monorepo checkout (network for `npm install` in the temp tree):

```bash
node scripts/awac-golden-path-probe.mjs
```

See the script file for environment variables (`PORT`, `CLI_DEMO_HOME`, etc.).
