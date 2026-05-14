# Baseline foundation (V1 compass)

Short synthesis for maintainers and operators: what is **frozen**, what can be **refined**, and how to **demo** and **validate** the governed workspace without widening scope.

## What is frozen

- The **workspace artifact** is the top-level product object (`growthub.config.json`, `apps/workspace`, `.growthub-fork/`, contracts, helpers, skills).
- **Authority:** the browser does not execute hosted workflows, does not hold Bridge tokens, and does not decide authority. `PATCH /api/workspace` stays allowlisted (`dashboards`, `widgetTypes`, `canvas`, `dataModel`).
- **Data Model** is the governed manual object surface (`dataModel.objects[]`). Object creation does not mutate canvas or create widgets implicitly.
- **Sandbox Environment** rows describe execution; they are **not** View widget sources. Runs go through `POST /api/workspace/sandbox-run` and receipts land in source records + row fields.
- **Local Intelligence** is advisory (planning, normalization, recommendation, summarization). Tool intents from local adapters are **proposals only**; no tool execution in the intelligence sandbox adapter path.

## Baseline object families (do not sprawl)

Shipped preset families: **People**, **Tasks**, **Data Sources**, **API Registry**, **Sandbox Environment**, **Custom**. Prefer fields, views, relations, templates, source records, and sandbox runs before adding new first-class `objectType` values. See [GOVERNED_WORKSPACE_TOPOLOGY_V1.md](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md#baseline-object-model-freeze-v1).

## What can be refined

- **Activation:** first successful run paths, README and installer copy, empty states, guided setup in the Data Model UI.
- **Operator polish:** reference picker UX, sandbox run panel clarity, JSON receipt viewing, naming and success messaging.
- **Proof loops:** version alignment (`docs/ARTIFACT_VERSIONS.md`), source-record history, reference-options behavior, local endpoint wiring for sandboxes.
- **Export / distillation narrative:** JSONL-oriented export from traces and source records; training **outside** Growthub Local. See [DISTILLATION_EXPORT_LANE_V1.md](./DISTILLATION_EXPORT_LANE_V1.md).

## What should not expand yet

- New governed object types for every one-off integration story.
- A first-class “Distillation” Data Model object (use export lanes until recurring customer need is proven).
- Provider-specific logic in the browser or bypass of adapter/registry boundaries.

## How to demo

Follow [DEMO_SCRIPT_5_MINUTES.md](./DEMO_SCRIPT_5_MINUTES.md). The golden path is: Data Model → Sandbox Environments → API Registry references as needed → sandbox run → read `lastResponse` / `lastSourceId` → optional Local Intelligence for structured advice only.

## How to sell (positioning)

Position as the **open-source local workspace layer for governed AI operations**: versioned artifact, visible governance, explicit execution boundary, auditable receipts, template-based customization. Avoid “generic no-code spreadsheet” framing; lead with trust and repeatability.

## How to validate

- **Automated:** CLI ↔ installer pin alignment; workspace boots; `GET /api/workspace`; `PATCH` allowlist; `POST /api/workspace/reference-options`; `POST /api/workspace/sandbox-run` receipt shape. Optional: `node scripts/awac-golden-path-probe.mjs` against a running `apps/workspace` dev server.
- **Manual:** a new user can name the six object families, bind a reference without typing a raw secret, run a sandbox, and explain that Local Intelligence did not execute production workflows.
