# Swarm Run Contract V1

Governed contract for proposing, applying, executing, persisting, and
rendering agent swarms inside the exported workspace starter
(`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace`).

The single source-of-truth chain is the existing post-0.14 governed creation
spine — the swarm lane adds **no new runtime, no new persistence layer, no new
PATCH field, and no new UI grammar**:

```
helper proposal           (POST /api/workspace/helper/query — propose-only)
→ reviewed apply          (POST /api/workspace/helper/apply)
→ sandbox/workflow row    (sandbox-environment row, agent-swarm-v1 graph)
→ sandbox-run             (POST /api/workspace/sandbox-run — the ONLY executor)
→ source-record receipt   (growthub.source-records.json + row stamps)
→ run-console projection  (lib/orchestration-run-console.js, pure)
→ helper sidecar cockpit  (SwarmRunCockpit inside HelperSidecar)
```

## 1. Allowed proposal types

| Type | Patch lane | Effect at apply time |
| --- | --- | --- |
| `swarm.run.propose` | `dataModel` | Create/update a governed `sandbox-environment` row carrying an `agent-swarm-v1` graph |
| `swarm.workflow.save` | `dataModel` | Same normalization as propose — explicit "save this workflow" intent |
| `swarm.run.resume` | `dataModel` | Governed pointer to an EXISTING workflow row; no config mutation, no execution |

All three map to the **existing** `dataModel` patch field. There is no new
top-level PATCH allowlist entry (the allowlist remains
`dashboards | widgetTypes | canvas | dataModel`). This follows the
`resolver.create` precedent of routing special lanes inside `helper/apply`
without widening the general PATCH surface.

## 2. Proposal envelope

Standard `WorkspaceHelperProposal` envelope (`packages/api-contract/src/helper.ts`):

```json
{
  "type": "swarm.run.propose",
  "affectedField": "dataModel",
  "rationale": "Why this swarm helps",
  "confidence": 0.85,
  "payload": {
    "name": "swarm-ui-smoke-test",
    "description": "Low-token 8-agent swarm to exercise workflow UI/UX",
    "objective": "…",
    "agents": [
      {
        "id": "subagent-researcher",
        "role": "Researcher",
        "description": "…",
        "taskPrompt": "…",
        "tools": ["read", "summarize"],
        "required": true,
        "maxTokens": 2000,
        "timeoutMs": 30000
      }
    ],
    "maxConcurrency": 4,
    "outcomeCriteria": "…",
    "runLocality": "local",
    "agentHost": "claude_local",
    "adapter": "local-intelligence"
  }
}
```

The payload describes **intent only**. The model is never trusted to
hand-author the final orchestration graph: `helper/apply` reduces the intent
through `buildDefaultAgentSwarmGraph` (`lib/orchestration-graph.js`). A
payload-supplied `orchestrationGraph` is honored only when it parses AND
passes `validateAgentSwarmGraph`; otherwise it is discarded and rebuilt from
intent.

Validation (`lib/workspace-swarm-proposal.js → validateSwarmRunProposal`):

- `name` and `objective` are required (propose/save).
- ≥ 1 agent, ≤ 24 agents; every agent declares `role` + `taskPrompt`.
- `adapter`, when set, must be prompt-capable (`local-agent-host` or
  `local-intelligence`) — code-execution adapters are rejected.
- `agentHost` values outside the registered host catalog are dropped.
- Credential-shaped payload fields (`apiKey`, `secret`, `password`, …) reject
  the proposal. Secrets never travel in proposals, rows, prompts, source
  records, or browser state — env-ref slugs only.
- `swarm.run.resume` requires only `payload.name` and the row must exist.

## 3. Apply receipt shape

`helper/apply` answers with the standard apply response. Swarm receipts are
standard receipts plus an artifact target the sidecar can open:

```json
{
  "type": "swarm.run.propose",
  "affectedField": "dataModel",
  "appliedAt": "…",
  "reviewedBy": "user",
  "sessionId": null,
  "rationale": "…",
  "artifact": { "surface": "swarm-run", "objectId": "swarm-workflows", "name": "swarm-ui-smoke-test" },
  "summary": "name: swarm-ui-smoke-test · 8 agents · concurrency: 4"
}
```

Receipts render through the existing `ToolCallCard` grammar; the `Open`
button routes to the cockpit detail view inside the sidecar.

## 4. Sandbox-environment row shape

Apply upserts (by `Name`) into the well-known governed object
`swarm-workflows` (`objectType: "sandbox-environment"`, same well-known-id
pattern as `helper-threads`). Row shape is the **existing** sandbox row
schema — validated by `validateSandboxEnvironmentRow`:

```json
{
  "Name": "swarm-ui-smoke-test",
  "slug": "swarm-ui-smoke-test",
  "objectType": "sandbox-environment",
  "lifecycleStatus": "draft",
  "version": "1",
  "runLocality": "local",
  "runtime": "node",
  "adapter": "local-intelligence",
  "agentHost": "",
  "envRefs": "",
  "instructions": "<objective>",
  "timeoutMs": "120000",
  "status": "untested",
  "lastTested": "", "lastRunId": "", "lastSourceId": "", "lastResponse": "",
  "orchestrationConfig": "<serialized agent-swarm-v1 graph>",
  "description": "…"
}
```

