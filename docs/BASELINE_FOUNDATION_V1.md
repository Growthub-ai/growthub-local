# Baseline foundation (V1 compass)

This document is a short human synthesis of what the repo already ships as **Agent Workspace as Code (AWaC)**. It aligns with [GOVERNED_WORKSPACE_TOPOLOGY_V1.md](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) and the custom workspace starter kit under `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/`.

## What is frozen

- **Workspace as product object:** `growthub.config.json`, `apps/workspace/`, `.growthub-fork/`, contracts (`SKILL.md`, `AGENTS.md`), helpers, and nested skills form one portable artifact.
- **Authority boundary:** the browser does not execute hosted workflows, does not hold Bridge tokens, and does not decide authority. `PATCH /api/workspace` is allowlisted to dashboards, widget types, canvas, and `dataModel` only.
- **Data Model surface:** `dataModel.objects[]` is the governed manual object layer; object creation does not mutate canvas or auto-create widgets.
- **Sandbox Environment primitive:** rows describe execution; they are not View widget sources. Runs go through `POST /api/workspace/sandbox-run` and write receipts (config row fields + `growthub.source-records.json`).
- **Reference integrity:** reference columns resolve through `POST /api/workspace/reference-options` (config + source-record + resolver paths); secrets do not reach the browser.
- **Baseline object families:** People, Tasks, Data Sources, API Registry, Sandbox Environment, and Custom—see topology doc “Baseline object model freeze.”

## What can be refined

- **Activation and demos:** first successful run, golden-path docs, optional HTTP probes (`scripts/awac-golden-path-probe.mjs`).
- **Operator UX:** empty states, labels, sandbox run panel, reference picker polish, JSON receipt viewing—without new object types.
- **Docs and market assets:** README hero, short video, screenshots, “why AWaC” narrative grounded in real routes and contracts.
- **Observability:** lightweight probes, clearer status and duration in the UI, export-oriented trace narrative.
- **Export lanes:** JSONL-friendly exports from source records and run traces for **external** fine-tuning (not embedded training in core runtime).

## What should not expand yet

- New first-class `objectType` values for every new idea (including a “Distillation” business object) until a pattern repeats across many accounts.
- Provider-specific logic in Data Model UI components (keep transport and secrets behind API routes and adapters).
- Local models **owning** execution authority or running tools directly outside the propose → validate → dispatch pattern.

## How to demo

Follow [DEMO_SCRIPT_5_MINUTES.md](./DEMO_SCRIPT_5_MINUTES.md): Data Model → Sandbox Environment → API Registry reference → run sandbox → inspect receipt → state what Local Intelligence does not do.

## How to sell

Position as the **open-source local workspace layer for governed AI operations**: versioned artifact, visible governance, deterministic sandbox receipts, optional hosted authority—not as a generic “no-code table builder” unless that framing helps a specific buyer.

## How to validate

- **Automated:** CLI and installer pin per [ARTIFACT_VERSIONS.md](./ARTIFACT_VERSIONS.md); `pnpm` typecheck and vitest for CLI where applicable; optional `node scripts/awac-golden-path-probe.mjs` after `pnpm install` in the temp app (see script header).
- **Manual:** a new user can name the six baseline families, pick a reference without typing an opaque ID, run a sandbox, see where it ran (local vs serverless), and read `lastResponse` / source id fields.
- **CI:** repository `smoke`, `validate`, and `verify` gates plus `node scripts/release-check.mjs` before merge when release-scoped.
