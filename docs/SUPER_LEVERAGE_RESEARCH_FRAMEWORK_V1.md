# Super-Leverage Research Framework V1 — 4–6 Month Capability Program

This is the research layer of the **v0.14.0 conceptual stack** (the release
review frozen through S20 on PR #223). It sits directly on top of:

- [`docs/AWAC_ELIGIBILITY_CALCULUS_V1.md`](./AWAC_ELIGIBILITY_CALCULUS_V1.md)
  — the calculus (`E -> L -> G -> a -> r -> E'`) and its seven laws
- [`docs/AWAC_BEHAVIORAL_LOOP_V1.md`](./AWAC_BEHAVIORAL_LOOP_V1.md) — the
  staged behavioral choreography, the honesty constraint, the citation map
- [`docs/GTM_AGENT_LEVERAGE_FRAMEWORK_V1.md`](./GTM_AGENT_LEVERAGE_FRAMEWORK_V1.md)
  — the token-efficiency doctrine, the universal agent contract, the 90-day
  GTM sequencing
- [`docs/AWAC_MENTAL_MODELS_BRIDGE_V1.md`](./AWAC_MENTAL_MODELS_BRIDGE_V1.md)
  — the seven bridges (double-entry, version control, stigmergy, instrument
  flight, graduated authority)
- [`docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`](./CAUSATION_ITT_ELIGIBILITY_DRIVERS.md)
  — the original derivation thesis

Those documents explain and spend the system. This document states what to
**prove** with it in the next 4–6 months: the falsifiable workstreams,
milestones, and metrics that decide whether the flywheel actually compounds.
Every claim below was re-verified in code on this branch or in the v0.14.0
release-review branch; anchors are given throughout.

## 1. Scope and honest definition

The target is **domain-bounded super-leverage**, not general ASI:

> A governed agentic operating system in which one operator plus an agent
> fleet reliably produces output that previously required a team — across
> software delivery, workspace orchestration, creative pipelines, and GTM
> automation — with every action receipted, every reward collateralized by
> artifact progress, and the assistant getting cheaper and more personal
> through its own usage.

This is the research restatement of the GTM doc's economics thesis
("structure is pre-paid intelligence"): the program measures whether tokens
converted into artifact structure actually yield the compounding the thesis
predicts.

What it will not deliver: frontier-scale general capability. The walls are
compute (local fine-tunes vs. frontier training), data breadth (high-signal
but narrow traces), and algorithmic uncertainty. This framework treats those
walls as fixed and optimizes the one loop that is ours to tighten.

## 2. Verified substrate (what already exists at v0.14.0)

Every mechanism below was read and verified in code.

| Mechanism | Anchor | Verified behavior |
| --- | --- | --- |
| Pure activation deriver | `apps/workspace/lib/workspace-activation.js` (`deriveWorkspaceActivationState`) | Checklist derived per render from config + sidecar + metadata graph; never persisted; secret-safe (calculus laws 1–3) |
| Lens registry + global next action | same file (`WORKSPACE_LENS_REGISTRY`, `deriveWorkspaceState`) | 6 lenses share `scoreLensSteps`; one workspace-wide `nextAction` falls back primary → first incomplete secondary (the attention scheduler) |
| Liminal walkthrough predicate | same file (`deriveLensWalkthroughState`) | `show: activationComplete && !hasActivity && !dismissed` — the activation-to-habit handoff as a pure function; dismissal in the governed `workspace-ui-cache` row, not browser state |
| Contribution graph | same file (`deriveWorkspaceContributions`) | GitHub-style daily grid from run/fetch/test timestamps; counts and dates only |
| Swarm condition packet | same file (`deriveSwarmConditionPacket`) + `GET /api/workspace/swarm-condition` | goal / currentState / blockedStep / prerequisite / availableTools / expectedEvidence — the same derived state the human panel renders (calculus law 7, symmetric audience) |
| Record-altitude cockpit | `apps/workspace/lib/api-registry-creation-flow.js` (`deriveApiRegistryCreationState`) | register → auth → test → (resolver) → sandbox tool → data source → refresh; a partial order, not a sequence (calculus law 4); auth resolved only from `runtime.configuredEnvRefs` slugs (law 6) |
| Response-shape introspection | `apps/workspace/lib/api-response-profile.js` | Record-array detection, pagination detection, resolver recommendation — derived guidance, not canned copy |
| Distillation Phase 1 (harvest) | `helpers/harvest-cursor-traces.mjs` | Raw instruction/output pairs from real agent sessions |
| Distillation Phase 2 (grade) | `helpers/grade-raw-pairs.mjs` | Routes every pair through the live `critic-grader` sandbox row (local-intelligence / gemma3:4b) via `POST /api/workspace/sandbox-run` — never bypasses the workspace API; `mergedToMain === true` floors the score at 4 |
| Distillation Phase 3 (export) | `helpers/export-training-traces.mjs` | `qualityScore >= --min-score && exported == "false"` → Unsloth-ready `{instruction, input, output}` JSONL; instruction encodes the contract ("Respect AWaC V2 invariants and the PATCH allowlist"); `exported = "true"` PATCHed back through the governed boundary |
| The thesis, self-documented | `docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md` + `docs/AWAC_BEHAVIORAL_LOOP_V1.md` | "This is the dopamine loop without hidden state"; the choreography and citation map frozen as artifacts |

Workspace-starter paths are relative to
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/`. The cockpit
engines and their unit suites (`scripts/unit-api-registry-creation-flow.test.mjs`
and siblings) shipped in the v0.14.0 governed creation release; the four
conceptual docs land via the release-review PR.

## 3. The compounding loop, formalized

In calculus terms: the base loop is `E -> L -> G -> a -> r -> E'`. The
distillation flywheel is a **second-order loop over the receipts** — it
consumes `r` and emits a better policy for choosing `a`:

```
   (a) action → trace        helper applies, sandbox runs, governed PATCHes (r ∈ E)
   (b) trace → graded data   critic-grader score + mergedToMain ground truth
   (c) graded data → model   ≥ threshold rows → Unsloth JSONL → fine-tune
   (d) model → friction↓     cheaper/better proposals → more ambitious actions → (a)
```

Edge (d) is where the token-efficiency doctrine bites: doctrine rule 7
("validation replaces model size") says a small cheap model can safely
propose because the validator and PATCH boundary are the safety layer. The
flywheel's promise is that distillation makes the cheap proposer *good*, not
just safe. That promise is testable — and edge (b) is currently the weakest
link: a 4B local model grades the traces, and `mergedToMain` is the only
external ground-truth signal. The single highest-leverage research
investment in the window is hardening (b) and gating (c) — W1 and W2.

## 4. Research workstreams

Each workstream states a falsifiable hypothesis, the work, the milestone,
the deciding metric, and the law/doctrine it operationalizes.

### W1 — Critic calibration and trace quality (the flywheel's weakest edge)

- **Operationalizes:** calculus law 3 (no completion without evidence),
  applied to the training data itself — a grade is a completion claim about
  a trace and needs evidence behind it.
- **Hypothesis:** the gemma3:4b critic-grader agrees with human judgment well
  enough to gate training data, once anchored by more than one ground-truth
  signal.
- **Work:** (1) human-label a calibration set of 100–200 graded pairs;
  compute critic/human agreement (Cohen's κ or Spearman on the 1–5 scale).
  (2) Add ground-truth signals beyond `mergedToMain`: test-suite pass on the
  produced delta, helper-apply acceptance vs. rejection, lens/cockpit step
  transitioning pending → complete after the action. Each is already
  receipted; the work is joining receipts to pairs. (3) Re-grade with the
  anchored critic and measure drift.
- **Milestone (M2):** calibration report stored as a governed workspace
  object; critic agreement ≥ 0.6 κ or the critic is replaced/ensembled.
- **Metric:** critic/human agreement; % of exported rows backed by ≥ 2
  independent ground-truth signals.

### W2 — Evaluation harness as the promotion gate for distilled models

- **Operationalizes:** doctrine rule 7 (validation replaces model size) —
  the gate is what proves the cheapest model that passes apply, generation
  by generation.
- **Hypothesis:** distillation only compounds if every fine-tune must beat
  the incumbent on a frozen eval before deployment; without the gate, silent
  regression eats the loop.
- **Work:** build the eval suite *from artifacts that already exist*: swarm
  condition packets are task specs with expected evidence, so a frozen set
  of (workspace state, packet, expected evidence) triples is an agent
  benchmark that costs nothing to author. Score: did the candidate model's
  proposal produce the expected evidence through the governed boundary?
  Promotion rule: candidate replaces incumbent only on win-rate ≥ incumbent
  + margin, with receipts for every eval run (the eval is itself a set of
  sandbox runs — the books balance on the research too).
- **Milestone (M3):** first distilled model promoted (or rejected) through
  the gate, with the decision derivable from receipts.
- **Metric:** eval win-rate per model generation; tokens/cost per accepted
  proposal across generations (the doctrine's capital-vs-burn ratio, made
  measurable).

### W3 — Three-plane conformance (agent-reversibility as a tested property)

- **Operationalizes:** calculus law 7 (symmetric audience). Currently true
  by design, not by test.
- **Hypothesis:** making "any UI-reachable state is API-reachable with
  identical receipts" a tested property is what lets the fleet scale without
  UI babysitting.
- **Work:** property tests that drive the same journey (the cockpit's
  register → test → data source → refresh) through (1) the UI smoke path,
  (2) PATCH + helper apply, (3) the lens/metadata read plane, asserting
  identical derived state and receipt shapes. Extend the existing pattern in
  `scripts/unit-workspace-lenses.test.mjs` and
  `scripts/unit-api-registry-creation-flow.test.mjs`.
- **Milestone (M2):** conformance suite green for the activation and cockpit
  journeys; every new lens or cockpit ships with a conformance case.
- **Metric:** # of journeys under conformance; divergence bugs found (each
  one was an invisible agent-reliability ceiling).

### W4 — Subatomic reapplication: a deriver per new domain

- **Operationalizes:** calculus law 5 (entity granularity) + GTM 3.2
  (vertical kits as products) — each new cockpit is simultaneously a
  research result and a kit exemplar with a real data path.
- **Hypothesis:** the deriver grammar (steps + status + next action + fade
  condition, scored by `scoreLensSteps`) ports to any domain at "register a
  deriver" cost — no new surface, no new executor.
- **Work:** ship two new domain cockpits in the window, matching the GTM
  fleet archetypes: (1) creative/video pipeline (brief → generation →
  continuity check → publish, run receipts as evidence — archetype 4.3),
  (2) GTM motion (list → sequence → send health → reply handling over the
  same api-registry/data-source spine — archetype 4.1). Each must include:
  liminal predicate, fade condition, swarm packet, and a distillation tap
  (its helper applies feed `training-traces`).
- **Milestone (M4):** both cockpits live and fading correctly; their traces
  appearing in graded exports; each doubles as the demo footage for its
  vertical kit (GTM sequencing step 2).
- **Metric:** marginal cost of a new cockpit (files touched, LOC, days);
  trend must fall toward "one deriver + one test file."

### W5 — Fleet autonomy on condition packets

- **Operationalizes:** the universal agent contract (GTM 4.5: Lens-first,
  surface-bound, evidence-gated, receipt-terminated) plus the graduated-
  authority bridge — oversight that fades on receipted competence, exactly
  like the product's scaffolds.
- **Hypothesis:** condition packets are sufficient task assignments for
  unattended agents on a growing class of steps; autonomous closure rate is
  the honest capability metric. Coordination stays stigmergic (agents read
  Lens and write receipts, never each other's transcripts), so token cost
  scales with state, not fleet size.
- **Work:** classify lens/cockpit steps into autonomy tiers (auto-apply /
  propose-only / human-only); let agents claim packets in the lower tiers;
  measure closure without human edits. Promotion of a step class to a higher
  tier requires N consecutive receipted successes; demotion is automatic on
  a failed receipt.
- **Milestone (M5):** ≥ 50% of secondary-lens steps closed agent-first;
  tier promotions/demotions derivable from receipts.
- **Metric:** autonomous closure rate per step class; human-edit rate on
  applied proposals; tokens per closed packet (must stay flat as fleet
  size grows — the stigmergy claim, tested).

### W6 — Behavioral integrity (keep the dopamine collateralized)

- **Operationalizes:** the honesty constraint of the behavioral loop doc and
  GTM anti-pattern #2 ("letting Lens accept asserted state").
- **Hypothesis:** the loop retains users *because* every reward is backed by
  artifact progress; any drift toward asserted progress poisons both the
  habit and the training data — a fake "complete" becomes a poisoned trace,
  so behavioral honesty and data quality are the same invariant.
- **Work:** invariant tests, not analytics: no lens may report `complete`
  without persisted evidence; every scaffold must have a derivable fade
  condition; walkthroughs fire at most once per liminal window. Track the
  activation→habit conversion the walkthrough exists to bridge: % of
  workspaces with `activationComplete` showing contribution-graph activity
  within 7 days.
- **Milestone (M2, then continuous):** invariants in CI; conversion metric
  on a dashboard derived from the same artifacts (the loop dogfooding the
  loop).
- **Metric:** activation→habit conversion; scaffold-fade correctness (zero
  permanent scaffolds); zero asserted-completion violations.

## 5. Metrics ledger

All derivable from artifacts that already exist — no new analytics system,
which is the point (doctrine rule 4: receipts replace narration).

| Metric | Derived from | Loop edge |
| --- | --- | --- |
| Trace volume / day | training-traces rows | (a) |
| Exportable fraction (score ≥ 4) | graded rows | (b) |
| Critic/human agreement | W1 calibration set | (b) |
| Eval win-rate per model gen | W2 receipted eval runs | (c) |
| Cost + latency per accepted proposal | helper receipts | (d) |
| Helper-apply acceptance rate | helper receipts | (d) |
| Autonomous closure rate; tokens per closed packet | swarm packet receipts | (d) |
| Activation→habit conversion | walkthrough state + contribution graph | habit |
| Marginal cost of a new cockpit | W4 deltas | reapplication |

## 6. Sequencing (interleaved with the GTM 90-day plan)

The research program and the GTM sequencing in
`GTM_AGENT_LEVERAGE_FRAMEWORK_V1.md` §5 share artifacts deliberately — each
research milestone produces the GTM asset, and vice versa.

- **Months 1–2:** W1 calibration set + extra ground-truth signals; W3
  conformance suite for activation + cockpit; W6 invariants into CI.
  *(GTM steps 1 and 3: the conformance journeys ARE the demo-arc footage
  script, and the swarm packet under conformance IS the agent handoff
  packet spec.)*
- **Months 3–4:** W2 eval harness + first gated fine-tune promotion; W4
  first new domain cockpit (video). *(GTM step 2: the cockpit is the
  vertical kit's real data path. GTM step 4: W2's eval state feeds the
  single readiness number Lens surfaces.)*
- **Months 5–6:** W5 autonomy tiers + agent-first closure; W4 second
  cockpit (GTM motion); second model generation through the gate. *(GTM
  step 5: the hosted upgrade lane is marketed only once the local loop has
  proven publicly — which is exactly what the receipted metrics provide.)*

The ordering is deliberate: grading and evaluation harden *before*
distillation volume increases, because a Goodharted critic compounds error
at exactly the rate an honest one compounds capability.

## 7. Known walls and failure modes

- **Critic reward-hacking / Goodhart:** the model being distilled and the
  model grading it share failure modes; mitigation is W1's external signals
  (merge, tests, lens transitions) — signals the student cannot fake without
  doing the work, because they are receipted artifact state (law 3 applied
  to research).
- **Eval overfitting:** a frozen eval gets gamed over generations; rotate a
  held-out packet set and refresh from newly receipted real tasks.
- **Trace narrowness:** high-signal but domain-narrow data fine-tunes a
  specialist, not a generalist — acceptable and intended; do not extrapolate
  eval wins to out-of-contract tasks.
- **Governance drift:** any new mutation path outside PATCH / helper apply /
  sandbox-run silently breaks auditability and data quality at once; W3
  conformance is the tripwire. This is GTM anti-pattern #1 ("magic agent
  surface") stated as a research risk.
- **Agent narration creep:** fleets that explain themselves in prose instead
  of receipts will look impressive and be unaffordable (GTM anti-pattern
  #4); the tokens-per-closed-packet metric in W5 is the tripwire.
- **Compute:** local fine-tuning bounds model size; the program's bet is
  that contract + data quality beat parameter count *inside the contract*,
  and the W2 gate is where that bet is tested honestly, generation by
  generation.

## 8. Non-goals

No general ASI, no open-world autonomy, no self-modification of the
governance substrate by the agents it governs. The training-data bookkeeping
obeys the laws it teaches; that invariant outranks any capability gain.

## 9. Release rule

Like the companion docs, this document adds no runtime layer. Every
workstream lands as pure derivers, receipted scripts, or tests inside the
existing boundaries: one canonical helper widget, no mutation path outside
the workspace API / helper apply / sandbox-run adapter, no claims of
completion without persisted evidence — including claims about the research
program itself, which must be derivable from receipts like everything else.
