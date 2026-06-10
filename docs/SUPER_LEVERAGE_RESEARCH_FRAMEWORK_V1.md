# Super-Leverage Research Framework V1 — 4–6 Month Capability Program

This document expands the behavioral-loop research thread
(`docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`, the governed creation cockpit,
and the Distillation Pipeline V1 helpers) into an executable research program
for the next 4–6 months. It is grounded only in mechanisms that exist and were
verified on this branch — every claim carries a file anchor.

## 1. Scope and honest definition

The target of this program is **domain-bounded super-leverage**, not general
ASI:

> A governed agentic operating system in which one operator plus an agent
> swarm reliably produces output that previously required a team — across
> software delivery, workspace orchestration, creative pipelines, and GTM
> automation — with every action receipted, every reward collateralized by
> artifact progress, and the assistant getting cheaper and more personal
> through its own usage.

What 4–6 months can plausibly deliver, given the verified substrate below:
agents that feel superhuman *inside this contract* — because the contract
removes the failure modes (hallucinated state, unverifiable progress,
ungoverned mutation) that cap everyone else's agent reliability.

What it will not deliver: frontier-scale general capability. The walls are
compute (local fine-tunes vs. frontier training), data breadth (high-signal
but narrow traces), and algorithmic uncertainty. This framework treats those
walls as fixed and optimizes the loop that is actually ours to tighten.

## 2. Verified substrate (what already exists)

Every mechanism below was read and verified in code on this branch.

| Mechanism | Anchor | Verified behavior |
| --- | --- | --- |
| Pure activation deriver | `apps/workspace/lib/workspace-activation.js` (`deriveWorkspaceActivationState`) | Checklist derived per render from config + sidecar + metadata graph; never persisted; secret-safe |
| Lens registry + global next action | same file (`WORKSPACE_LENS_REGISTRY`, `deriveWorkspaceState`) | 6 lenses share `scoreLensSteps`; one workspace-wide `nextAction` falls back primary → first incomplete secondary |
| Liminal walkthrough predicate | same file (`deriveLensWalkthroughState`) | `show: activationComplete && !hasActivity && !dismissed` — the activation-to-habit handoff as a pure function; dismissal lives in the governed `workspace-ui-cache` row, not browser state |
| Contribution graph | same file (`deriveWorkspaceContributions`) | GitHub-style daily grid from run/fetch/test timestamps; counts and dates only |
| Swarm condition packet | same file (`deriveSwarmConditionPacket`) + `GET /api/workspace/swarm-condition` | goal / currentState / blockedStep / prerequisite / availableTools / expectedEvidence — same derived state the human panel renders |
| Record-altitude cockpit | `apps/workspace/lib/api-registry-creation-flow.js` (`deriveApiRegistryCreationState`) | register → auth → test → (resolver) → sandbox tool → data source → refresh; auth resolved only from `runtime.configuredEnvRefs` slugs |
| Response-shape introspection | `apps/workspace/lib/api-response-profile.js` | Record-array detection, pagination detection, resolver recommendation (none/template/custom) |
| Distillation Phase 1 (harvest) | `helpers/harvest-cursor-traces.mjs` | Raw instruction/output pairs from real agent sessions |
| Distillation Phase 2 (grade) | `helpers/grade-raw-pairs.mjs` | Routes every pair through the live `critic-grader` sandbox row (local-intelligence / gemma3:4b) via `POST /api/workspace/sandbox-run` — never bypasses the workspace API; `mergedToMain === true` floors the score at 4 |
| Distillation Phase 3 (export) | `helpers/export-training-traces.mjs` | `qualityScore >= --min-score && exported == "false"` → Unsloth-ready `{instruction, input, output}` JSONL; instruction encodes the contract ("Respect AWaC V2 invariants and the PATCH allowlist"); `exported = "true"` PATCHed back through the governed boundary |
| The thesis, self-documented | `docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md` | "This is the dopamine loop without hidden state: each useful action creates evidence, and evidence makes the next visible state better." |

All paths above are relative to
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/`.

## 3. The compounding loop, formalized

The flywheel has four edges. Each edge is measurable, which is what makes
this a research program rather than a narrative:

```
   (a) action → trace        helper applies, sandbox runs, governed PATCHes
   (b) trace → graded data   critic-grader score + mergedToMain ground truth
   (c) graded data → model   ≥ threshold rows → Unsloth JSONL → fine-tune
   (d) model → friction↓     cheaper/better proposals → more ambitious actions → (a)
