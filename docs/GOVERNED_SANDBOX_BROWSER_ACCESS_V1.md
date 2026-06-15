# Governed Sandbox Browser Access V1

Official feature note for the `0.14.2` governed sandbox browser access release.

This release completes browser access as a governed sandbox capability across Data Model records, workflow canvas records, orchestration graph nodes, local agents, local intelligence, and swarm subagents. The capability stays on the existing sandbox object and executes through the existing adapter boundary.

## Release Thesis

Browser access is not a separate runtime, hidden object model, or helper-only behavior. It is a capability on a governed `sandbox-environment` row:

```text
sandbox-environment row
  -> browserAccess + networkAllow
  -> sandbox-run request
  -> adapter capability boundary
  -> local agent host, local process, local intelligence, or serverless handler
  -> source-record run output
```

The same row can be edited from the Data Model sidecar or from a workflow canvas node. The row remains the source of truth.

## What 0.14.2 Adds

- `browserAccess` is preserved on sandbox records and travels through workflow and swarm projections.
- Turning on browser access also enables network access for the sandbox row.
- Local agent host rows engage first-party browser modes where the selected host supports them.
- Local process rows receive `GROWTHUB_SANDBOX_BROWSER_ACCESS=1` so scripts can honor the same governed grant.
- Local intelligence rows execute browser tool intents through the local browser bridge before returning the final JSON response.
- Serverless runs carry `browserAccess` in the `growthub-sandbox-run-v1` envelope so remote handlers can grant the same capability.
- Workflow canvas AI-agent nodes inherit browser access only when their node-level network permission is enabled.
- Serverless upgrade affordances stay out of local-intelligence views while the execution target controls still allow switching back to serverless and restore the upgrade UI when selected.

## Sandbox Object Contract

The source of truth is the governed Data Model object whose rows use `objectType: "sandbox-environment"`. Browser access is stored on the row as `browserAccess`, alongside the existing execution fields:

| Field | Role |
| --- | --- |
| `runLocality` | Chooses local or serverless execution. |
| `adapter` | Selects the execution adapter, including `local-intelligence`. |
| `networkAllow` | Allows network access for the sandbox. Browser access enables it. |
| `browserAccess` | Grants browser execution capability to the selected adapter. |
| `schedulerRegistryId` | References an API Registry row when `runLocality` is `serverless`. |
| `orchestrationGraph` | Stores workflow canvas nodes for workflow and swarm runs. |

The row is still validated through the normal workspace config boundary. When a row switches to serverless, `schedulerRegistryId` must reference an API Registry integration id.

## Workflow Canvas And Node Graph

Workflow folder items open the canvas for the selected sandbox row. The canvas does not create a second workflow authority. It edits the graph stored on the sandbox row and tests through:

```http
POST /api/workspace/sandbox-run
```

For AI-agent nodes, node-level network permission gates browser inheritance. This keeps browser access scoped:

- sandbox row browser access grants the capability;
- node network permission decides whether that AI node can use it;
- node `sandboxRecordRef` keeps deltas traceable to the owning sandbox row and node id.

## Local Intelligence Browser Bridge

`local-intelligence` remains the OpenAI-compatible local model adapter for Ollama, LM Studio, vLLM, and compatible servers. With `browserAccess` off, tool intents remain proposals. With `browserAccess` on, browser tool intents execute through the local browser bridge and the adapter returns a final JSON response after browser evidence is available.

The bridge is deliberately behind the adapter boundary:

- it is only active for sandbox runs with browser access enabled;
- it does not change helper proposal semantics when browser access is off;
- it keeps Ollama and other local models behind the same governed sandbox row fields as every other adapter.

## Local Agents, Thin Adapter, And Env Contract

Local agent host and local process rows use the thin adapter contract. The workspace does not take over those tools; it passes the governed capability into the selected lane:

| Adapter lane | Browser access behavior |
| --- | --- |
| `local-agent-host` | Uses supported host browser modes such as Codex browser use or Claude Chrome mode. |
| `local-process` | Publishes `GROWTHUB_SANDBOX_BROWSER_ACCESS=1` to the process environment. |
| `local-intelligence` | Runs browser tool intents through the local browser bridge. |
| serverless | Carries `browserAccess` in the sandbox-run envelope for the remote handler. |

This keeps browser execution adapter-specific while the policy bit stays adapter-neutral on the sandbox row.

## Swarm And Subagent Behavior

Agent swarms are still governed workflow rows, not a separate object model. Swarm subagents inherit the sandbox row's browser grant through the same workflow graph and sandbox-run path. Subagents must still be eligible at the node level: browser access is available only when the sandbox has `browserAccess` enabled and the node grants network access.

This gives swarms a single audit path:

- the swarm row owns the execution settings;
- the graph owns subagent node configuration;
- `sandbox-run` owns execution;
- source records own run evidence.

## UI Invariants

- Data Model and workflow canvas surfaces expose the same execution target fields.
- The local/serverless radio options remain available so users can switch execution target.
- Local-intelligence local views do not show the serverless upgrade cockpit while they are local.
- When the user switches to serverless, the serverless cockpit returns and the row receives a valid scheduler reference.
- Long capability explanations stay behind compact help affordances instead of filling the form.

## Validation Map

The release is complete when these checks pass together:

- local-intelligence browser bridge is byte-for-byte present in the shipped starter workspace;
- Data Model and workflow canvas both preserve `browserAccess` on sandbox rows;
- local-intelligence runs execute browser tool intents only when `browserAccess` is enabled;
- local-process receives `GROWTHUB_SANDBOX_BROWSER_ACCESS=1`;
- serverless flow state carries `browserAccess`;
- swarm proposals inherit browser access from the live helper sandbox;
- execution target switching remains valid for local and serverless rows;
- package versions are aligned in the current branch manifests; read `cli/package.json` and `packages/create-growthub-local/package.json` per [`docs/ARTIFACT_VERSIONS.md`](./ARTIFACT_VERSIONS.md).
