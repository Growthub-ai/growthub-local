---
name: growthub-fable5-closed-loop
description: Run the end-to-end closed-loop golden path across the four governed command surfaces — /ceo bootstrap, /swarm design+prove, /schedule recurrence, /ceo review — closing every cycle through workspace:agent-outcomes receipts and investing repairPlan/memory lessons into the next cycle. Use when the user asks to build out an end-to-end agent loop, wire a closed human-agent feedback loop, operate the schedule/ceo/loop/swarm commands together, or apply the Fable 5 reasoning patterns to a governed workspace.
triggers:
  - "run the closed loop golden path"
  - "build an end-to-end agent loop with schedule/ceo/swarm"
  - "wire a closed feedback loop between me and the agents"
  - "apply the Fable 5 patterns to this workspace"
  - "set up a governed recurring loop that improves itself"
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - "Every mutation went through helper/apply or a governed server route — no direct PATCH, no third lane"
    - "Every cycle step has a matching receipt in workspace:agent-outcomes (governed-proposal → helper-apply → sandbox-run/execution-proof → schedule kinds)"
    - "Blocked outcomes were answered with the receipt's repairPlan/nextActions, not a blind retry"
    - "At least one lesson was written to session memory before ending the cycle"
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
---

# Fable 5 Closed-Loop Golden Path — operator skill

One loop, four stations, one reward stream. Architecture contract:
[`docs/FABLE5_CLOSED_LOOP_GOLDEN_PATH_V1.md`](../../../docs/FABLE5_CLOSED_LOOP_GOLDEN_PATH_V1.md).
Mutation boundary card: the `governed-workspace-mutation` sub-skill under
`oss-investigative-architecture` (PATCH allowlist
`[dashboards, widgetTypes, canvas, dataModel]`; executor
`POST /api/workspace/sandbox-run` only).

Resolve the CLI per the standard order: `growthub …` →
`node "$REPO/cli/dist/index.js" …` → `bash "$REPO/scripts/demo-cli.sh" cli -- …`.
The workspace app base URL comes from `scripts/runtime-control.sh url` (repo
lane) or the exported workspace's own server (workspace lane).

## The loop (memorize this shape)

```
CUE      read the cockpit view-model (attention, nextAction) — /ceo, /schedule
ROUTINE  propose (helper/query) → human approves (helper/apply) → prove (sandbox-run)
REWARD   read workspace:agent-outcomes — outcomeStatus, OUTCOME_SCORE, repairPlan
INVEST   apply repairPlan to the next proposal; write the lesson to session memory
         → re-derive → next cue
```

Reward is honest by contract: `blocked` and `failed` receipts are corrective
signals carrying `nextActions`/`repairPlan` — never suppress, never retry the
same proposal unchanged.

## End-to-end sequence

1. **Bootstrap cue — `/ceo`.** Read the bootstrap checklist
   (`deriveCeoBootstrapState`; 8 evidence-gated steps). Work the checklist;
   never mark complete by assertion — `ceo.bootstrap.complete` is refused
   server-side without config-provable prerequisites.
2. **Design — `/swarm`.** `POST /api/workspace/helper/query` with
   `intent:"swarm"` (propose-only). Structure the team per the swarm run
   contract (`docs/SWARM_RUN_CONTRACT_V1.md`): 1–24 agents, allowed adapters
   only, no credential-shaped fields, intent-only payload. Include a
   **fresh-context verifier agent/phase** — verification by a clean-context
   agent outperforms self-critique.
3. **Approve — human station.** Hand the proposal to `helper/apply`. Do not
   route around a rejected proposal; read the 422 `repairPlan` and re-propose.
4. **Prove — `sandbox-run`.** `POST /api/workspace/sandbox-run
   {objectId:"swarm-workflows", name:<row Name>}`. Draft → tested with an
   `execution-proof` receipt before anything recurs.
5. **Recur — `/schedule`.** Only a proven row gets a schedule:
   `POST /api/workspace/add-ons/[providerId]/schedule` (install), then verify
   readiness. Recurrence runs arrive through the signed destination and write
   callback proof onto the owning row.
6. **Review & invest — `/ceo` operational.** Read fleet reports +
   `governance.blockedAttempts` + `GET /api/workspace/agent-outcomes`.
   Convert every `blocked`/`failed` into its `repairPlan` follow-up; write one
   lesson per cycle to `.growthub-fork/project.md`; then and only then
   complete bootstrap / advance the goal ladder.
7. **Re-derive.** Cockpits recompute from config + receipts. The next cue is
   whatever `attention` now surfaces. Repeat.

## Fable 5 operating disciplines at each station

- **Goal anchoring (`/ceo`):** the checklist/fleet `nextAction` ladder is the
  goal structure — plans may change, checklist evidence gates may not.
- **Effort scaling:** run recurrence and routine proofs at low/medium effort;
  reserve xhigh for swarm plan/synthesize phases and novel failures. Agent
  count (1–24) is the parallel-effort dial; don't max it reflexively.
- **Delegation judgment:** swarm what shards cleanly with self-contained
  taskPrompts; keep single-fact reads and final judgment inline.
- **Grounded synthesis:** before proposing mutations, consult the
  intelligence layer (`GET /api/workspace/metadata-graph`, blast-radius
  derivers; CLI: `growthub plan`) so proposals cite real dependents.
- **Safety routing:** treat policy 422s and classifier-style reroutes as
  structured routing, not failure — surface them, apply the repair, continue.
- **Honest completion:** a station is done when its receipt exists with the
  expected `outcomeStatus`, not when the call returned 200.

## Anti-patterns

- Executing anything from a cockpit or slash command directly — commands seed
  proposals; only `sandbox-run`/governed routes execute.
- A side store of scores/streaks — the receipt stream is the only reward
  substrate.
- Scheduling an unproven row, or resuming a paused schedule without re-running
  readiness.
- Marking `/ceo` bootstrap complete without config-provable evidence.
- Retrying a blocked proposal unchanged, or hiding `blocked` receipts from
  the user's review.
