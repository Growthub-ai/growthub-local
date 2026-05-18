# Workspace Helper V1 — governed local AI inside every Growthub workspace

`@growthub/cli@0.12.1` ships the **Workspace Helper** as a first-class
primitive inside every workspace exported from
`growthub-custom-workspace-starter-v1`. The helper is a multi-turn AI
chat sidecar that turns plain-language requests into **governed
proposals** the user reviews and applies — every accepted proposal
lands as a real change in the workspace config under the existing PATCH
allowlist, with full audit and thread persistence.

This page is the canonical V1 contract for the feature: how to set it
up, how it works inside the workspace, and what every surface guarantees.

---

## 1. Get a workspace with the helper in 3 commands

```bash
npx -p @growthub/cli@latest growthub kit download growthub-custom-workspace-starter-v1 --out ./my-workspace
cd my-workspace/apps/workspace
npm install
npm run dev
```

Open `http://localhost:3000`. The helper is the **`Ask helper` pill** in
the top-right of the rail header on every page (Dashboards, Management,
Workspace Settings). Click it to open the right-side chat sidecar.

### Pre-flight: a local model

The helper runs against an **OpenAI-compatible chat completions endpoint**
on your machine — Ollama by default:

```bash
# install once
brew install ollama
ollama serve &
ollama pull gemma3:4b
```

Any locally-hosted model with a chat-completions endpoint works
(LM Studio, vLLM, custom). Configure model + endpoint + adapter mode in
the helper sidecar's **Setup tab** (gear icon in the sidecar header).

---

## 2. The chat surface (Twenty / ChatGPT-grade grammar)

| Surface | Behavior |
|---|---|
| **Rail `Ask helper` pill** | Single primary entrypoint on every page. Click → opens a fresh thread with chip-stack (Build dashboard / Create object / Edit view / Repair workspace / +More). |
| **Rail Chat tab** | Lists every conversation from the governed `helper-threads` object. Search bar above `Latest`, truncated to 10 with `Show N more` toggle, hover three-dot menu for Rename / Archive / Delete. |
| **Sidecar header** | `Workspace Helper` title (or dynamic thread title when rehydrating) + gear icon (toggles Assistant ↔ Setup) + X close. |
| **User turn** | Right-aligned grey rounded bubble. |
| **Assistant turn** | Left-aligned full-width markdown block, rendered through `react-markdown` + `remark-gfm` (headings, lists, tables, code, blockquotes). |
| **System apply receipt** | Inline `ToolCallCard` (OpenAI tool-call grammar) sitting directly below the assistant turn it confirms: wrench icon + `Tool Call Output` title + chevron accordion exposing the full proposal JSON metadata + `Open ↗` button to navigate to the created artifact. |
| **Composer** | Bottom-anchored: empty-state chip stack (intents) → textarea with attach + black-square send button. ⌘+Enter sends. ⌘+Enter outside the prompt applies accepted proposals. |
| **Loading state** | 3-dot pulse animation in an assistant bubble while gemma is responding. |
| **Conversation scroll** | `overflow-y: auto` + `overscroll-behavior: contain` — long multi-turn threads scroll cleanly inside the sidecar without disturbing rail, page, or composer. |

---

## 3. Architecture — how a turn flows

