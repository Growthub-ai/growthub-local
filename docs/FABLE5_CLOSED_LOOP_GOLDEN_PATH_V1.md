# Fable 5 Closed-Loop Golden Path — V1

End-to-end implementation golden path that mirrors the four governed command
surfaces — **`/schedule`**, **`/ceo`**, **`/loop`**, **`/swarm`** — and infuses
the eight Fable 5 reasoning patterns (see
[`CLAUDE_FABLE_5_REASONING_ATLAS_V1.md`](./CLAUDE_FABLE_5_REASONING_ATLAS_V1.md))
as a **closed behavioral loop**: cue → routine → reward → investment, shared by
the human and the agent over the same receipts substrate.

Produced with the `oss-investigative-architecture` skill: source-truth recon
first, additive extension second. Every "Already Exists" claim cites a real
path; everything new is labeled **Proposed**.

---

## 0. TL;DR — the loop that already exists, and the one gap

The four commands are not four features. They are four stations of **one
closed loop** over two mutation lanes and one reward stream:

```
            CUE                         ROUTINE                        REWARD
  cockpit deriver view-model   governed propose → apply → run   AgentOutcomeReceipt
  (attention, nextAction)      (helper/query → helper/apply     (outcomeStatus,
  /ceo · /schedule cockpits     → sandbox-run | scheduler        OUTCOME_SCORE,
                                destination)                     repairPlan)
            ▲                                                        │
            │                       INVESTMENT                       │
            └── re-derive ◄── memory/skill/config updates ◄──────────┘
                              (.growthub-fork/project.md, repairPlan
                               → next proposal, ceo.bootstrap evidence)
```

- **Already Exists:** the full loop for `/schedule`, `/ceo`, `/swarm`, and the
  receipt substrate (`workspace:agent-outcomes`) that closes them.
- **Partially Exists:** `/loop` — a thin proposal-seeder with no `intent`, no
  proposal type, no deriver, no record shape.
- **Proposed:** `/loop` becomes the composition of the other three (a loop =
  swarm workflow × schedule binding × receipt trend), plus a reward-trend
  deriver that makes the dopamine signal first-class. No new runtime, no new
  persistence, no new mutation lane.

---

## 1. Current State (source-truth, file-cited)

