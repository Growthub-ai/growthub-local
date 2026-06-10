# Governed Swarm Release Snapshot V1

Agent Swarm Cockpit Extension — post-0.14 governed creation. This snapshot
freezes what shipped on branch `feat/agent-swarm-cockpit-v1`.

## What shipped

**Spine (Phase A)** — a swarm run is a governed object:
`propose → receipt → run/phase/agent graph nodes → NDJSON stream`.

- `apps/workspace/lib/swarm-run-events.js` — run store, graph transitions,
  event journal, projections, caps, budgets, resume journal.
- `apps/workspace/lib/swarm-receipts.js` — proposed/approved/completed
  receipts in the workspace-helper receipt sidecar (result hash included).
- `apps/workspace/lib/swarm-plan-runner.js` — plain-JS plan runner
  (phase/agent/parallel/pipeline) dispatching through the sandbox adapter
  registry only.
- `apps/workspace/lib/swarm-run-launcher.js` — plan mode + workflow mode
  (agent-swarm-v1 graphs via the additive `onSwarmEvent` hook).
- Routes: `swarm-runs` (propose/start/clear, detail, stop, NDJSON events),
  `swarm-workflows` (save, loops, approval memory, command registry).
- Contract: `packages/api-contract/src/swarm-run.ts`
  (`SWARM_RUN_CONTRACT_VERSION = 1`), `docs/SWARM_RUN_CONTRACT_V1.md`.

**Cockpit UI (Phases B–C)** — 1:1 Background-tasks parity:
Running/Finished + Clear, run cards (dot · name · stop ▢ · kind ·
elapsed · agents · tokens · description strip), collapsible phase groups
with per-agent dot strips, Agent/Tokens/Tools/Time tables (blank — never
0 — for unreported values), drill-in output in a tool-output frame,
compact inline run chip, status line, `docked | slideout | expanded`
view modes with Esc/Enter/arrow keyboard nav.

**Command surfaces (Phase D)** — one registry feeding the slash menu and
the Cmd-K palette; mutating commands resolve to governed proposals, reads
and navigation resolve directly; saved workflows appear as `/<name>`.

**Primitives (Phase E)** — goal condition + evaluator (OUTCOME_SCORE,
structural-fallback honesty), outcome rubric + max-iterations revision
loop with `outcome_evaluation_*` stream events, self-paced loops
(duration×4, 60s–3600s, approval-memory gated), saved workflows.

**Hardening (Phase F)** — ≤16 concurrent agents, ≤64 agents/run, token
budgets with rendered burn, resume via `resumeFromRunId` journal replay,
per-workflow approval memory with honest `remembered: true` receipts.

## Authority boundary (unchanged)

The AWaC boundary from `GOVERNED_WORKSPACE_TOPOLOGY_V1.md` holds: the swarm
runtime never writes `growthub.config.json`; receipts and saved state live
in the source-records sidecar; agents dispatch only through the registered
sandbox adapter registry; secrets never enter prompts or stored outputs.

## Verification

- `node --check` across every new/edited JS module — clean.
- Run-store unit exercise (propose → phases → agents → finish → projection
  + resume journal + budget gate) — see snapshot notes in the PR.
