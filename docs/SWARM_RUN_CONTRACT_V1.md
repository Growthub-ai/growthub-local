# Swarm Run Contract V1

Governed agent-swarm runs for the workspace cockpit — the Background-tasks
surface. A swarm run is just another governed object on the 0.14 creation
spine: **propose → receipt → orchestration-graph node**. No new authority
surface exists; the swarm spawner is one more proposal producer.

Status: frozen V1. Additive changes only.

## Authority invariants

- `POST /api/workspace/swarm-runs {action:"propose"}` never executes
  anything. It registers the run as `pending` and writes a
  `swarm.run.proposed` receipt.
- `{action:"start"}` is the explicit human approval step. With
  `remember: true` the workflow name is persisted to per-workflow approval
  memory and later proposals auto-approve — the approval receipt records
  `remembered: true` so the audit trail stays honest.
- Every transition leaves a receipt in the **same source-records sidecar**
  the workspace-helper apply receipts use
  (`growthub.source-records.json`, key `swarm:run:receipts`).
- `growthub.config.json` is never written by the swarm runtime.
- Agents dispatch **only** through the registered sandbox adapter registry
  (prompt-capable adapters), identical to every other sandbox primitive.
- Secrets never enter prompts; outputs are redacted before storage.

## Surfaces

| Route | Purpose |
| --- | --- |
| `GET /api/workspace/swarm-runs` | Running/Finished cockpit projection |
| `POST /api/workspace/swarm-runs` | `propose` · `start` · `clear` |
| `GET /api/workspace/swarm-runs/:id` | Full detail incl. agent outputs |
| `POST /api/workspace/swarm-runs/:id` | `stop` |
| `GET /api/workspace/swarm-runs/:id/events` | NDJSON event stream (replay-then-live) |
| `GET /api/workspace/swarm-workflows` | Saved workflows + loops + command registry + receipts |
| `POST /api/workspace/swarm-workflows` | `save` · `loop.start` · `loop.stop` · `forget-approval` |

## Graph node kinds

`swarm.run` → `swarm.phase` → `swarm.agent`, statuses
`pending | running | done | error | skipped`. Each agent node carries exactly
the cockpit columns: **label, tokens, toolUses, durationMs** — tokens are
estimated (chars/4 of prompt+output), toolUses is adapter-reported or null
(rendered blank, never 0).

## Execution modes

- **plan mode** — a declarative `SwarmPlan` (phases → agents) walked by the
  plain-JS runner (`lib/swarm-plan-runner.js`): `phase()` opens a group
  node, `agent()` appends a child and dispatches, agents inside a phase run
  concurrently, phases pipeline in order with prior output as untrusted
  context.
- **workflow mode** — a `SwarmWorkflowRef` to a sandbox-environment row
  holding an `agent-swarm-v1` orchestrationGraph, executed by the existing
  runtime; live transitions arrive through the additive
  `executionContext.onSwarmEvent` hook.

## NDJSON event stream

One JSON event per line; consumers MUST ignore unknown types. Vocabulary:
`run.proposed run.start run.stop_requested run.end phase.start phase.end
agent.start agent.end goal.evaluation.{start,end}
outcome_evaluation_{start,ongoing,end} heartbeat`.
The stream replays the run journal first, then goes live; `run.end` is the
final line. Typed in `@growthub/api-contract` (`swarm-run.ts`).

## Goal / Outcome / Loop primitives

- **Goal** — `goal.condition` (≤ 4096 chars) evaluated after the run by a
  single evaluator agent emitting `OUTCOME_SCORE: <0..1>`; score ≥ 0.5 ⇒
  satisfied. Unparseable scores degrade to `structural-fallback` —
  truthfully reported, never silently invented.
- **Outcome rubric** — markdown rubric + `maxIterations` (1–5) revision
  loop; grader events stream as `outcome_evaluation_*` with
  `satisfied | needs_revision | max_iterations_reached`.
- **Loop** — self-paced recurring runs: next delay = last duration × 4,
  clamped to [60s, 3600s]. Loops automate cadence, never authority — they
  require a remembered approval.
- **Saved workflows** — named plans persisted under
  `swarm:saved-workflows`; every saved workflow surfaces in the command
  registry as `/<name>`.

## Hardening caps

- ≤ 16 concurrent agents, ≤ 64 agents per run, ≤ 8 concurrent loops.
- Token budgets (`budget.maxTokens`) gate dispatch mid-run; budget burn is
  rendered on the run card.
- Resume: completed agents are journaled by `(phase, agent)` label; a new
  proposal with `resumeFromRunId` replays them instantly (`cached: true`).
- Run retention: last 50 runs in memory; agent outputs clamped to 8k chars.

## Cockpit UI (1:1 Background-tasks parity)

`app/components/swarm/` — `SwarmCockpit` (drawer host with
`docked | slideout | expanded` view modes, Esc collapses a level),
`SwarmRunCard`, `SwarmPhaseGroup`, `SwarmDotStrip`, `SwarmAgentRow`,
`SwarmAgentCard`, `SwarmRunChip`, `SwarmStatusLine`, `CommandKPalette`
(Cmd-K + slash, one registry), `useSwarmRunStream` (NDJSON → reducer with
reconnect; dots advance on `agent.start`/`agent.end`).
