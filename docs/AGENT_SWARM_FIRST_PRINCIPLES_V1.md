# Agent Swarm First Principles V1

Code-grounded derivation of the `0.14.1` governed agent swarm. Every claim below is traceable to a file in this repository; where popular narrative exceeds the code, the gap is stated explicitly. Companion docs: [`SWARM_RUN_CONTRACT_V1.md`](./SWARM_RUN_CONTRACT_V1.md) (normative contract), [`GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md`](./GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md) (value map), [`GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md) (release snapshot).

All workspace-kit paths below are relative to `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`.

---

## First principles (axioms the code enforces)

1. **A swarm is a row, not a runtime.** The canonical artifact is a `sandbox-environment` row under the `swarm-workflows` object whose `orchestrationConfig` serializes an `agent-swarm-v1` graph (`lib/workspace-swarm-proposal.js`, `buildSandboxRowFromSwarmProposal`). There is no swarm daemon, queue, or scheduler.
2. **No mutation without a reviewed proposal.** Intent (chat or `/swarm`) becomes a `swarm.run.propose` / `swarm.workflow.save` / `swarm.run.resume` proposal with `affectedField: "dataModel"` — the existing PATCH allowlist (`dashboards | widgetTypes | canvas | dataModel`) is the hard ceiling; no new top-level field was added.
3. **Apply writes state; it never executes.** `app/api/workspace/helper/apply/route.js` upserts the row (de-duped by `Name`, run-history stamps preserved) and returns a receipt. The row is inert until `POST /api/workspace/sandbox-run`.
4. **Execution reuses the one executor.** `lib/orchestration-agent-swarm.js` runs inside the pre-existing sandbox-run lane via registered adapters. No new route, no new runtime.
5. **Telemetry is truthful or absent.** Tokens/tools/time come only from adapter-reported metadata or a parsable agent-host footer; unreported values are `null` and render as `—`, never `0` or an estimate (`lib/orchestration-run-console.js`, pinned by `scripts/unit-orchestration-agent-swarm-events.test.mjs`).
6. **Credentials never enter the loop.** Proposal payloads are regex-scanned and rejected on credential-shaped keys; rows carry env-ref slugs only; transcripts pass through secret redaction.
7. **Lineage is structural.** Graph nodes carry `sandboxRecordRef { objectId, rowName, nodeId }`, so every canvas edit, run record, and source record resolves back to its owning row and node.

## The closed loop, end to end

```
intent (/swarm or chat)
  → workspace-swarm-proposal.js      validate: name + objective, 1–24 agents each with
                                     role + taskPrompt, adapter ∈ {local-agent-host,
                                     local-intelligence}, credential scan, model-authored
                                     graphs honored ONLY if they independently validate
  → helper/apply                     eligibility gate (helper widget live + prompt-capable
                                     adapter), upsert sandbox-environment row, receipt
  → POST /api/workspace/sandbox-run  NDJSON stream of additive event types
  → orchestration-agent-swarm.js     Plan (thinAdapter orchestrator)
                                     → Dispatch (ai-agent subagents, worker pool bounded
                                       by swarm.maxConcurrency)
                                     → Synthesize (tool-result node, parses OUTCOME_SCORE)
  → reward telemetry                 weighted parallel/finish/outcome
                                     (defaults 0.25 / 0.35 / 0.40); kind = evaluated-v1
                                     when OUTCOME_SCORE parses, structural-fallback /
                                     structural-v1 otherwise
  → persistence                      source records (sandbox:<objectId>:<slug>), row stamps
                                     (status, lastTested, lastRunId, lastSourceId,
                                     lastResponse), metadata graph
  → observability                    deriveSwarmRunProjection (pure) → SwarmRunCockpit.jsx
                                     (Background Tasks) + Workflow Canvas (editable graph)
  → next proposal                    edits re-enter the same loop
```

The loop is self-referential in the Gödel-agent sense only at the artifact level: an agent can read its own run evidence and propose graph changes, but every change re-enters propose → review → apply. There is no self-modification path that bypasses the gate.

## Reused vs. newly created

| Reused (unchanged) | Newly created (scoped) |
|---|---|
| `sandbox-environment` object schema | Proposal types `swarm.run.propose` / `swarm.workflow.save` / `swarm.run.resume` |
| `POST /api/workspace/sandbox-run` + adapter registry | `executionMode: "agent-swarm-v1"` (repurposed unused field) |
| Node types `thinAdapter`, `ai-agent`, `tool-result` | Graph root `swarm { maxConcurrency, rewardWeights, outcomeCriteria }` |
| PATCH allowlist + helper propose/review/apply | Plan/Dispatch/Synthesize phase pipeline + `OUTCOME_SCORE` parsing |
| Source-record persistence + receipts | Reward telemetry computation (parallel/finish/outcome) |
| HelperSidecar composition, run-console projection pattern | `SwarmRunCockpit.jsx`, helper slash-command registry, 7 additive NDJSON event types |

## Truth-grounding: where narrative exceeds code

- **Agent count:** the validator caps swarms at **24 agents** (`SWARM_MAX_AGENTS`, `lib/workspace-swarm-proposal.js`). Claims of hundreds of simultaneous governed agents describe a possible future, not this release.
- **Adapters:** exactly two prompt-capable adapters are allowed (`local-agent-host`, `local-intelligence`). Code-execution adapters are rejected at proposal time.
- **PARL / trainable orchestrator:** the reward shaping (parallel/finish/outcome) is *inspired by* parallel-agent RL reward design, but nothing here trains a model. Rewards are recorded telemetry, not gradients.
- **Concurrency:** `maxConcurrency` defaults to the subagent count and bounds a local worker pool; this is process-level parallelism on one host, not distributed orchestration.
- **Cancellation:** the cockpit Stop button aborts the client request only; there is no durable cancel primitive.

## Reproduction lane (temp export)

The only sanctioned way to materialize a disposable workspace for swarm experimentation is the agnostic seed export — the former swarm-specific `smoke-export-swarm-workspace.mjs` was deliberately deleted:

```bash
node scripts/export-seed-workspace.mjs --no-dev   # export → seed → validate
```

This exports `growthub-custom-workspace-starter-v1` to `${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}/feature-work-<ts>/`, seeds a super-admin-ready state (activation 5/5, API-registry cockpit score 100), and validates against the exported kit's own `validateWorkspaceConfig`. Swarm rows are then created inside that export through the governed loop above — never by hand-editing seed files mid-session. Contract: `scripts/export-seed-workspace.md`.

## Behaviors pinned by tests

- `scripts/unit-swarm-proposal.test.mjs` — validation gates, credential rejection, adapter gating, invalid model-authored graphs discarded, row normalization.
- `scripts/unit-orchestration-agent-swarm.test.mjs` — graph detection/validation, default scaffold uses only existing node types, end-to-end phase pipeline, reward upgrade to `evaluated-v1` on parsed `OUTCOME_SCORE`.
- `scripts/unit-orchestration-agent-swarm-events.test.mjs` — additive event contract, null-not-estimated telemetry.
- `scripts/unit-swarm-run-console.test.mjs` — cockpit composes only existing DUI primitives; truthful rendering.
