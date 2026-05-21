# Workspace Workflows Folder Item V1

Workspace Workflows are governed Builder folder items that open a real orchestration canvas for a sandbox execution environment. They are not dashboard rows, duplicated sandbox rows, or static shortcuts. A workflow item points at the sandbox-environment row that owns the executable `orchestrationGraph` or legacy `orchestrationConfig` field, then lets the user edit a draft graph, test it through the same sandbox execution API, and publish it into the live version only after a successful run.

This document covers the user model, architecture, supported canvas nodes, and release safety rules for the workflow builder shipped in the `growthub-custom-workspace-starter-v1` workspace app.

## User Model

The user sees **Builder** as the workspace creation surface. Builder lists dashboards and workflow folder items in one place, with filters for scale. A dashboard opens a dashboard canvas. A workflow opens `/workflows?object=<sandbox-object>&row=<sandbox-row>&field=<orchestration-field>`.

The workflow screen is a no-code orchestration editor:

1. The canvas renders the saved graph from the selected sandbox row.
2. Existing live nodes can be selected and configured in the sidecar.
3. Add-step controls insert new nodes between existing nodes without losing graph direction.
4. Save writes a draft back to the sandbox row.
5. Test runs the exact saved draft through `POST /api/workspace/sandbox-run`.
6. Publish updates the live executable graph and version only when the exact draft has passed with a successful run response.

This keeps the workspace safe: users can save work in progress without changing the execution version that sandbox runs use.

## Data Contract

Workflow folder items are references. They do not embed graph JSON.

The source of truth is the governed Data Model object with `objectType: "sandbox-environment"`. Each row may contain:

- `orchestrationGraph` or `orchestrationConfig` — live executable graph JSON
- `orchestrationDraftGraph` or `orchestrationDraftConfig` — saved draft graph JSON
- `orchestrationDraftStatus` — draft state such as `draft`, `untested`, `testing`, `tested`, `failed`, or `published`
- `orchestrationDraftTestPassed` — whether the saved draft passed
- `orchestrationDraftTestedConfig` — serialized graph that was tested
- `orchestrationDraftLastRunId` and `orchestrationDraftLastTested` — test receipt references
- `orchestrationDeltas` — append-only publish history
- `version` and `lifecycleStatus` — live published execution version and state

The runtime reads the live field for normal execution. The test action sends `useDraft: true` so the same sandbox-run path can validate draft behavior without overwriting the live field.

## Draft And Publish Safety

The publish gate is deterministic:

- Save draft persists the draft graph only.
- Test runs the exact saved draft through the real sandbox-run endpoint.
- Publish is blocked unless `orchestrationDraftTestPassed` is true and `orchestrationDraftTestedConfig` matches the currently serialized draft.
- Publish increments the row version, writes the live orchestration field, clears the draft field, and appends an `orchestrationDeltas` record.

Delete and destructive node edits are draft-only until Publish. Destructive data actions such as Delete Record also carry `confirmationRequired` so run-time behavior can require explicit confirmation.

## Canvas Behavior

The canvas renders all nodes from the saved graph in order, with centered node cards and directional connectors. Empty graphs are supported and show an empty starting state. Connector add buttons are hidden until hover so the primary path remains readable.

The sidecar is the only configuration surface. It owns add-step selection, node editing, delta-tag fields, runtime previews, delete confirmation, and node JSON inspection. The canvas remains responsive when the sidecar is open.

## Supported Node Types

The orchestration graph validator accepts these node types:

| Node type | User-facing role | Main purpose |
| --- | --- | --- |
| `thinAdapter` | AI Model | Calls an existing sandbox-environment row, preserving runtime, adapter, prompt, and network policy on that row. |
| `data-trigger` | Data Trigger | Starts a workflow from workspace object events such as record creation, update, deletion, or schedule/manual trigger state. |
| `data-action` | Data Action | Creates, updates, deletes, searches, or upserts records against official workspace Data Model objects. |
| `ai-agent` | AI Agent | Configures model, prompt, permissions, and structured output fields for AI work inside the graph. |
| `flow-control` | Flow | Handles iterator, filter, if/else, and delay steps for routing and guardrails. |
| `core-action` | Core Action | Handles send email, draft email, code logic function, and HTTP request steps. |
| `human-input` | Human Input | Adds form-based human input steps. |
| `api-registry-call` | API Registry Call | Executes a governed API registry call when a sandbox tool is created from an API registry row. |
| `transform-filter` | Transform Filter | Applies filtering or transformation between API input and result output. |
| `normalize-output` | Normalize Output | Normalizes response payloads before the final result. |
| `tool-result` | Tool Result | Produces the final structured result for API-backed sandbox tools. |
| `input` | Input | Represents the initial input boundary for API-backed graphs. |
| `sandbox-adapter` | Sandbox Adapter | Bridges graph execution to a sandbox adapter. |
| `custom-webhook` | Custom Webhook | Supports webhook-style graph execution providers. |

The add-step sidecar exposes the production no-code node set:

- Data: Create Record, Update Record, Delete Record, Search Records, Create or Update Record
- AI: AI Agent
- Flow: Iterator, Filter, If/else, Delay
- Core: Send Email, Draft Email, Code - Logic Function, HTTP Request
- Human Input: Form

Data nodes bind to workspace Data Model objects, not to whatever happens to be visible on the current canvas. This keeps object selection grounded in the user's real workspace config.

## Delta Tags

Delta tags are not decoration. They describe which parts of the node changed and are persisted with publish history. The sidecar derives default tags from the node type and real bindings, then lets users edit supported tags when the node config needs explicit metadata.

Common tags:

- `routing` — graph path, branch, endpoint, or node ordering changed
- `prompt` — prompt or instructions changed
- `model` — model or adapter behavior changed
- `input` — input binding, field map, object selection, or request payload changed
- `output` — output schema, response normalization, or result field changed
- `evaluation` — filter, condition, or scoring logic changed
- `guardrail` — confirmation, safety, permission, or destructive behavior changed
- `runtime` — timing, delay, retry, adapter, locality, or execution behavior changed

On publish, node deltas are computed against the previous live graph and appended to `orchestrationDeltas` with the new version. This gives operators a reviewable history without requiring users to edit raw JSON.

## Power Use Cases

Workspace workflows support:

- Local AI model orchestration across multiple sandbox rows
- API registry tools promoted into executable sandbox workflows
- Safe draft editing before live workflow version changes
- No-code data operations against governed workspace objects
- Human-in-the-loop form steps
- Deterministic publish history for audit and rollback planning
- Builder-level organization of dashboards and workflow items together

## Implementation Boundaries

The workflow builder follows the same workspace safety model as the rest of the starter:

- `PATCH /api/workspace` remains the validator boundary.
- Runtime execution goes through `POST /api/workspace/sandbox-run`.
- Secret values stay out of graph JSON; rows store references and adapter config only.
- Workflow folder items are references and must not embed orchestration JSON.
- Published graph versions are updated only by Publish after a successful draft run.
- `cli/assets/worker-kits/**` changes ship as kit assets beside `cli/dist/index.js`; they do not require an OSS-tree dist rebuild.

## How To Use

1. Open Builder.
2. Create or open a workflow item.
3. Add or select nodes on the canvas.
4. Configure the selected node in the sidecar.
5. Save draft.
6. Run Test.
7. Review runs from See Runs.
8. Publish after the exact saved draft passes.

For direct debugging, inspect the selected sandbox row in Data Model and compare the live orchestration field, draft orchestration field, version, lifecycle status, and orchestration deltas.
