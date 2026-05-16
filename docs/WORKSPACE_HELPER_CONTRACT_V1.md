# Workspace Helper Contract V1

Authoritative reference for the Growthub workspace-native helper: a governed, workspace-grammar-aware planning engine that drafts dashboards, widget layouts, API registry rows, and custom business objects — then returns structured proposals for explicit human review before any mutation.

## Design principles

1. **Propose-only by default.** The helper never writes workspace config directly. All mutations flow through `POST /api/workspace/helper/apply`, which validates every proposal against `validateWorkspaceConfig` before calling `writeWorkspaceConfig`.

2. **Contract-aware generation.** The inference prompt is injected with the workspace grammar (known widget kinds, object types, PATCH allowlist) so model output maps cleanly to the apply step without heuristic translation.

3. **Governed apply step.** The PATCH allowlist (`dashboards`, `widgetTypes`, `canvas`, `dataModel`) is the hard ceiling. Any proposal with an `affectedField` outside this set is rejected at apply time.

4. **Receipts for every accepted change.** Every apply writes a durable receipt to source-records. These receipts seed the fine-tune loop: accepted workspace-building traces are the highest-weight training signal for future distillation.

5. **No credentials in the prompt.** `sanitizeWorkspaceSnapshot` strips `envRefs` values, credentials, and row data before any snapshot enters the inference call — including snapshots supplied by the client. The query route always re-sanitizes regardless of caller. Only schema shape (column names, object types, dashboard ids) travels to the model.

## Endpoint reference

### POST /api/workspace/helper/query

Propose changes for a given intent. No workspace config is mutated.

**Request body (`WorkspaceHelperQuery`):**

```json
{
  "intent": "build_dashboard | create_widget | register_api | create_object | edit_view | repair | explain",
  "userPrompt": "Sales ops dashboard for a local agency with pipeline stages and revenue chart",
  "mode": "propose",
  "workspaceSnapshot": { "...optional sanitized snapshot..." },
  "model": "gemma3:4b",
  "adapterMode": "ollama",
  "localEndpoint": "http://127.0.0.1:11434/v1"
}
```

If `workspaceSnapshot` is omitted, the server reads and sanitizes `growthub.config.json` automatically.

**Response body (`WorkspaceHelperResponse`):**

```json
{
  "ok": true,
  "summary": "Creating a sales ops dashboard with pipeline stages and weekly revenue widget",
  "proposals": [
    {
      "type": "dashboard.create",
      "affectedField": "dashboards",
      "payload": { "id": "sales-ops", "name": "Sales Ops", "status": "draft" },
      "rationale": "New dashboard for sales pipeline visibility",
      "confidence": 0.88
    },
    {
      "type": "canvas.widget.add",
      "affectedField": "canvas",
      "payload": {
        "kind": "chart",
        "title": "Weekly Revenue",
        "position": { "x": 0, "y": 0, "w": 6, "h": 4 },
        "config": { "chartType": "line" }
      },
      "rationale": "Revenue chart gives immediate sales visibility",
      "confidence": 0.82
    }
  ],
  "warnings": [],
  "receipts": {
    "model": "gemma3:4b",
    "adapterMode": "ollama",
    "endpoint": "http://127.0.0.1:11434/v1/chat/completions",
    "confidence": 0.85,
    "latencyMs": 1240,
    "ranAt": "2026-05-15T21:00:00.000Z",
    "runId": "helper_abc123_def456"
  }
}
```

### POST /api/workspace/helper/apply

Apply accepted proposals from a prior query. Validates each proposal against `validateWorkspaceConfig` before writing.

**Request body (`WorkspaceHelperApplyRequest`):**

```json
{
  "proposals": [...accepted proposals from query response...],
  "reviewedBy": "user",
  "sessionId": "optional-session-link-id"
}
```

**Response body (`WorkspaceHelperApplyResponse`):**