```
┌─────────────────────────────────────────────────────────────────────────┐
│  user prompt + intent ─────►  POST /api/workspace/helper/query          │
│                               • L3 intent router locks intent per turn  │
│                               • prior messages pulled from              │
│                                 helper-threads.rows[threadId].messages  │
│                               • buildChatMessages assembles stable      │
│                                 system + sanitized state + replayed     │
│                                 history + new user                      │
│                               • intelligenceSandbox.messages → adapter  │
│                                                                          │
│  local-intelligence adapter ─►  Ollama / LM Studio / vLLM chat          │
│                                 completions endpoint, response_format   │
│                                 = json_object, stable system prompt     │
│                                                                          │
│  parseHelperEnvelope ◄──────  result.json OR result.text OR             │
│                               rawText fallback (the path                │
│                               helpers/grade-raw-pairs.mjs uses for     │
│                               reliable parsing across model variance)  │
│                                                                          │
│  response ─────────────────►  { summary, proposals[], warnings,        │
│                                  receipts, messages, threadId }         │
│                                                                          │
│  user accepts proposals ───►  POST /api/workspace/helper/apply          │
│                               • validateProposalForApply against        │
│                                 workspace-schema validator              │
│                               • applyProposalToConfig merges payloads   │
│                               • PATCH /api/workspace writes through     │
│                                 the existing allowlist                  │
│                               • upsertHelperThreadRow appends system    │
│                                 message + lastApplied[] with full       │
│                                 payload (refresh-safe ToolCallCard)     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Hidden helper sandbox primitive

The helper does NOT mutate or coopt the user's personal `sandboxes-alignment-loop`
sandbox row. When needed, a **dedicated hidden sandbox-environment row**
(`workspace-helper-sandbox`, name `workspace-helper`) auto-seeds on first
Setup save with helper-tuned instructions for gemma3:4b. The row is
filtered out of `listWorkspaceDataModelTables` so it never appears in
the user-facing Data Model picker.

---

## 4. Real-data widgets — the closed loop

When the helper applies a `canvas.widget.add` proposal with a
`sourceObjectId`, the apply layer:

1. **Normalizes layout grammar** — accepts the modern
   `{col, row, width, height}` shape, the canonical
   `{x, y, w, h}` shape, OR a top-level `payload.position`.
2. **Auto-packs** to the first non-colliding 12×16 grid slot when no
   position is supplied — no more 0:0 defaults colliding with existing
   widgets.
3. **Snapshots real data** — looks up the bound Data Model object and
   inlines its `columns` + `rows` + `label` into the widget's
   `config.source` / `config.columns` / `config.rows`. The kit's view
   and chart widgets read inline config data (see
   `lib/workspace-data-model.js::deriveWidgetTable`), so the widget
   renders real rows the moment it lands. The top-level
   `sourceObjectId` is preserved as provenance for future refresh.

Result: an `Ask helper` request like
*"Build a Sales Pipeline dashboard with a chart of revenue and a view of active clients"*
produces a real dashboard with widgets that render real rows from the
bound Data Model object — no manual "Select a source" follow-up required.

---

## 5. Persistence + audit (no data loss across refresh)

Every thread persists as a row inside the governed `helper-threads`
custom-typed Data Model object (well-known id `helper-threads`,
objectType `custom`):

| Field | Owner | Notes |
|---|---|---|
| `id` | apply route | `thr_<timestamp>_<rand>` |
| `title` | apply route | derived from first user prompt |
| `intent` | apply route | locked for the thread |
| `messages[]` | both routes | up to 400 turns — `user` / `assistant` / `system` (apply-receipt) |
| `lastApplied[]` | apply route | full proposal payload + confidence per receipt → ToolCallCard rehydration |
| `lastSkipped[]` | apply route | rejected proposals with reason |
| `applied` / `skipped` / `turnCount` | apply route | running counters |
| `updatedAt` | apply route | ISO timestamp |

The `growthub.source-records.json` sidecar also tracks every helper run
under `helper:<intent>:<runId>` and every apply receipt under
`helper:apply:receipts` for the distillation pipeline.

**Refresh-safe**: when a thread is reopened from the rail Chat tab, the
sidecar rehydrates messages from `row.messages[]` and ToolCallCards
from `row.lastApplied[]` (with full payload). Apply receipts re-render
as inline cards exactly as the user left them.

---

## 6. Governance + the PATCH allowlist

Every proposal targets one of four allowlisted fields (`dashboards`,
`widgetTypes`, `canvas`, `dataModel`). The validator in
`apps/workspace/lib/workspace-schema.js` enforces:

- Object types from `KNOWN_OBJECT_TYPES`
- Widget kinds from `KNOWN_WIDGET_KINDS`
- Dashboard status from `{draft, active, archived}`
- Canvas widget position bounds + no overlap on the 12×16 grid
- Static data binding modes from `{manual, json, csv, integration}`
- Sandbox-environment row schema invariants

Invalid proposals are SKIPPED, not silently mutated. The system-message
apply receipt carries `skippedCount` + a plain-language reason, and the
ToolCallCard exposes the full payload + the validator's verdict.

---

## 7. Settings → Ownership

The previous **Management** modal is now the **Ownership** tab (4th
slot in Workspace Settings, after `General`, `APIs & Webhooks`, `Apps`).
Inspect-only readiness surface for:

- Workspace identity (`id`, `name`, `capabilities`)
- API contract (PATCH allowlist, error codes, persistence mode)
- Workflows declared in `growthub.config.json`
- Integrations adapter + deploy target
- Persistence mode (`filesystem` / `read-only` / `database`)
- Source resolvers — registered files + upload form (when persistence
  is writable)

Workflow execution stays in `growthub workflow` / `growthub bridge` —
this tab never executes, never calls hosted endpoints, and never
exposes tokens.

---

## 8. End-to-end use case

A real dashboard built from `training-traces` distillation data (53 rows
of graded user→assistant pairs):

1. Click `Ask helper` in the rail header.
2. Pick the **Build dashboard** chip and prompt:
   > *Build a Training Traces Quality dashboard for monitoring grading quality.*
3. Helper returns proposals — review the chevron-accordion JSON metadata
   on each Tool Call Output card, accept, apply.
4. Send a follow-up in the same thread:
   > *Add a view widget bound to training-traces showing the 10 most recent traces.*
5. Apply. The widget lands auto-packed and renders all 53 rows
   (sessionDate, qualityScore, reason) immediately.
6. Send another follow-up:
   > *Add a chart of qualityScore distribution.*
7. The chart widget snapshots the same 53 rows with `groupBy:
   qualityScore` config — the 28×score-4 / 25×score-5 distribution
   renders the moment it lands.

The whole thread is one row in `helper-threads`, with every turn,
every applied proposal payload, and every apply receipt persisted for
the next refresh.

---

## 9. Reference

| Code | Path |
|---|---|
| Rail (all surfaces) | `apps/workspace/app/workspace-rail.jsx` |
| Sidecar shell + ToolCallCard | `apps/workspace/app/data-model/components/HelperSidecar.jsx` |
| Apply layer (snapshot logic) | `apps/workspace/lib/workspace-helper-apply.js` |
| Query layer (chat + intent) | `apps/workspace/lib/workspace-helper.js` |
| Query route | `apps/workspace/app/api/workspace/helper/query/route.js` |
| Apply route | `apps/workspace/app/api/workspace/helper/apply/route.js` |
| Ownership settings | `apps/workspace/app/settings/ownership/` |
| Validator | `apps/workspace/lib/workspace-schema.js` |

### Local model fields you can override per request

```jsonc
POST /api/workspace/helper/query
{
  "intent": "build_dashboard",            // 7 supported intents
  "userPrompt": "<plain-language brief>",
  "threadId": "thr_…",                    // omit for new thread
  "model": "qwen2.5:7b",                  // optional override
  "localEndpoint": "http://127.0.0.1:11434/v1/chat/completions",
  "adapterMode": "ollama"                 // ollama | lmstudio | vllm | custom-openai-compatible
}
```

The Setup tab persists these into the hidden helper sandbox row so
they survive across sessions.

---

[← Back to README](../README.md) · [Workspace Config Contract V1](./WORKSPACE_CONFIG_CONTRACT_V1.md) · [Governed Workspace Topology V1](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md)