```

The loop compounds iff every edge has positive gain AND the grading edge (b)
is not Goodharted. Edge (b) is currently the weakest link: a 4B local model
grades the traces, and `mergedToMain` is the only external ground-truth
signal. The single highest-leverage research investment in the window is
hardening (b) and gating (c) — see W1 and W2.

## 4. Research workstreams

Each workstream states a falsifiable hypothesis, the work, the milestone, and
the metric that decides it.

### W1 — Critic calibration and trace quality (the flywheel's weakest edge)

- **Hypothesis:** the gemma3:4b critic-grader agrees with human judgment well
  enough to gate training data, once anchored by more than one ground-truth
  signal.
- **Work:** (1) human-label a calibration set of 100–200 graded pairs; compute
  critic/human agreement (Cohen's κ or Spearman on the 1–5 scale). (2) Add
  ground-truth signals beyond `mergedToMain`: test-suite pass on the produced
  delta, helper-apply acceptance vs. rejection, lens step transitioning
  pending → complete after the action. Each is already receipted; the work is
  joining receipts to pairs. (3) Re-grade with the anchored critic and
  measure drift.
- **Milestone (M2):** published calibration report inside the workspace (a
  governed object, not a wiki page); critic agreement ≥ 0.6 κ or the critic is
  replaced/ensembled.
- **Metric:** critic/human agreement; % of exported rows backed by ≥ 2
  independent ground-truth signals.

### W2 — Evaluation harness as the promotion gate for distilled models

- **Hypothesis:** distillation only compounds if every fine-tune must beat the
  incumbent on a frozen eval before deployment; without the gate, silent
  regression eats the loop.
- **Work:** build the eval suite *from the artifacts that already exist*:
  swarm condition packets are task specs with expected evidence, so a frozen
  set of (workspace state, packet, expected evidence) triples is an agent
  benchmark that costs nothing to author. Score: did the candidate model's
  proposal produce the expected evidence through the governed boundary?
  Promotion rule: candidate replaces incumbent only on win-rate ≥ incumbent +
  margin, with receipts for every eval run (the eval is itself a set of
  sandbox runs).
- **Milestone (M3):** first distilled model promoted (or rejected) through the
  gate, with the decision derivable from receipts.
- **Metric:** eval win-rate per model generation; tokens/cost per accepted
  proposal, tracked across generations.

### W3 — Three-plane conformance (agent-reversibility as a tested property)

- **Hypothesis:** "any state a human can reach by clicking, an agent can reach
  by API, and both leave the same receipts" is currently true by design but
  not by test; making it a tested property is what lets the swarm scale
  without UI babysitting.
- **Work:** property tests that drive the same journey (e.g. the cockpit's
  register → test → data source → refresh) through (1) the UI smoke path,
  (2) PATCH + helper apply, (3) the lens/metadata read plane, and assert
  identical derived state and receipt shapes. The unit-lens suite
  (`scripts/unit-workspace-lenses.test.mjs`) is the pattern to extend.
- **Milestone (M2):** conformance suite green for the activation and cockpit
  journeys; any new lens or cockpit must ship with a conformance case.
- **Metric:** # of journeys under conformance; divergence bugs found (each one
  was an invisible agent-reliability ceiling).

### W4 — Subatomic reapplication: a deriver per new domain

- **Hypothesis:** the deriver grammar (steps + status + next action + fade
  condition, scored by `scoreLensSteps`) ports to any domain at "register a
  deriver" cost — no new surface, no new executor.
- **Work:** ship two new domain cockpits in the window: (1) creative/video
  pipeline (brief → generation → continuity check → publish, with run
  receipts as evidence), (2) GTM motion (list → sequence → send health →
  reply handling, over the same api-registry/data-source spine the Email GTM
  dashboards already use). Each must include: liminal predicate, fade
  condition, swarm packet, and a distillation tap (its helper applies feed
  training-traces).
- **Milestone (M4):** both cockpits live and fading correctly; their traces
  appearing in graded exports.
- **Metric:** marginal cost of a new cockpit (files touched, LOC, days);
  trend must fall toward "one deriver + one test file."

### W5 — Swarm autonomy on condition packets

- **Hypothesis:** condition packets are sufficient task assignments for
  unattended agents on a growing class of steps; autonomy rate is the honest
  capability metric.
- **Work:** classify lens/cockpit steps by autonomy tier (auto-apply /
  propose-only / human-only), let agents claim packets in the lower tiers,
  and measure closure without human edits. Promotion of a step class to a
  higher tier requires N consecutive receipted successes — the same fading
  logic the scaffolds use, applied to oversight itself.
- **Milestone (M5):** ≥ 50% of secondary-lens steps closed agent-first;
  promotion/demotion of step classes derivable from receipts.
- **Metric:** autonomous closure rate per step class; human-edit rate on
  applied proposals; time-to-green per packet.

### W6 — Behavioral integrity (keep the dopamine collateralized)

- **Hypothesis:** the loop retains users *because* every reward is backed by
  artifact progress; any drift toward asserted progress poisons both the
  habit and the training data (a fake "complete" becomes a poisoned trace).
- **Work:** invariant tests, not analytics: no lens may report `complete`
  without persisted evidence; every scaffold must have a derivable fade
  condition; walkthroughs fire at most once per liminal window. Track the
  activation→habit conversion the walkthrough exists to bridge: % of
  workspaces with `activationComplete` that show contribution-graph activity
  within 7 days.
- **Milestone (M2, then continuous):** invariants in CI; conversion metric on
  a dashboard derived from the same artifacts (dogfooding the loop on the
  loop).
- **Metric:** activation→habit conversion; scaffold-fade correctness (zero
  permanent scaffolds); zero asserted-completion violations.

## 5. Metrics ledger

All of these are derivable from artifacts that already exist — no new
analytics system, which is the point.

| Metric | Derived from | Loop edge |
| --- | --- | --- |
| Trace volume / day | training-traces rows | (a) |
| Exportable fraction (score ≥ 4) | graded rows | (b) |
| Critic/human agreement | W1 calibration set | (b) |
| Eval win-rate per model gen | W2 receipted eval runs | (c) |
| Cost + latency per accepted proposal | helper receipts | (d) |
| Helper-apply acceptance rate | helper receipts | (d) |
| Autonomous closure rate | swarm packet receipts | (d) |
| Activation→habit conversion | walkthrough state + contribution graph | habit |
| Marginal cost of a new cockpit | W4 deltas | reapplication |

## 6. Sequencing

- **Months 1–2:** W1 calibration set + extra ground-truth signals; W3
  conformance suite for activation + cockpit; W6 invariants into CI. (Harden
  the loop before accelerating it.)
- **Months 3–4:** W2 eval harness + first gated fine-tune promotion; W4 first
  new domain cockpit (video). (Close edge (c) honestly.)
- **Months 5–6:** W5 autonomy tiers + agent-first closure; W4 second cockpit
  (GTM); second model generation through the gate. (Compound.)

The ordering is deliberate: grading and evaluation harden *before* the volume
of distillation increases, because a Goodharted critic compounds error at
exactly the rate an honest one compounds capability.

## 7. Known walls and failure modes

- **Critic reward-hacking / Goodhart:** the model being distilled and the
  model grading it share failure modes; mitigation is W1's external signals
  (merge, tests, lens transitions) — signals the student cannot fake without
  actually doing the work, because they're receipted artifact state.
- **Eval overfitting:** a frozen eval gets gamed over generations; rotate a
  held-out packet set and refresh from newly receipted real tasks.
- **Trace narrowness:** high-signal but domain-narrow data fine-tunes a
  specialist, not a generalist — acceptable and intended; do not extrapolate
  eval wins to out-of-contract tasks.
- **Governance drift:** any new mutation path outside PATCH / helper apply /
  sandbox-run silently breaks both auditability and data quality; W3
  conformance is the tripwire.
- **Compute:** local fine-tuning bounds model size; the program's bet is that
  contract + data quality beat parameter count *inside the contract*, and the
  W2 gate is where that bet is tested honestly, generation by generation.

## 8. Non-goals

No general ASI, no open-world autonomy, no self-modification of the
governance substrate by the agents it governs. The training-data bookkeeping
obeys the laws it teaches; that invariant outranks any capability gain.

## 9. Release rule

Like `CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`, this document adds no runtime
layer. Every workstream lands as pure derivers, receipted scripts, or tests
inside the existing boundaries: one canonical helper widget, no mutation path
outside the workspace API / helper apply / sandbox-run adapter, no claims of
completion without persisted evidence — including claims about the research
program itself, which must be derivable from receipts like everything else.