```json
{
  "ok": true,
  "applied": [
    {
      "type": "dashboard.create",
      "affectedField": "dashboards",
      "appliedAt": "2026-05-15T21:00:30.000Z",
      "reviewedBy": "user",
      "rationale": "New dashboard for sales pipeline visibility"
    }
  ],
  "skipped": [],
  "workspaceConfig": { "...updated config..." }
}
```

### GET /api/workspace/helper/receipts

Returns the last N apply receipts. Used by review UI and fine-tune loop.

**Query params:** `limit` (1–100, default 25), `type` (filter by proposal type).

## Proposal type registry

| Type | PATCH field | What it does |
|---|---|---|
| `dashboard.create` | `dashboards` | Creates a new dashboard row |
| `dashboard.update` | `dashboards` | Updates an existing dashboard by `payload.id` |
| `widgetType.bind` | `widgetTypes` | Adds or updates a widget type in the palette |
| `canvas.widget.add` | `canvas` | Adds a widget to the active canvas tab |
| `canvas.tab.create` | `canvas` | Creates a new canvas tab |
| `dataModel.object.create` | `dataModel` | Creates a new governed data model object |
| `dataModel.object.update` | `dataModel` | Updates an existing object by `payload.id` |
| `dataModel.row.add` | `dataModel` | Adds a row to an existing object (`payload.objectId`) |
| `repair.binding` | `dataModel` | Patches `binding` on an existing object |
| `explain.object` | `dataModel` | Informational — no config write |

## Intent → system-prompt specialization

Each intent maps to a distinct system-prompt variant in `lib/workspace-helper.js::buildHelperSystemPrompt`. The prompt injects:

- Known widget kinds: `chart`, `view`, `iframe`, `rich-text`
- Known object types: `data-source`, `api-registry`, `people`, `tasks`, `sandbox-environment`, `custom`
- PATCH allowlist: `dashboards`, `widgetTypes`, `canvas`, `dataModel`
- Full proposal type → patch field mapping
- Output format contract (single JSON object with `summary`, `proposals[]`, `warnings[]`)

## SDK types (`@growthub/api-contract/helper`)

```typescript
import type {
  WorkspaceHelperIntent,       // intent union
  WorkspaceHelperQuery,        // request body
  WorkspaceHelperResponse,     // response body
  WorkspaceHelperProposal,     // single proposal
  WorkspaceProposalType,       // proposal type union
  WorkspaceHelperReceipt,      // run metadata
  WorkspaceHelperApplyRequest, // apply request body
  WorkspaceHelperApplyReceipt, // per-proposal apply receipt
  WorkspaceHelperApplyResponse,// apply response body
  WorkspaceHelperNodeInput,    // pipeline node input
  WorkspaceHelperNodeOutput,   // pipeline node output
  WorkspaceHelperCapabilityManifest,
} from "@growthub/api-contract/helper";

import {
  WORKSPACE_HELPER_INTENT_VALUES,   // string[] of all intents
  WORKSPACE_HELPER_PROPOSAL_TYPES,  // string[] of all proposal types
  PROPOSAL_TYPE_TO_PATCH_FIELD,     // Record<type, patchField>
  isWorkspaceHelperResponse,        // type guard
  isWorkspaceProposal,              // type guard
  WORKSPACE_HELPER_CONTRACT_VERSION,// 1
} from "@growthub/api-contract/helper";
```

## CLI surface

```bash
# Query — returns proposals, no writes
growthub workspace helper query \
  --intent build_dashboard \
  --prompt "Sales ops dashboard for a local agency" \
  --json > proposals.json

# Apply — validates + writes accepted proposals
growthub workspace helper apply \
  --proposal-file proposals.json \
  --yes

# Receipt history
growthub workspace helper receipts --limit 25
```

## UX touchpoints

The helper is reachable from every governed builder surface a no-code user can land on:

- **Data Model page** — top-right `Ask helper` button, per-object trigger inside `ObjectViewPicker`, empty-state `Try the helper` CTA. All three pre-fill a context-appropriate starter prompt and select a scoped intent (People / Tasks / API Registry / sandbox / data-source / custom).
- **Dashboard Builder page** — toolbar `Ask helper` button + command palette "Ask helper" group (build dashboard, edit current view, suggest widgets, repair). Builder integration uses the same `HelperSidecar` component, so wire shape and design system stay identical across both pages.
- **Command palette** — `Cmd/Ctrl+K` everywhere. The `/` key also opens the palette when no `INPUT`/`TEXTAREA`/`SELECT`/contenteditable is focused.
- **Sidebar rail icon** — `PanelRight` when closed and `PanelRightClose` when open. The `Escape` key closes the sidecar.
- **Keyboard apply** — `Cmd/Ctrl+Enter` inside the prompt asks the helper; `Cmd/Ctrl+Enter` outside the prompt applies accepted proposals. The textarea handler stops propagation so submit and apply never collide on the same keystroke.
- **Drag handle** — left edge of the sidecar, `ew-resize` cursor, clamped to `[320px, 80vw]`. While dragging, text selection is suppressed and width is held in memory (no localStorage).
- **Proposal review** — each row shows the proposal type, target PATCH field, a short payload summary chip (no raw JSON), a rationale, and a confidence percent when the model provided one. Skipped proposals render their reason inline.
- **Setup tab** — local model, inference endpoint, deployment mode (`local` / `hosted`), connection status (green = reachable, amber = unreachable / unconfigured), and a copyable `growthub workspace setup --open` command. Ping runs only when the Setup tab opens.

## Adapter contract

The query route dispatches through the `local-intelligence` sandbox adapter:

- Adapter: `local-intelligence` (registered in `sandbox-adapter-registry.js`)
- Locality: `local`
- Model: resolved from `--model` flag → `NATIVE_INTELLIGENCE_LOCAL_MODEL` env → `OLLAMA_MODEL` env → `"gemma3:4b"`
- Mode: `ollama` (default) | `lmstudio` | `vllm` | `custom-openai-compatible`
- Output: `growthub-local-model-sandbox-v1` envelope with `result.json.proposals[]`

The `local-agent-host` adapter is NOT used by the helper. These two adapters remain separate:
- `local-intelligence` — advisory, JSON-only, propose-mode reasoning
- `local-agent-host` — execution authority, spawns agent CLIs on PATH

## Fine-tune loop integration

Every accepted apply writes a receipt to `source-records` under key `helper:apply:receipts`. These records carry:

- `type` — which proposal type was applied
- `affectedField` — which PATCH field was modified
- `rationale` — why the model proposed this change
- `confidence` — model confidence for this proposal
- `reviewedBy` — who reviewed and accepted
- `appliedAt` — ISO timestamp

The receipts are the training signal for future distillation. Accepted workspace-building traces outweigh generic chat transcripts by design. When distilling, filter for `type !== "explain.object"` to get only mutation-bearing examples.

## Source files

| File | Role |
|---|---|
| `apps/workspace/lib/workspace-helper.js` | Grammar-aware prompt builder, envelope parser, validator |
| `apps/workspace/lib/workspace-helper-apply.js` | Proposal → config mutation layer, receipt builder |
| `apps/workspace/app/api/workspace/helper/query/route.js` | POST /api/workspace/helper/query |
| `apps/workspace/app/api/workspace/helper/apply/route.js` | POST /api/workspace/helper/apply |
| `apps/workspace/app/api/workspace/helper/receipts/route.js` | GET /api/workspace/helper/receipts |
| `apps/workspace/app/data-model/components/DataModelShell.jsx` | "Ask helper" trigger + Cmd+K / slash palette + empty-state CTA |
| `apps/workspace/app/data-model/components/HelperSidecar.jsx` | Right-side sidecar (Assistant + Setup tabs, drag handle, per-proposal confidence, skipped reasons) |
| `apps/workspace/app/workspace-builder.jsx` | Dashboard builder "Ask helper" trigger + palette "Ask helper" group |
| `packages/api-contract/src/helper.ts` | SDK type surface |
| `cli/src/commands/workspace-helper.ts` | CLI command surface |
| `.claude/skills/growthub-workspace-helper/SKILL.md` | Claude skill entry |
