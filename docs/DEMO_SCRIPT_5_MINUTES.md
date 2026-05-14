# Five-minute demo script

Use this for README alignment, sales engineering dry-runs, and contributor onboarding. All steps assume the **exported workspace app** is running (`cd …/apps/workspace` → `npm install` → `npm run dev`) unless you are narrating the installer-only path.

## Minute 0–1: Install and open

1. Show **one** install path: `npm create @growthub/growthub-local@latest` **or** the kit download one-liner from the root [README.md](../README.md).
2. Open **`/data-model`** (or the app route your build uses for the Data Model page).
3. One sentence: *“This is the governed workspace app—the config is the product.”*

## Minute 1–2: Object families and references

1. Open the object / table picker and name the **baseline families**: People, Tasks, Data Sources, API Registry, Sandbox Environment, Custom (see [GOVERNED_WORKSPACE_TOPOLOGY_V1.md](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md#baseline-object-model-freeze-v1)).
2. If an **API Registry** or **Data Source** row exists, open it and point at the **reference** column: options arrive via `POST /api/workspace/reference-options`—no provider secrets in the browser.
3. If the picker is empty, narrate **status allowlist** behavior: untested or `failed` integrations may be excluded on purpose.

## Minute 2–4: Sandbox run and receipt

1. Select **Sandbox Environments** → open a row with a **Name** set (required for `sandbox-run`).
2. Optionally show **schedulerRegistryId** bound through the same reference pattern for **serverless** locality.
3. Click **Run sandbox**. Emphasize: execution is **`POST /api/workspace/sandbox-run`** only—the UI does not shell out to providers.
4. Expand **lastResponse** and mention **lastRunId** / **lastSourceId** as the receipt handles into `growthub.source-records.json` history.
5. Contrast **local** vs **serverless** in one line: local uses bundled adapters on the server process; serverless delegates to the API Registry row’s endpoint with server-resolved credentials.

## Minute 4–5: Local Intelligence boundary (optional if endpoint running)

1. For a **local-intelligence** adapter sandbox row (or the CLI Local Intelligence lane), show a **JSON** envelope.
2. Explicitly state the invariant: **tool intents are proposals**; no tool execution; no training inside the core runtime.
3. Close with [DISTILLATION_EXPORT_LANE_V1.md](./DISTILLATION_EXPORT_LANE_V1.md) in one sentence: traces and exports feed **external** fine-tuning, then you select the new **localModel**—no “Distillation object” required.

## Checklist (tick for a successful dry run)

- [ ] Workspace booted from the exported app path.
- [ ] Data Model visible; object families named.
- [ ] Reference picker invoked; server round-trip acknowledged.
- [ ] Sandbox run completed or failed with a structured receipt (not a silent failure).
- [ ] Audience can repeat why the browser is not an execution authority.