Re-applying the same proposal updates the existing row (de-dupe by `Name`)
and preserves prior run stamps (`status`, `lastRunId`, `lastSourceId`,
`lastResponse`, `lastTested`).

## 5. agent-swarm-v1 graph contract

Unchanged from the existing runtime (`lib/orchestration-graph.js`):

- root: `version: 1`, `provider: "growthub-native"`,
  `executionMode: "agent-swarm-v1"`, `swarm: { maxConcurrency, rewardWeights, outcomeCriteria }`
- exactly one `thinAdapter` orchestrator node
- ≥ 1 `ai-agent` subagent nodes (role, taskPrompt, tools, required,
  maxTokens, timeoutMs, prompt-capable adapter only)
- one `tool-result` synthesis node
- `validateAgentSwarmGraph` remains the static gate; the runtime
  (`lib/orchestration-agent-swarm.js`) remains the only swarm executor and
  dispatches exclusively through the registered sandbox adapter boundary.

## 6. Execution + source-record persistence rule

Execution happens **only** through `POST /api/workspace/sandbox-run` after
apply — never during helper query, never during apply, never from chat,
slash commands, or cockpit UI directly mutating anything. The route:

1. runs the row's swarm graph through `runAgentSwarmGraphIfPresent`,
2. appends the run record to `growthub.source-records.json` under
   `sandbox:<objectId>:<slug(name)>` (capped history),
3. stamps `status`, `lastTested`, `lastRunId`, `lastSourceId`,
   `lastResponse` back onto the row.

The swarm runtime itself never writes config or source records.

Run records carry truthful telemetry: per-task `tokens`, `tools`,
`startedAt`, `endedAt`, `phaseId` are populated from adapter-reported
metadata only — `null` when the adapter reported nothing. No estimates.

## 7. Run-console projection rule

`lib/orchestration-run-console.js → deriveSwarmRunProjection(record)` is the
only seam between run records and the cockpit UI. Pure module rules: no
React, no fetch, no config writes, no localStorage, no CSS.

```
swarmRun: {
  runId, title, status, elapsedMs,
  agentCount, totalTokens, totalTools,   // totals null when nothing reported
  phases: [{ id, label, status,
    agents: [{ id, label, status, tokens, tools, durationMs, transcript, logNodeId }] }]
}
```

Attached to every normalized record as `swarmRun` (null for non-swarm
records). Non-swarm runs are unaffected; `logTree`, lifecycle, timeline, and
redacted export behavior are unchanged. Transcripts pass through
`redactSecretsFromText`.

## 8. UI rendering rule

The cockpit lives **inside** the existing Workspace Helper sidecar
(`HelperSidecar.jsx` → `activeView: "chat" | "swarm-list" | "swarm-detail" | "tool-output"`).
No new route, no new modal stack, no new visual grammar — `SwarmRunCockpit`
composes `dm-helper-toolcall` cards, `dm-run-console__tree-dot` dot strips,
`dm-btn-ghost` actions, `dm-field-label/-hint` labels, and the tool-call
JSON pre for transcripts. Running/Finished sections derive from real run
state (in-flight client request + source-record history). Missing telemetry
renders as `—`, never a fake number. `SidecarExpandView` widens the same
sidecar for long transcripts; Esc collapses back, close still closes.

## 9. Stop / cancel semantics

`sandbox-run` is synchronous and no durable cancel primitive exists. Stop in
the cockpit aborts the **active client request only** and is labeled as
such. The server-side run may still complete and persist its record — the
next history refresh shows the truthful outcome. Introducing a durable
cancel requires its own governed proposal and is out of scope for V1.

"Clear" in the Finished section hides cards from the local visible list
only. It never deletes source records or config rows.

## 10. Resume semantics

`swarm.run.resume` is a governed pointer: apply validates the target row
exists and returns a receipt + artifact target. It mutates nothing and
executes nothing. The user re-launches through the cockpit, which calls the
same `POST /api/workspace/sandbox-run`. A future durable resume (re-running
only failed subagents) must land as a new additive contract version.

## 11. No-direct-mutation rule

- The helper is propose-only; `swarm` intent output is proposals.
- Slash commands never patch config and never call sandbox-run: read-only
  commands switch sidecar views or seed prompt text; mutating commands seed
  governed proposal requests that still require explicit review + apply.
- The cockpit reads config rows and source records; its only writes go
  through `POST /api/workspace/sandbox-run` (an existing governed surface)
  and the existing config-refresh channel (`GET /api/workspace`).
- All workspace mutation flows through `helper/apply` →
  `writeWorkspaceConfig` with `validateWorkspaceConfig` as the gate.

## 12. Events (additive)

`packages/api-contract/src/events.ts` gains additive event types for the
optional NDJSON stream (not required for V1 cockpit correctness):

```
swarm_run_start · swarm_phase_start · swarm_agent_start
swarm_agent_complete · swarm_agent_error
swarm_phase_complete · swarm_run_complete
```

Existing event types are unchanged; consumers must ignore unknown types.
