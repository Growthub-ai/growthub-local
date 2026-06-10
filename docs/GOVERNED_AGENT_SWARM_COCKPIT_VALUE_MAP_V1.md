# Governed Agent Swarm Cockpit Value Map V1

Official value map for the `0.14.1` governed agent swarm cockpit feature release.

This page extends the [Workspace New Reality Value Map V1](./WORKSPACE_NEW_REALITY_VALUE_MAP_V1.md). It maps the new agent swarm cockpit release to user value, workspace state, runtime authority, and agent-operable evidence.

## Release Thesis

The governed creation loop now supports dynamic agent swarms as first-class workflow records.

```text
Helper prompt
  -> swarm.run.propose
  -> reviewed apply
  -> sandbox-environment row in swarm-workflows
  -> orchestrationGraph agent-swarm-v1
  -> workflow canvas
  -> Background Tasks cockpit
  -> sandbox-run execution
  -> source-record run history
  -> truthful token/tool telemetry
```

The feature does not create a separate swarm runtime or a separate swarm object model. The swarm cockpit operates over the existing sandbox environment primitive, the existing workflow graph field, and the existing `POST /api/workspace/sandbox-run` executor.

## What 0.14.1 Adds

- Helper proposals can create governed `agent-swarm-v1` workflow rows through the existing `dataModel` apply lane.
- Apply inherits the active workspace helper execution target so the swarm row is runnable on first real play.
- First-run eligibility blocks unrunnable rows before the user reaches a failed execution.
- Background Tasks opens from helper tool output into a thread-bounded view for the exact swarm workflow record.
- The header redirect opens the exact workflow record canvas; there is no fallback to another row.
- The workflow canvas stamps every graph node with `sandboxRecordRef: { objectId, rowName, nodeId }` so node delta tags map back to the official sandbox row.
- Runtime telemetry remains truthful: tokens and tools are shown only when the adapter reports them or when a supported adapter footer can be parsed from the actual run output.
- The cockpit can hydrate live NDJSON sandbox-run deltas without inventing unreported metrics.
- The canvas supports mouse drag panning, wheel zoom, fit view, and tall vertical workflows without cutting off top or bottom nodes.

## User Value

### Operators

Operators can ask the workspace helper for a swarm, review the proposed agents, apply once, and immediately run from Background Tasks without manually creating a custom object or repairing execution settings.

### Builders

Builders can open the generated workflow record in the canvas and inspect the exact orchestration graph. Each selected node maps to the owning sandbox row and node id, making delta tags, prompt changes, model changes, and output changes traceable.

### Admins

Admins get one executor path, one record source of truth, and one run history surface:

```http
POST /api/workspace/sandbox-run
{ "objectId": "swarm-workflows", "name": "<workflow row Name>" }
```

This keeps agent swarm execution inside the governed workspace contract.

### Agents

Agents can resume safely because the same artifacts are readable from the workspace:

- `swarm-workflows` sandbox object row;
- `orchestrationGraph` / draft graph;
- `sandboxRecordRef` on graph nodes;
- source-record run history;
- helper apply receipts;
- Background Tasks cockpit projection;
- workflow canvas URL parameters.

## Source Of Truth

| Concern | Source |
| --- | --- |
| Workflow record | `dataModel.objects[].objectType === "sandbox-environment"` |
| Agent swarm graph | `orchestrationGraph.executionMode === "agent-swarm-v1"` |
| Proposal/apply | `workspace-swarm-proposal.js` + helper apply route |
| Execution | `POST /api/workspace/sandbox-run` |
| Runtime | `orchestration-agent-swarm.js` |
| Telemetry | adapter-reported metadata or supported actual output footer |
| UI projection | `orchestration-run-console.js` |
| Background cockpit | `SwarmRunCockpit.jsx` |
| Canvas identity | `sandboxRecordRef` on graph node config |

## Required Product Invariants

- No new PATCH allowlist field.
- No manual custom swarm object creation by the user.
- No fallback workflow redirect.
- No estimated token/tool counts.
- No browser storage as cockpit persistence.
- No execution unless the helper/widget execution target and workflow row eligibility are ready.
- No separate Background Tasks view modes for this release; the cockpit uses the clean phase accordion.
- No secrets in prompts, proposals, source records, browser state, or docs.

## Enterprise Outcome

The release turns "agent swarm" from a chat concept into a governed workspace artifact:

- proposal is reviewable;
- apply is receipt-backed;
- execution is sandboxed through the existing route;
- run history is persisted;
- telemetry is attributable to workflow and subagent rows;
- node configuration remains traceable to the owning sandbox object.

The result is a workspace that can explain what a swarm is, where it runs, which agents participated, what they consumed, what tools they used, what output they produced, and which record owns that evidence.

## Validation Map

The release is complete when these checks pass together:

- helper query returns `swarm.run.propose` without mutating config;
- helper apply upserts one row into `swarm-workflows`;
- the row inherits a runnable execution target from the active helper configuration;
- Background Tasks opens only the tool-output-targeted row;
- Play calls `POST /api/workspace/sandbox-run` with the row's `{ objectId, name }`;
- source records persist the final run;
- cockpit renders phases, subagents, truthful tokens/tools/time, and transcript output;
- workflow canvas opens the exact record and preserves node `sandboxRecordRef`;
- package versions are aligned at `@growthub/cli@0.14.1` and `@growthub/create-growthub-local@0.14.1`.

