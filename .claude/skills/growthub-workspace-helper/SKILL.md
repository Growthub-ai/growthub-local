---
name: growthub-workspace-helper
description: >
  Draft dashboards, widget layouts, API registry rows, and custom business
  objects via the workspace helper endpoint. Returns governed proposals for
  explicit human review and apply. Use when the user asks to build a
  dashboard, create a custom object, register an API, scaffold a widget,
  repair broken references, or explain what a workspace object does.
helpers: []
subSkills: []
selfEval:
  criteria:
    - proposals array is non-empty and every type is in WORKSPACE_HELPER_PROPOSAL_TYPES
    - affectedField matches PROPOSAL_TYPE_TO_PATCH_FIELD for each proposal
    - apply receipts confirm at least one proposal was accepted and written
    - no credentials or secret values appear in any proposal payload
  maxRetries: 3
---

# growthub-workspace-helper

Governed, workspace-grammar-aware planning engine. Drafts proposals for dashboards, widget types, API registry rows, and custom business objects — then hands them into the existing Growthub apply surface for explicit review before any mutation.

## Environment resolution (three-step ladder)

```bash
# Step 1 — installed binary
growthub workspace helper query --help 2>/dev/null && GROWTHUB="growthub"

# Step 2 — built dist
[ -z "$GROWTHUB" ] && node cli/dist/index.js workspace helper query --help 2>/dev/null \
  && GROWTHUB="node cli/dist/index.js"

# Step 3 — demo script
[ -z "$GROWTHUB" ] && GROWTHUB="bash scripts/demo-cli.sh cli"
```

Workspace URL defaults to `http://localhost:3000`. Override with `--workspace-url` or `GROWTHUB_WORKSPACE_URL`.

## Intent reference

| Intent | What it produces | Proposal types |
|---|---|---|
| `build_dashboard` | Dashboard configs, sections, widget layouts | `dashboard.create`, `canvas.widget.add` |
| `create_widget` | widgetType bindings, canvas placements | `widgetType.bind`, `canvas.widget.add` |
| `register_api` | API Registry rows with labels, credentials, endpoints | `dataModel.object.create`, `dataModel.row.add` |
| `create_object` | Domain objects: columns, rows, relations, starter views | `dataModel.object.create`, `dataModel.row.add` |
| `edit_view` | Dashboard/canvas layout updates | `dashboard.update`, `canvas.tab.create` |
| `repair` | Fix broken bindings, missing refs, incomplete views | `repair.binding`, `dataModel.object.update` |
| `explain` | Informational explanation (no config write) | `explain.object` |

## Proposal type → PATCH field mapping

| Proposal type | PATCH field |
|---|---|
| `dashboard.create` | `dashboards` |
| `dashboard.update` | `dashboards` |
| `widgetType.bind` | `widgetTypes` |
| `canvas.widget.add` | `canvas` |
| `canvas.tab.create` | `canvas` |
| `dataModel.object.create` | `dataModel` |
| `dataModel.object.update` | `dataModel` |
| `dataModel.row.add` | `dataModel` |
| `repair.binding` | `dataModel` |
| `explain.object` | `dataModel` (read-only) |

## Usage pattern

### 1. Query (propose only — no writes)

```bash
$GROWTHUB workspace helper query \
  --intent build_dashboard \
  --prompt "Sales ops dashboard for a local agency with pipeline stages and weekly revenue chart" \
  --json > proposals.json
```

Or from the workspace UI: **Data Model → Ask helper** button.

### 2. Review proposals

```bash
cat proposals.json | python3 -c "import sys,json; d=json.load(sys.stdin); [print(p['type'], '->', p['rationale']) for p in d.get('proposals', [])]"
```

### 3. Apply accepted proposals

```bash
$GROWTHUB workspace helper apply --proposal-file proposals.json --yes
```

Or from the workspace UI: select proposals in the helper panel → **Apply N proposals**.

### 4. View receipt history

```bash
$GROWTHUB workspace helper receipts --limit 10
```

## API wire shapes

**POST /api/workspace/helper/query**
```json
{
  "intent": "build_dashboard",
  "userPrompt": "Sales ops dashboard for a local agency",
  "mode": "propose"
}
```

Response:
```json
{
  "ok": true,
  "summary": "Creating a sales ops dashboard with pipeline and revenue widgets",
  "proposals": [
    {
      "type": "dashboard.create",
      "affectedField": "dashboards",
      "payload": { "id": "sales-ops", "name": "Sales Ops", "status": "draft" },
      "rationale": "New dashboard for sales pipeline visibility",
      "confidence": 0.88
    }
  ],
  "warnings": [],
  "receipts": { "model": "gemma3:4b", "confidence": 0.88, "latencyMs": 1240, "ranAt": "..." }
}
```

**POST /api/workspace/helper/apply**
```json
{
  "proposals": [...accepted proposals from query response...],
  "reviewedBy": "agent-slug-or-user"
}
```

Response:
```json
{
  "ok": true,
  "applied": [{ "type": "dashboard.create", "affectedField": "dashboards", "appliedAt": "..." }],
  "skipped": [],
  "workspaceConfig": { "...updated config..." }
}
```

## Boundaries

- The helper **never writes** directly. Mutation is only through `POST /api/workspace/helper/apply`.
- The PATCH allowlist (`dashboards`, `widgetTypes`, `canvas`, `dataModel`) is the hard ceiling. Any proposal type outside this mapping is rejected at apply time.
- `explain.object` proposals are informational — no config write occurs.
- Credentials and secret values never enter the inference prompt. `workspaceSnapshot` is sanitized server-side before reaching the model.
- Every accepted apply appends a receipt to source-records. Do not bypass this with direct PATCH calls.

## SDK import (`@growthub/api-contract/helper`)

```typescript
import type {
  WorkspaceHelperQuery,
  WorkspaceHelperResponse,
  WorkspaceHelperProposal,
  WorkspaceHelperApplyRequest,
  WorkspaceHelperApplyResponse,
} from "@growthub/api-contract/helper";
import {
  WORKSPACE_HELPER_INTENT_VALUES,
  WORKSPACE_HELPER_PROPOSAL_TYPES,
  isWorkspaceHelperResponse,
  isWorkspaceProposal,
} from "@growthub/api-contract/helper";
```
