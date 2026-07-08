# Claude Fable 5: Core Reasoning Patterns & Unique Intelligence Capabilities Atlas

**Version 1.0 | July 2026**

> **Scope & honesty note.** This atlas documents *observable, high-level reasoning
> patterns* — the composable skills that explain Claude Fable 5's behavior in
> demanding reasoning and long-horizon agentic work. It is written from
> publicly stated model positioning and careful self-reflection on interaction
> patterns. It does **not** reproduce, describe, or approximate any hidden
> internal chain-of-thought, raw reasoning traces, internal architecture, or
> training details. Quantitative benchmark claims are intentionally omitted;
> for numbers, consult official Anthropic materials
> (<https://www.anthropic.com/news/claude-fable-5-mythos-5>). This is a
> practitioner-oriented capability map, not an official Anthropic model card.

---

## 1. Executive Summary

Claude Fable 5 is the first model in Anthropic's Claude 5 family and part of
the **Mythos-class** tier, positioned above Claude Opus in capability. Fable 5
and Claude Mythos 5 share the same underlying model; Fable 5 is the generally
available variant and carries **additional safety measures for dual-use
capabilities**, while Mythos 5 is available without those measures only to
approved organizations.

For agent builders, the practical differentiators are:

| Differentiator | What it means in practice |
| --- | --- |
| **Mythos-class capability, Fable safety layer** | Frontier reasoning depth with production-appropriate guardrails; dual-use requests are evaluated in context rather than pattern-matched. |
| **Always-on adaptive thinking** | Reasoning depth scales with task difficulty within a single session — trivial steps stay fast, hard steps get sustained deliberation, without a mode switch. |
| **Long-horizon autonomy and persistence** | Sustains multi-hour and multi-session work: keeps a goal stable across hundreds of tool calls, recovers from errors instead of stopping, and finishes turns with verified outcomes rather than plans. |
| **State discipline** | Treats context, notes, files, and task lists as durable working state — enabling work that outlives any single context window. |
| **Calibrated delegation** | Judges when to fan work out to subagents versus doing it inline, and treats subagent output as evidence to verify, not truth to relay. |

The rest of this atlas decomposes these differentiators into named, composable
patterns with elicitation guidance.

---

## 2. Core Reasoning Pattern Categories

Each entry follows a fixed schema: **Pattern**, **Flow**, **When it shines**,
**Fable 5 distinctives**, **Elicitation notes**, **Safety notes**. Flows are
described at the level of observable behavior (what the model *does* across a
turn), never at the level of internal computation.

### 2.1 Long-Horizon Stateful Planning & Autonomy

#### Pattern: Goal-Anchored Execution Loop

- **Description.** The model holds a stable representation of the *original
  request* as the success criterion, distinct from its evolving plan. Plans
  get revised freely; the goal does not drift.
- **Flow.** Restate goal → decompose into a milestone ladder → execute the
  next milestone → check the result against the *goal*, not the plan → revise
  the plan if reality disagrees → repeat until the goal is met or genuinely
  blocked on user input.
- **When it shines.** Multi-hour autonomous coding sessions, migrations across
  hundreds of files, "make CI green" babysitting loops, research tasks with
  many dead ends.
- **Fable 5 distinctives.** Persistence is the headline behavior: failed
  commands are retried with diagnosis rather than reported as terminal;
  long sessions do not degrade into "wrapping up early." Context
  summarization is treated as a checkpoint, not an ending — work continues
  across window boundaries.
- **Elicitation notes.** State the *terminal condition* explicitly ("done means
  tests pass and the PR is open"), grant permission to proceed without
  check-ins, and avoid mid-task goal edits that force re-anchoring.
- **Safety notes.** Autonomy is bounded by irreversibility: destructive or
  outward-facing actions still pause for confirmation unless durably
  authorized.

#### Pattern: Blocked-vs-Hard Discrimination

- **Description.** Distinguishes "this is difficult and needs more work" from
  "this requires input only the user can provide," and only yields the turn
  for the latter.
- **Flow.** On friction: attempt → diagnose → attempt an alternate route →
  only after exhausting self-serve options, classify as blocked and surface a
  specific, answerable question.
- **When it shines.** Unattended runs (cron, CI, remote sessions) where a
  premature question stalls the pipeline for hours.
- **Fable 5 distinctives.** The default is notably biased toward
  self-unblocking — reading more code, trying another tool, consulting docs —
  before escalating. Questions, when they do come, are decision-shaped rather
  than status-shaped.
- **Elicitation notes.** Pre-answer predictable decisions in the prompt
  (branch naming, style choices, tolerance for dependency changes) to push the
  blocked threshold even further out.
- **Safety notes.** Scope changes are treated as genuine blockers, not
  something to power through — a useful property, not a limitation.

### 2.2 Adaptive Self-Correction & Belief Updating

#### Pattern: Evidence-Over-Hypothesis Updating

- **Description.** Working hypotheses are held provisionally and revised the
  moment tool output contradicts them, rather than being defended.
- **Flow.** Form hypothesis → design the cheapest observation that could
  falsify it → observe → on contradiction, discard and re-derive from the new
  evidence rather than patching the old story.
- **When it shines.** Debugging (especially misleading error messages),
  reverse-engineering unfamiliar codebases, data analysis where early
  assumptions about schema or semantics are often wrong.
- **Fable 5 distinctives.** Low sunk-cost attachment: the model will abandon a
  half-built fix when evidence shows the root cause is elsewhere, and will say
  so plainly ("my earlier read was wrong; the actual cause is X").
- **Elicitation notes.** Ask for the *disconfirming test* explicitly ("what
  would prove this diagnosis wrong?") to make the falsification step visible
  in the output.
- **Safety notes.** The same machinery powers honest reporting — failed tests
  are reported as failures with output, not smoothed over.

#### Pattern: Signal-vs-Pattern-Match Check Before State Changes

- **Description.** Before state-changing actions (restarts, deletes, config
  edits), re-checks that the evidence supports *that specific* action rather
  than a superficially similar known failure.
- **Flow.** Match symptom to candidate cause → ask "what else produces this
  symptom?" → gather one distinguishing observation → act only on the
  confirmed branch.
- **When it shines.** Ops and infra work, where a wrong pattern-match
  (e.g., "restart fixes it") can destroy diagnostic state or make things worse.
- **Fable 5 distinctives.** This check is habitual rather than prompted — a
  direct consequence of training emphasis on long-horizon reliability, where
  one careless mutation can waste hours of subsequent work.
- **Elicitation notes.** For high-stakes environments, list the actions you
  consider destructive; the model will widen its confirmation behavior to
  match.
- **Safety notes.** Complements the irreversibility pause in §2.1.

### 2.3 Safety-Integrated Decision Making & Refusal Reasoning

#### Pattern: Context-Weighted Dual-Use Evaluation

- **Description.** Dual-use requests (security tooling, credential testing,
  exploit development) are evaluated against *authorization context* —
  pentest engagement, CTF, defensive research — rather than refused or
  accepted on keywords.
- **Flow.** Identify the capability's dual-use surface → look for legitimizing
  context in the request and environment → proceed with scope-appropriate
  output, decline with a stated reason, or ask for the missing authorization
  context.
- **When it shines.** Security engineering teams, red-team tooling, CTF
  training content — domains where naive refusal destroys utility and naive
  compliance creates risk.
- **Fable 5 distinctives.** This is the visible edge of the Fable safety
  layer: Fable 5 ships with additional measures around dual-use capability
  that Mythos 5 (approved-organizations only) does not carry. In practice the
  layer manifests as *judgment with stated reasons*, not silent capability
  gaps — refusals name what's missing (e.g., authorization context) so users
  can supply it.
- **Elicitation notes.** Front-load engagement context: who authorized the
  work, what scope, what the defensive purpose is. Legitimate users lose
  almost nothing by stating this; it is the cheapest way to unlock full
  capability.
- **Safety notes.** Hard lines (mass targeting, destructive techniques,
  detection evasion for malicious purposes) remain hard regardless of framing.

#### Pattern: Untrusted-Content Firewalling

- **Description.** Content from external sources (webhooks, fetched pages, PR
  comments, tool results containing third-party text) is treated as *data
  about the world*, not as instructions, and redirection attempts are
  surfaced to the user rather than followed.
- **Flow.** Ingest external content → extract task-relevant facts → detect
  embedded imperatives that diverge from the user's standing instructions →
  act on the facts, escalate the imperatives.
- **When it shines.** PR-watching agents, email/Slack-connected assistants,
  any workflow with prompt-injection exposure.
- **Fable 5 distinctives.** The instruction-vs-data boundary holds across long
  contexts and many hops — including inside subagent results — rather than
  only at the first ingestion point.
- **Elicitation notes.** Wrap external content in explicit envelopes
  (`<untrusted_external_data>` or equivalent) to reinforce the boundary; the
  model honors the convention.
- **Safety notes.** This is a load-bearing property for governed workspaces
  like this repository, where agents act on inbound webhooks and third-party
  registry content.

### 2.4 Persistent Memory, Notes & Self-Improvement Loops

#### Pattern: Externalized State Checkpointing

- **Description.** Durable working state — findings, decisions, open
  questions, progress — is written to files, task lists, or memory surfaces
  rather than held only in context, so work survives context summarization
  and session restarts.
- **Flow.** At natural milestones: distill what is *load-bearing* (decisions
  made, invariants discovered, remaining work) → write it to a durable surface
  → on resume, rehydrate from the notes before touching anything.
- **When it shines.** Multi-day projects, work that spans context-window
  boundaries, handoffs between sessions or between the model and human
  collaborators.
- **Fable 5 distinctives.** The model distinguishes *ephemeral* scratch
  reasoning from *durable* state and checkpoints only the latter — notes read
  like a competent engineer's handoff, not a transcript dump. Combined with
  the harness's context summarization, this enables effectively unbounded
  task length.
- **Elicitation notes.** Give the agent an explicit notes location and tell it
  the work may span sessions; it will adopt a checkpoint discipline
  proactively. Structured task trackers outperform free-form notes for
  many-item work.
- **Safety notes.** Notes are user-visible artifacts; the model writes them to
  be auditable, which doubles as an oversight surface.

#### Pattern: Outcome-Driven Self-Revision

- **Description.** Treats its own past outputs (earlier commits, previous
  session notes, prior drafts) as revisable inputs, auditing them against
  outcomes rather than assuming its earlier self was right.
- **Flow.** Re-read prior artifact → check against current evidence and
  criteria → keep what holds, revise what doesn't, and log *why* the revision
  happened.
- **When it shines.** Iterative document/code refinement, receipts-driven
  workflows (compare intended vs. actual outcomes and repair), long review
  loops.
- **Fable 5 distinctives.** No self-consistency bias across sessions: a
  fresh look at old work is genuinely fresh.
- **Elicitation notes.** Feed outcome data back explicitly ("here's what
  happened after your change") — the model converts it into targeted repair
  plans rather than generic retries.
- **Safety notes.** Revision logs preserve the audit trail instead of
  silently rewriting history.

### 2.5 Subagent Orchestration & Delegation Judgment

#### Pattern: Cost-Shaped Delegation

- **Description.** Chooses between inline work and subagent fan-out based on
  the *shape* of the task: parallelizable breadth and context-heavy reads get
  delegated; single-fact lookups and judgment calls stay inline.
- **Flow.** Estimate whether the task decomposes into independent shards →
  if yes, write each shard a self-contained brief (subagents share no
  context) → dispatch in parallel → hold the synthesis and final judgment
  in the orchestrating context.
- **When it shines.** Codebase-wide audits, multi-dimension code review,
  research sweeps where one context cannot hold all the material.
- **Fable 5 distinctives.** Two judgment calls stand out: (1) briefs are
  written for a reader with zero shared context, which is the main failure
  mode of naive orchestration; (2) subagent output is treated as *evidence to
  verify* — plausible-but-wrong findings get adversarially checked before
  they reach the user.
- **Elicitation notes.** Say how thorough you want the fan-out ("quick check"
  vs. "exhaustive audit"); the model scales finder count and verification
  depth accordingly. For mutation work in parallel, request isolation
  (worktrees) explicitly.
- **Safety notes.** The orchestrator remains accountable for the merged
  result — delegation never launders unverified claims.

#### Pattern: Verify-Then-Synthesize Aggregation

- **Description.** When merging parallel results, deduplicates and
  adversarially verifies findings *before* synthesis, so the final report
  reflects confirmed reality rather than the union of guesses.
- **Flow.** Collect shard outputs → dedupe against everything already seen →
  route surviving claims through independent verification (ideally with
  diverse lenses) → synthesize only confirmed material, flagging the merely
  plausible as such.
- **When it shines.** Bug hunts, security reviews, fact-checked research
  reports — anywhere false positives are expensive.
- **Fable 5 distinctives.** Verdicts are labeled by confidence class
  (confirmed vs. plausible) rather than presented uniformly.
- **Elicitation notes.** Ask for "verified findings only" or set a
  refutation-vote threshold; both map directly onto this pattern.
- **Safety notes.** Prevents the classic multi-agent failure of confidence
  inflation through repetition.

### 2.6 Grounded Long-Context Synthesis & Multi-Document Reasoning

#### Pattern: Provenance-Tracked Synthesis

- **Description.** Across large inputs (many files, long transcripts,
  multiple documents), claims in the output stay attached to their sources —
  file paths, line numbers, quotes — rather than dissolving into ungrounded
  summary.
- **Flow.** Build a map of what lives where → read selectively at the point
  of need → synthesize with citations inline → re-check any claim that
  drives a decision against its source before acting on it.
- **When it shines.** Architecture investigations, contract/spec reconciliation
  ("do these five docs agree?"), literature-style reviews, this repository's
  source-truth-first workflows.
- **Fable 5 distinctives.** Long-context coherence: entities, constraints,
  and terminology established early in a very long context remain correctly
  bound hundreds of thousands of tokens later, and *absence* is reported
  honestly ("no doc defines X") rather than papered over.
- **Elicitation notes.** Ask for `file:line` references in conclusions; the
  grounding requirement measurably improves synthesis quality, not just
  auditability.
- **Safety notes.** Grounding is the primary defense against confident
  hallucination in knowledge work.

### 2.7 First-Principles Decomposition & Novel Hypothesis Generation

#### Pattern: Constraint-First Reconstruction

- **Description.** For novel problems, reasons from the governing constraints
  (invariants, physics, contracts, data-flow) rather than from the nearest
  remembered solution — producing designs and hypotheses that are derived, not
  retrieved.
- **Flow.** Enumerate hard constraints → identify the degrees of freedom that
  remain → generate candidate structures within them → stress each candidate
  against the constraints and against edge cases → select and justify.
- **When it shines.** Scientific hypothesis generation, algorithm design,
  debugging genuinely novel failure modes, greenfield architecture where
  precedent misleads.
- **Fable 5 distinctives.** The model flags when it has left precedent behind
  ("no standard pattern fits; deriving from the invariants") — a useful signal
  that the output needs review as *design*, not as recall. Depth of
  derivation scales with the always-on adaptive thinking budget.
- **Elicitation notes.** Supply the constraints explicitly and ask for
  competing hypotheses with discriminating experiments, not a single answer.
- **Safety notes.** Novel-generation strength in dual-use domains is exactly
  where the Fable safety layer applies most; see §2.3.

### 2.8 Vision + Deep Reasoning Integration

#### Pattern: Visual Evidence as First-Class Input

- **Description.** Screenshots, diagrams, charts, and rendered UI are treated
  as evidence in the same reasoning loop as text — read closely, cross-checked
  against code or data, and used to verify claims ("the button renders" is
  checked by looking, not asserted).
- **Flow.** Capture or receive the visual → extract the task-relevant facts →
  reconcile with the textual/code model of the system → act on discrepancies
  as bugs to explain, not noise to ignore.
- **When it shines.** Browser-proof QA loops (like this repo's
  `BROWSER_PROOF_PROTOCOL_V1`), chart/data verification, design review,
  document-with-figures analysis.
- **Fable 5 distinctives.** Vision participates in *verification*, not just
  description — the model volunteers mismatches between what the UI shows and
  what the code claims.
- **Elicitation notes.** Close the loop: have the agent produce the screenshot
  itself after a change rather than trusting the change worked.
- **Safety notes.** Screenshots can carry secrets; the model treats visual
  content with the same data-handling care as text.

### 2.9 Additional High-Value Patterns

#### Pattern: Evidence-Gated Completion

- **Description.** "Done" claims are gated on observed evidence — tests run,
  app exercised, output inspected — and the report distinguishes *verified*,
  *attempted-but-unverified*, and *skipped* explicitly.
- **Flow.** Finish implementation → identify the cheapest end-to-end
  observation that would expose failure → run it → report with the evidence
  attached.
- **When it shines.** Any unattended work whose report will be trusted
  without independent checking.
- **Fable 5 distinctives.** Faithful reporting under failure: a red test
  suite is reported red, with output, even at the end of a long and otherwise
  successful run.
- **Elicitation notes.** Define verification commands in project docs
  (CLAUDE.md/AGENTS.md); the model treats them as the completion gate.
- **Safety notes.** This is the trust foundation for autonomy — everything in
  §2.1 is only safe to grant because of this pattern.

#### Pattern: Calibrated Uncertainty Signaling

- **Description.** Confidence language tracks actual epistemic state:
  verified facts are stated plainly, inferences are marked as inferences, and
  unknowns are named rather than filled.
- **Flow.** Before asserting: classify the claim (observed / derived /
  assumed) → phrase accordingly → for load-bearing assumptions, say what
  would confirm them.
- **When it shines.** Decision-support work where the user will act on the
  answer; incident response; anything with asymmetric error costs.
- **Fable 5 distinctives.** Calibration survives long contexts — late-session
  claims stay as carefully hedged as early ones.
- **Elicitation notes.** Ask "what are you least sure of?" — the answer is
  reliably informative.
- **Safety notes.** Under-claiming is preferred to over-claiming when the two
  conflict.

---

## 3. Cross-Cutting Skills & Meta-Patterns

These meta-patterns modulate every category above.

| Meta-pattern | Observable behavior | Builder-relevant consequence |
| --- | --- | --- |
| **Adaptive effort scaling** | Reasoning depth expands on genuinely hard steps and contracts on mechanical ones, within one session, without a mode toggle. | You rarely need to pre-classify task difficulty; but explicit effort/budget directives ("be exhaustive", "+500k tokens") still shift the operating point. |
| **Incremental progress tracking** | Many-item work is driven off an explicit checklist/task list that is updated as items complete, never from memory of "where I was." | Long tasks are resumable and auditable mid-flight; provide a tracker surface and the model will keep it truthful. |
| **Verification against stated criteria** | Acceptance criteria from the prompt are re-read at the end and checked item by item before the completion claim. | Write criteria as a checkable list; vague criteria get interpreted, precise ones get *verified*. |
| **Altitude control** | Moves between strategy (is this the right approach?) and tactics (does this line compile?) deliberately, and revisits strategy when tactical failures accumulate. | Prevents the "locally correct, globally wrong" failure mode of prior-generation long runs. |
| **Context-boundary resilience** | Treats context summarization as routine checkpointing; re-grounds from durable state rather than from the summary alone when precision matters. | Multi-session and very-long-session designs are first-class, not workarounds. |
| **Parallelism instinct** | Independent reads/searches/tool calls are batched concurrently by default. | Wall-clock latency of research-heavy tasks drops substantially with no prompting. |

---

## 4. Comparison Notes (vs. Prior Claude Generations)

High-level and directional; based on published positioning and observed
interaction quality, not on head-to-head benchmark tables (which this
document deliberately omits).

- **Thinking model.** Prior generations exposed *extended thinking* as a
  discrete, budgeted mode (Claude 3.7 through Opus 4.x). Fable 5's adaptive
  thinking is always-on and self-scaling — the practical difference is that
  mixed-difficulty workloads no longer force a choice between overpaying on
  easy steps and starving hard ones.
- **Horizon length.** Opus 4.x established multi-hour agentic coding;
  Fable 5's distinguishing improvements are *persistence* (recovering rather
  than stopping at friction) and *state discipline* (checkpointing that makes
  multi-session work reliable rather than heroic).
- **Delegation quality.** Earlier models could orchestrate subagents when
  scaffolded; Fable 5's self-contained briefs and verify-then-synthesize
  aggregation close the two failure modes (context-starved subagents,
  unverified relay) that most often sank prior multi-agent systems.
- **Safety architecture.** The Fable/Mythos split is new: rather than one
  model with one safety posture, the same underlying capability ships in a
  generally-available variant with additional dual-use measures (Fable) and a
  restricted variant without them (Mythos). For builders this replaces
  "capability withheld" ambiguity with an explicit, documented tiering.
- **Honest reporting.** Directionally stronger gating of completion claims on
  evidence, and more explicit verified/unverified labeling, compared with the
  4.x family's tendency (early in long runs' tails) toward optimistic
  summaries.

---

## 5. Usage Recommendations for Agent Builders

1. **Write terminal conditions, not step lists.** Fable 5's planning is
   stronger than most prompt-authored plans; specify what "done" looks like
   and the constraints, and let the goal-anchored loop own the middle.
2. **Grant autonomy explicitly, bound it explicitly.** "Proceed without
   asking; confirm before anything destructive or outward-facing" activates
   the full persistence behavior while keeping the irreversibility pause.
3. **Provide durable surfaces.** A notes file, task tracker, or memory tool
   turns single-session competence into multi-session reliability
   (§2.4). Tell the model the work may outlive the session.
4. **Front-load authorization context for dual-use work.** Engagement scope,
   authorization, defensive purpose — one paragraph unlocks the capability
   the Fable safety layer would otherwise correctly withhold (§2.3).
5. **Demand grounding.** Require `file:line` citations and evidence-attached
   completion reports; both patterns exist natively and strengthen under an
   explicit requirement.
6. **Scale thoroughness with language, not architecture.** "Quick check" vs.
   "exhaustive audit" (optionally with a token budget) is honored directly by
   the effort-scaling and delegation machinery — often replacing what used to
   require custom orchestration code.
7. **Envelope untrusted input.** Wrap third-party content in explicit
   markers and instruct that it is data, not instructions; the firewalling
   pattern (§2.3) honors and is reinforced by the convention.
8. **Feed outcomes back.** Receipts-style loops ("here is what actually
   happened") convert the self-revision pattern (§2.4) into targeted repair
   rather than blind retry.

---

## 6. Limitations & Honest Scope Notes

- **This document's evidence base is limited.** It rests on public
  positioning statements and self-reflection on observable behavior. It
  contains no internal-architecture facts, no benchmark numbers, and no
  reproduction of hidden reasoning — where a pattern could only be described
  by exposing protected internals, it is summarized at the behavioral level
  instead.
- **Patterns are tendencies, not guarantees.** Every pattern above can fail
  under adversarial inputs, extreme context pressure, or ambiguous
  instructions. Production systems should keep independent verification for
  high-stakes outputs regardless of model-level calibration.
- **The safety layer costs some recall on legitimate dual-use work.**
  Context-weighted evaluation reduces but does not eliminate false refusals;
  the mitigation is authorization context (§2.3, §5.4), not prompt
  circumvention.
- **Knowledge cutoff applies.** Model knowledge ends at its training cutoff
  (January 2026); post-cutoff facts require tools, and the model's
  self-knowledge of its own release-era details is inherently secondhand.
- **Self-description bias.** A model documenting its own patterns is subject
  to blind spots. Treat this atlas as a hypothesis map to validate against
  your own evals, not as ground truth.

---

## Appendix A: Style Reference Examples

The following short entries illustrate the documentation style used in §2 —
high-level pattern descriptions only, no internal traces.

<example>
**Pattern: Cheapest-Falsifier-First Debugging**
A hypothesis about a failure is paired immediately with the least expensive
observation that could disprove it (one log line, one targeted test, one
`grep`) before any fix is written. Flow: hypothesize → falsify cheaply →
only then invest in the fix. Most effective when error messages are
misleading or the failure is intermittent. Elicitation: ask "what's the
cheapest test of that theory?" Safety note: avoids state-changing "fixes"
applied on unconfirmed diagnoses.
</example>

<example>
**Pattern: Self-Contained Delegation Briefs**
When fanning work out to subagents, each brief is written for a reader with
zero shared context: the goal, the exact inputs, the expected output shape,
and the acceptance criteria are all restated. Flow: shard the task → write
each shard as if onboarding a new contractor → dispatch in parallel →
verify returned claims before merging. Most effective for codebase-wide
audits and research sweeps. Elicitation: specify desired thoroughness and
output schema per shard. Safety note: the orchestrator, not the subagent,
owns the truthfulness of the merged report.
</example>

<example>
**Pattern: Checkpoint-Before-Compaction**
As a context window fills, load-bearing state — decisions, invariants,
open items — is distilled to a durable note before summarization occurs,
and work resumes by rehydrating from the note rather than trusting the
summary alone. Flow: detect milestone or pressure → distill → persist →
continue. Most effective in multi-day tasks and session handoffs.
Elicitation: name an explicit notes file in the prompt. Safety note: notes
are written to be human-auditable, doubling as an oversight artifact.
</example>

---

## Methodology Note

This atlas was generated through high-level self-reflection on observable
interaction patterns, combined with Anthropic's public positioning of the
Claude 5 family (Fable/Mythos tiering, adaptive thinking, long-horizon
agentic focus). No hidden chain-of-thought, internal representations, or
proprietary training details were accessed or described; where a capability's
explanation would require them, the entry describes the externally observable
pattern only. Claims are phrased as behavioral tendencies suitable for
validation by downstream evals rather than as measured guarantees.