All kit paths below are relative to
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`
(abbreviated `KIT/`).

### 1.1 The two mutation lanes (frozen)

| Lane | Call | Gate | Citation |
| --- | --- | --- | --- |
| Config | `PATCH /api/workspace` (direct) or `POST /api/workspace/helper/apply` (governed) | allowlist `["dashboards","widgetTypes","canvas","dataModel"]` | `KIT/lib/workspace-patch-policy.js:35` |
| Execution | `POST /api/workspace/sandbox-run` `{objectId,name}` | the ONLY executor | `KIT/app/api/workspace/sandbox-run/route.js:800` |

### 1.2 The reward substrate (the "dopamine" stream)

- **Receipt contract:** `AgentOutcomeReceipt` —
  `packages/api-contract/src/workspace-outcome.ts:75-136`; statuses
  `blocked|drafted|tested|published|failed|verified` (:45-52); four lanes
  (:57-61); open unions on `kind`/`lane` for additive extension (:78-79).
- **Writer:** `appendOutcomeReceipt` — `KIT/lib/workspace-outcome-receipts.js:113`,
  called from 26 route files; secret-redacted, hash-chained
  (`seq` + `prevReceiptSha256`, :125-129), rolling window 200 (:33).
- **Reader:** `GET /api/workspace/agent-outcomes` —
  `KIT/app/api/workspace/agent-outcomes/route.js:57`, returns receipts +
  `WorkspaceGovernanceSummary` (`workspace-outcome.ts:146-161`).
- **Repair (the corrective reward):** `REPAIR_PLANS` violation→alternative map —
  `KIT/lib/workspace-patch-policy.js:362-375`; surfaced through preflight 422s
  and receipt `nextActions[]`.
- **Blessed sequence:** `WORKSPACE_AGENT_LOOP_V1`
  (`understand → preflight → draft → prove → publish → receipt`) —
  `workspace-outcome.ts:181-188`.
- **Reward framing is already canonical:** the capability-binding loop doc
  names the cockpit view-model the "agent condition packet" and
  `outcomeStatus` the reward signal —
  `docs/GOVERNED_CAPABILITY_BINDING_LOOP_V1.md:55-70`.

### 1.3 `/swarm` — the act station (Already Exists)

Chain per `docs/SWARM_RUN_CONTRACT_V1.md:11-19`: `helper/query (intent:"swarm")
→ helper/apply → sandbox-run → run record → deriveSwarmRunProjection →
SwarmRunCockpit`. Key contracts: `validateSwarmRunProposal`
(`KIT/lib/workspace-swarm-proposal.js:235-300`, 1–24 agents, adapter and
credential gates), server-rebuilt graphs when model JSON fails validation
(:372-386), reward parse `OUTCOME_SCORE: <0..1>` in synthesis
(`KIT/lib/orchestration-agent-swarm.js:64`), rows in the `swarm-workflows`
object, run records under `sandbox:<objectId>:<slug>` capped at 50.

### 1.4 `/schedule` — the recur station (Already Exists)

Full governed recurrence loop (PR #258): cockpit
(`KIT/lib/schedule-cockpit-console.js:140`), provider-agnostic
`SCHEDULER_ADAPTERS` registry (`KIT/lib/workspace-add-on-scheduler.js:481`),
deterministic `deriveScheduleId` (:56-65), signed QStash destination
(`KIT/app/api/workspace/workflows/[providerId]/route.js:119`) with
triple-binding enforcement (payload ↔ row ↔ trigger node, :189-204), and
callback-written run proof — every lifecycle step emitting
`server-authoritative` receipts.

### 1.5 `/ceo` — the review/invest station (Already Exists)

Dual-mode cockpit: `deriveCeoBootstrapState`
(`KIT/lib/ceo-bootstrap-console.js:105`) with an 8-step evidence-gated
checklist whose completion (`ceo.bootstrap.complete` via helper/apply,
`KIT/app/api/workspace/helper/apply/route.js:328-343`) **refuses unless the
config proves prerequisites** (:285-297) — done means evidence, not a click.
Operational mode: `deriveCeoCockpit` (`KIT/lib/ceo-cockpit-console.js:113`)
projects fleet state + `governance.blockedAttempts` from receipts, every
report carrying a `nextAction` hand-off (never executing itself).

### 1.6 `/loop` — the gap (Partially Exists)

`HELPER_COMMANDS` entry only
(`KIT/app/data-model/components/helper-commands.js:27-34`): a prompt-template
seeder with `mutates:true` but **no `intent`, no proposal type, no deriver, no
record shape**. The load-bearing "loops" today are doc disciplines
(`WORKSPACE_AGENT_LOOP_V1`, `docs/GOVERNED_CAPABILITY_BINDING_LOOP_V1.md`,
`docs/AGENTIC_PRODUCT_PR_REVIEW_LOOP.md`) — real, but not composed into an
executable governed surface.

---

## 2. Missing Extension

| Gap | Category | Evidence of absence |
| --- | --- | --- |
| G1. `/loop` governed intent + proposal type (`loop.run.propose`) | Missing | `helper-commands.js:27-34` has no `intent`; no `loop.*` type in `workspace-swarm-proposal.js:34-42` or `helper/apply/route.js` |
| G2. Loop cockpit deriver (`deriveLoopCockpit`) joining swarm row × schedule binding × receipt trend | Missing | no `loop-*-console.js` under `KIT/lib/`; `/loop` has no view in `HelperSidecar.jsx` |
| G3. Reward-trend deriver (`deriveOutcomeTrend`: per-loop score series, streaks, blocked-rate deltas) | Missing | receipts are consumed only as counts (`blockedAttempts`) by existing cockpits |
| G4. Operator primitive teaching agents the end-to-end golden path | Missing → **shipped by this change** | `.claude/skills/` had no closed-loop skill (verified by catalog scan) |
| G5. Golden-path contract doc | Missing → **this document** | — |
| G6. Fleet-wide readiness/cost rollups on `/ceo` | Partially Exists | per-row primitives exist (`deriveSwarmWorkflowExecutionEligibility`); rollups are roadmap items `docs/CEO_PRIMITIVE_COCKPIT_ROADMAP_V1.md:77-87` |

---

## 3. Strategic Direction — the eight patterns, stationed

The closed dopamine loop is not a metaphor bolted on: it is the behavioral
reading of machinery the repo already enforces. **Cue** = cockpit
`attention`/`nextAction` (same view-model for human and agent). **Routine** =
the governed propose → apply → run chain. **Reward** = receipt
`outcomeStatus` + `OUTCOME_SCORE` + governance-summary deltas (variable, honest,
tamper-evident). **Investment** = repairPlan-driven next proposals, memory
writes, and evidence-gated CEO completion — each cycle making the next one
cheaper. Human authority sits at exactly two points (apply approval, CEO
review); agent autonomy owns everything between them.

Each Fable 5 pattern lands on a specific station:

| # | Fable 5 pattern | Station | Concrete binding |
| --- | --- | --- | --- |
| 1 | Goal-directed long-horizon execution | `/ceo` | Bootstrap checklist + fleet `nextAction` ladder are goal/success-criteria structures, not scripts; completion is config-provable (`ceo-bootstrap-console.js:285-297`) |
| 2 | Proactive self-verification & belief updating | routine | `preflight → draft → prove → publish` is a built-in harness; a failed prove yields a `repairPlan`, not a retry of the same belief |
| 3 | Effort-scaled reasoning | `/swarm` + `/schedule` | Route routine recurrence to `/schedule` at low effort; reserve xhigh-effort Fable 5 calls for swarm plan/synthesize phases; agent count (1–24) is the parallel-effort dial |
| 4 | Persistent memory & compounding loops | investment | `.growthub-fork/project.md` + `trace.jsonl` (skill v1.2 `sessionMemory`/`selfEval`), receipt window as cross-session evidence; lessons update skills mid-task |
| 5 | Subagent orchestration & delegation judgment | `/swarm` | `agent-swarm-v1` plan → dispatch → synthesize; add a fresh-context **verifier phase** (verifier agents outperform self-critique); inline work stays out of the swarm |
| 6 | Grounded long-context synthesis | intelligence layer | `metadata-graph` + `deriveBlastRadius` (`KIT/lib/workspace-metadata-impact.js:82`) before any mutation; receipts link (`sourceId`/`runId`), never duplicate |
| 7 | Safety-integrated decision routing | all lanes | Policy verdicts return **structured refusals** (422 + `repairPlan` + `safeNextStep`) — the workspace analog of Fable 5's classifier→Opus 4.8 fallback: routed, surfaced, never silent |
| 8 | First-principles decomposition | `/swarm` validator | Server rebuilds the default graph when a hand-authored one fails validation (`workspace-swarm-proposal.js:372-386`) — constraint-first construction as an enforced default |

### The end-to-end golden path (operator sequence)

| Step | Command | Call | Receipt closes as |
| --- | --- | --- | --- |
| 1. Bootstrap | `/ceo` | walk the 8-step checklist | evidence refs accumulate |
| 2. Design | `/swarm` | `helper/query` `intent:"swarm"` (propose-only) | `governed-proposal` |
| 3. Approve (human) | — | `helper/apply` | `helper-apply` |
| 4. Prove | — | `sandbox-run` draft → tested | `sandbox-run` / `execution-proof` |
| 5. Recur | `/schedule` | install schedule on the proven row | `workspace-add-on-schedule` |
| 6. Autonomous runs | — | signed destination + callback proof | `workspace-scheduled-run(-callback)` |
| 7. Review & invest | `/ceo` | read cockpit + receipts; apply `repairPlan`; write memory; complete bootstrap | `ceo.bootstrap.complete` |
| 8. Re-derive | all | cockpits recompute from config + receipts | next cue |

This sequence is executable **today** with zero runtime changes — that is what
the shipped skill (`.claude/skills/growthub-fable5-closed-loop/`) teaches.

---

## 4. Phased Implementation

Phases follow architectural dependency order, each independently valuable.

- **Phase A — Operator primitives (scaffolding zone; this change).**
  This contract doc + the `growthub-fable5-closed-loop` skill + catalog row.
  Makes the golden path executable-by-discipline over existing surfaces.
- **Phase B — `/loop` governed intent (core-product PR; Proposed).**
  Give `/loop` an `intent:"loop"`; add `loop.run.propose` normalizing to
  *existing* artifacts — a swarm workflow row plus scheduler-binding intent —
  through the existing `dataModel` lane. One proposal, two existing artifacts,
  no new persistence.
- **Phase C — Loop & reward derivers (core-product PR; Proposed).**
  Pure `deriveLoopCockpit` (join: swarm row × `scheduleId` binding × receipt
  slice) and `deriveOutcomeTrend` (per-loop `OUTCOME_SCORE` series, publish
  streaks, blocked-rate delta). The dopamine signal becomes a first-class,
  re-derivable projection — for the human cockpit and the agent condition
  packet alike.
- **Phase D — CEO rollups (roadmap alignment; Proposed).**
  Feed loop trend into `deriveCeoCockpit` reports per the existing roadmap
  phases (`docs/CEO_PRIMITIVE_COCKPIT_ROADMAP_V1.md:170-233`) — additive
  fields only, contract version stays `1`.

## 5. Exact File Edits

**Phase A (this change):**

| File | Action | Purpose / zone |
| --- | --- | --- |
| `docs/FABLE5_CLOSED_LOOP_GOLDEN_PATH_V1.md` | add | this contract (scaffolding) |
| `.claude/skills/growthub-fable5-closed-loop/SKILL.md` | add | operator primitive (scaffolding; v1.2 frontmatter) |
| `.claude/skills/README.md` | edit (additive row + when-to-use bullet) | catalog integrity |

**Phase B/C (Proposed — core-product; lockstep version bump + six gates; dist rebuild flagged for Phase-B maintainer lane):**

| File | Action | Purpose |
| --- | --- | --- |
| `KIT/app/data-model/components/helper-commands.js` | edit `/loop` entry: add `intent:"loop"` | governed seed parity with `/swarm` (:44-51 pattern) |
| `KIT/lib/workspace-loop-proposal.js` | add | `normalizeLoopProposal` → swarm-row + schedule-intent (reuses `workspace-swarm-proposal.js` + `workspace-add-on-scheduler.js` builders) |
| `KIT/app/api/workspace/helper/apply/route.js` | edit | route `loop.run.propose` through the existing swarm lane (:163-210 pattern) |
| `KIT/lib/loop-cockpit-console.js` | add | pure `deriveLoopCockpit` (no fetch/React/fs — deriver contract per `ceo-cockpit-console.js:2-13`) |
| `KIT/lib/workspace-outcome-trend.js` | add | pure `deriveOutcomeTrend` over `readOutcomeReceipts` output |
| `KIT/app/data-model/components/HelperSidecar.jsx` | edit | mount `activeView:"loop"` (mirror `:987-990` pattern) |
| `packages/api-contract/src/workspace-outcome.ts` | edit (optional fields only) | `loopRef?` on receipts if needed — open-union/additive, version stays `1` |

## 6. Runtime Implications

None in Phase A (docs + skills only). Phases B–D add **zero** new mutation
lanes, executors, or persistence: `/loop` composes the two canonical calls;
derivers are pure; receipts stay the single reward stream; execution authority
remains deterministic (model proposes → policy validates → deterministic
executor dispatches — the repo's own tool-call safety rule).

## 7. Validation Requirements

- Phase A: `growthub skills validate` (or
  `bash scripts/demo-cli.sh cli -- skills validate`) green;
  `bash scripts/pr-ready.sh` green (docs/scaffolding, no bump).
- Phase B/C: lockstep version bump; `bash scripts/agent-dist-verify.sh
  pre-push` (six gates); unit tests for the new pure libs
  (`workspace-loop-proposal`, `loop-cockpit-console`,
  `workspace-outcome-trend`) mirroring `__tests__` conventions; the canonical
  browser-proof protocol (`docs/BROWSER_PROOF_PROTOCOL_V1.md`, on PR #276's
  merge) for the cockpit; honest-failure 422 checks on the loop proposal.

## 8. Anti-Patterns (must not happen)

- **No third mutation lane.** `/loop` must never execute or PATCH directly —
  same registry governance as every helper command
  (`helper-commands.js:106-127`).
- **No parallel receipt/reward store.** Trend derivers read
  `workspace:agent-outcomes`; never a side JSON of "scores."
- **No new PATCH allowlist field.** Loop state rides `dataModel` rows exactly
  as swarm does (`SWARM_RUN_CONTRACT_V1.md:29-33` precedent).
- **No engagement-hacking the reward.** The dopamine loop's integrity is that
  reward = honest `outcomeStatus`; a deriver that inflates streaks or hides
  `blocked` receipts breaks both the human habit loop and the agent's
  learning signal. `blocked` is a *corrective* reward with a `repairPlan`,
  never a suppressed one.
- **No dist edits.** Phase B/C flag "dist rebuild required in Phase B
  (maintainer lane)" per `AGENTS.md`.
- **No skill duplicating runbooks.** The skill links to this doc and the
  contract docs; it never restates route internals that would drift.
