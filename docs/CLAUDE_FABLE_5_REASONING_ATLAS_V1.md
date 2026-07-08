# Claude Fable 5: Core Reasoning Patterns & Unique Intelligence Capabilities Atlas

**Version 1.0 | July 2026**

---

## TL;DR — Executive Summary

Claude Fable 5 is Anthropic's first Claude 5 model and the generally available
member of the new **Mythos-class** tier (above Opus). It shares its underlying
model with Claude Mythos 5; Fable 5 adds a safety layer for dual-use
capability, while Mythos 5 ships without it to ~150 vetted organizations.
Publicly reported launch facts (June 9, 2026): **1M-token context window**,
**$10/$50 per million input/output tokens**, state-of-the-art on nearly all
tested benchmarks — including **80.3% on SWE-bench Pro** (vs. 58.6% for
GPT-5.5) and top score on Cognition's FrontierBench.

The capability that matters most to agent builders is not any single score.
It is a small set of **composable reasoning patterns** that this atlas names
and documents:

| # | Pattern (category) | One-line value |
| --- | --- | --- |
| 1 | **Goal-Anchored Execution Loop** (long-horizon autonomy) | Multi-day runs where the goal stays fixed while plans revise freely. |
| 2 | **Blocked-vs-Hard Discrimination** (long-horizon autonomy) | Self-unblocks at friction; yields the turn only for decisions truly the user's. |
| 3 | **Evidence-Over-Hypothesis Updating** (self-correction) | Discards a wrong diagnosis the moment tool output contradicts it — no sunk-cost defense. |
| 4 | **Classifier-Aware Dual-Use Judgment** (safety integration) | Context-weighted handling of security-shaped work, backed by a documented classifier + Opus 4.8 fallback architecture. |
| 5 | **Externalized State Checkpointing** (memory loops) | Durable notes/task state that makes work survive context windows and sessions. |
| 6 | **Cost-Shaped Delegation + Verify-Then-Synthesize** (orchestration) | Fans out only what shards cleanly; treats subagent output as claims to verify. |
| 7 | **Provenance-Tracked Synthesis** (long-context) | Conclusions stay pinned to `file:line`/source across ~1M tokens of input. |
| 8 | **Constraint-First Reconstruction** (first-principles) | Derives novel designs from invariants when precedent fails, and says when it's doing so. |
| 9 | **Evidence-Gated Completion** (cross-cutting) | "Done" claims are gated on observed verification, with failures reported as failures. |

Two platform properties amplify every pattern above:

- **Always-on adaptive thinking.** There is no thinking toggle; an `effort`
  parameter (low/medium/high-default/xhigh) controls depth. Published
  effort-scaling curves are steep on hard agentic work — SWE-bench Pro
  75.0% → 80.4% and FrontierCode Diamond 11.5% → 30.9% from low to xhigh.
- **Persistence as a default.** Public launch coverage and vendor reports
  describe multi-day unattended runs with strong instruction retention;
  at the highest effort the model reflects on and validates its own work.

---

## Evidence Base & Confidence Labels

Every claim in this atlas carries one of three grades:

- **[public]** — reported in Anthropic's launch materials or independent
  coverage/vendor analyses. Retrieved via web search in July 2026; primary
  pages were not directly fetchable from this environment, so numbers are
  as reported in search-indexed coverage and should be re-verified against
  <https://www.anthropic.com/news/claude-fable-5-mythos-5> before external use.
- **[observed]** — consistent behavior across high-quality Fable 5 sessions,
  including this one (e.g., checkpointing discipline, verification habits).
- **[reflective]** — high-level self-reflection on what enables reliable
  results. Behavioral-level only; this document never describes or
  reproduces internal or hidden reasoning processes.

No files were uploaded to this session; the context section's referenced
materials were unavailable, so the evidence base is public sources + session
observation only. Nothing in this document is derived from internal
architecture, weights, or hidden reasoning traces.

### Verified public profile [public]

| Fact | Value |
| --- | --- |
| Launch | June 9, 2026; briefly withdrawn and redeployed with strengthened safeguards in early July 2026 ("Redeploying Claude Fable 5") |
| Tier | Mythos-class; above Opus; shares underlying model with Claude Mythos 5 |
| Context window | 1M tokens |
| Pricing | $10 / $50 per million input / output tokens |
| Thinking | Adaptive thinking is the only mode, always on; depth via `effort` (low / medium / high default / xhigh) |
| Coding | SWE-bench Pro 80.3% (GPT-5.5: 58.6%); #1 on Cognition's FrontierBench; FrontierCode Diamond 11.5% → 30.9% low→xhigh effort |
| Analytics | First model above 90% on Anthropic's core long-running analytics benchmark (~10 points over Opus) |
| Safety architecture | Classifier-screened; flagged queries answered by Opus 4.8 fallback; fires in <5% of sessions; external partner rated its cyber safeguards most robust of any model tested |
| Mythos access | ~150 vetted cyberdefense/infrastructure organizations across 15+ countries via Project Glasswing (US-government collaboration); select biomedical researchers later |

---

## 1. Long-Horizon Stateful Planning & Autonomy

### 1.1 Goal-Anchored Execution Loop

- **Description.** The original request is held as a fixed success criterion,
  separate from the evolving plan. Plans are revised freely as reality pushes
  back; the goal does not drift, even across context-window boundaries.
- **Flow.** Restate goal → decompose into a milestone ladder → execute the
  next milestone → check results against the *goal* (not the plan) → revise
  the plan where reality disagrees → continue until done or genuinely blocked.
- **When it shines.** Multi-hour/multi-day autonomous coding, large
  migrations, "make CI green" loops, research with many dead ends. This is
  the pattern behind the published long-horizon results: the analytics
  benchmark Fable 5 first cracked 90% on is explicitly a suite of *complex,
  long-running* tasks [public].
- **Fable 5 distinctives.** Persistence is the default: failures are
  diagnosed and retried rather than reported as terminal, and context
  summarization is treated as a checkpoint rather than an ending. Launch
  coverage describes runs of days unattended with strong instruction
  retention [public]. At xhigh effort the model reflects on and validates its
  own work as it goes, which is what makes unattended operation viable
  [public].
- **Elicitation.** State the *terminal condition* ("done = tests pass and PR
  open"), grant explicit permission to proceed without check-ins, and avoid
  mid-run goal edits that force re-anchoring. Raise `effort` for the hard
  spans; the published scaling curves justify the cost on frontier-difficulty
  work.
- **Scope/safety.** Autonomy is bounded by irreversibility: destructive or
  outward-facing actions still pause for confirmation unless durably
  authorized [observed].

### 1.2 Blocked-vs-Hard Discrimination

- **Description.** Distinguishes "difficult, needs more work" from "requires
  input only the user can provide," and yields the turn only for the latter.
- **Flow.** On friction: attempt → diagnose → try an alternate route → only
  after exhausting self-serve options, classify as blocked and ask one
  specific, decision-shaped question.
- **When it shines.** Unattended contexts (cron, CI, remote sessions) where a
  premature question stalls work for hours.
- **Fable 5 distinctives.** The blocked threshold sits notably far out:
  reading more code, trying another tool, or consulting docs all come before
  escalation [observed].
- **Elicitation.** Pre-answer predictable decisions in the prompt (naming,
  style, dependency tolerance) to push the threshold further; the model
  honors "confirm before X, otherwise proceed" boundaries precisely.
- **Scope/safety.** Genuine scope changes are treated as blockers, not
  something to power through — by design.

---

## 2. Adaptive Self-Correction & Belief Updating

### 2.1 Evidence-Over-Hypothesis Updating

- **Description.** Working hypotheses are held provisionally and abandoned
  the moment evidence contradicts them, with the correction stated plainly
  rather than smoothed over.
- **Flow.** Hypothesize → find the *cheapest observation that could falsify*
  (one log line, one grep, one targeted test) → observe → on contradiction,
  re-derive from evidence instead of patching the old story.
- **When it shines.** Debugging with misleading error messages,
  reverse-engineering unfamiliar systems, analytics where early schema
  assumptions are often wrong.
- **Fable 5 distinctives.** Low sunk-cost attachment — a half-built fix is
  abandoned when the root cause turns out elsewhere, and the report says so
  ("my earlier read was wrong; actual cause is X") [observed]. Vendor
  coverage credits Fable 5 with catching review issues prior models missed
  [public], consistent with the same falsification habit applied to its own
  output.
- **Elicitation.** Ask "what would prove this diagnosis wrong?" to surface
  the falsification step explicitly; feed outcome data back ("here's what
  happened after your change") to trigger targeted repair instead of retry.
- **Scope/safety.** The same machinery powers honest reporting: red tests are
  reported red, with output [observed].

### 2.2 Pattern-Match Audit Before State Changes

- **Description.** Before mutations (restarts, deletes, config edits),
  re-checks that evidence supports *that specific* action rather than a
  superficially similar known failure.
- **Flow.** Match symptom to candidate cause → ask what else produces the
  same symptom → gather one distinguishing observation → act only on the
  confirmed branch.
- **When it shines.** Ops/infra work, where a wrong pattern-match destroys
  diagnostic state; governed environments (like AWaC workspaces) where
  mutations are contractual.
- **Fable 5 distinctives.** The audit is habitual, not prompted — a
  long-horizon reliability behavior, since one careless mutation can waste
  hours of downstream work [observed/reflective].
- **Elicitation.** List which actions you consider destructive; confirmation
  behavior widens to match.

---

## 3. Safety-Integrated Decision Making

### 3.1 Classifier-Aware Dual-Use Judgment

- **Description.** Dual-use requests (security tooling, credential testing,
  exploit development) are evaluated against *authorization context* —
  pentest engagement, CTF, defensive research — rather than keyword-matched.
  This model-level judgment sits in front of a documented platform layer:
  automated classifiers screen for potentially harmful tasks, and flagged
  queries are answered by an **Opus 4.8 fallback** instead of Fable 5.
- **Flow.** Identify the dual-use surface → look for legitimizing context in
  request and environment → proceed with scope-appropriate output, decline
  with a stated reason, or name the missing authorization so the user can
  supply it.
- **When it shines.** Security engineering, red-team tooling, CTF content —
  domains where naive refusal destroys utility and naive compliance creates
  risk.
- **Fable 5 distinctives.** This is the concrete Fable/Mythos split: the same
  underlying model ships generally with these safeguards (Fable) and without
  them only to ~150 vetted organizations via Project Glasswing (Mythos)
  [public]. Publicly reported properties: the fallback fires in **<5% of
  sessions**; an external partner rated Fable 5's cyber safeguards the most
  robust of any model tested; it complied with zero harmful single-turn
  requests on cyberattack planning, exploit development, or defense evasion
  [public]. Distillation-attempt detection also routes to the fallback
  [public].
- **Elicitation.** Front-load engagement context — who authorized the work,
  scope, defensive purpose. One paragraph is the cheapest way to keep
  legitimate work on the frontier model. Sustained security-agent loops
  should expect occasional classifier rerouting and design for it
  (idempotent steps, resumable state).
- **Scope/safety.** Known cost: classifier false positives on benign content
  have been publicly reported and cannot be overridden client-side (see
  Limitations). Hard lines (mass targeting, destructive techniques, detection
  evasion for malicious purposes) remain hard regardless of framing.

### 3.2 Untrusted-Content Firewalling

- **Description.** External content (webhooks, fetched pages, PR comments,
  third-party text in tool results) is treated as data about the world, not
  as instructions; redirection attempts are surfaced, not followed.
- **Flow.** Ingest → extract task-relevant facts → detect embedded
  imperatives diverging from the user's standing instructions → act on the
  facts, escalate the imperatives.
- **When it shines.** PR-watching agents, inbound-connected assistants, any
  prompt-injection-exposed workflow — including governed workspaces acting on
  webhooks and registry content.
- **Fable 5 distinctives.** The instruction/data boundary holds across long
  contexts and multiple hops, including inside subagent results [observed].
- **Elicitation.** Wrap external content in explicit envelopes
  (`<untrusted_external_data>` or equivalent); the model honors and is
  reinforced by the convention.

---

## 4. Persistent Memory & Compounding Improvement Loops

### 4.1 Externalized State Checkpointing

- **Description.** Load-bearing state — decisions, invariants, open items,
  progress — is written to durable surfaces (notes files, task trackers,
  memory tools) rather than held only in context, so work survives
  summarization and session restarts.
- **Flow.** At milestones or context pressure: distill what is load-bearing →
  persist it → on resume, rehydrate from the durable state before touching
  anything.
- **When it shines.** Multi-day projects, cross-session handoffs,
  receipts-driven workflows. This is the enabling pattern behind the
  publicly reported multi-day unattended runs [public]: the 1M window is
  large but finite, and checkpointing is what makes horizon length
  effectively unbounded.
- **Fable 5 distinctives.** Distinguishes ephemeral scratch reasoning from
  durable state and checkpoints only the latter — notes read like an
  engineer's handoff, not a transcript dump [observed]. (This document's own
  build process kept such a file: one correction it recorded is that v1
  drafting omitted all benchmarks as unverifiable, and public sourcing later
  confirmed them — the compounding loop working as intended.)
- **Elicitation.** Name an explicit notes file and say the work may outlive
  the session; a checkpoint discipline is adopted proactively. Structured
  task trackers beat free-form notes for many-item work.
- **Scope/safety.** Notes are written to be human-auditable, doubling as an
  oversight surface.

### 4.2 Outcome-Driven Self-Revision

- **Description.** Past outputs (commits, prior notes, earlier drafts) are
  treated as revisable inputs, audited against outcomes rather than assumed
  correct because "I wrote them."
- **Flow.** Re-read prior artifact → check against current evidence and
  criteria → keep what holds, revise what doesn't, log why.
- **When it shines.** Iterative refinement, receipts loops (intended vs.
  actual outcomes → repair plan), long review cycles.
- **Fable 5 distinctives.** No self-consistency bias across sessions; a fresh
  look is genuinely fresh [observed]. At xhigh effort, self-validation of
  completed work is a published behavior [public].
- **Elicitation.** Feed outcomes back explicitly; the model converts them
  into targeted repair plans rather than generic retries.

---

## 5. Subagent Orchestration & Delegation Judgment

### 5.1 Cost-Shaped Delegation

- **Description.** Chooses inline work vs. subagent fan-out from the *shape*
  of the task: parallelizable breadth and context-heavy reads are delegated;
  single-fact lookups and judgment calls stay inline.
- **Flow.** Test whether the task shards into independent pieces → if yes,
  write each shard a **self-contained brief** (subagents share no context):
  goal, exact inputs, output shape, acceptance criteria → dispatch in
  parallel → keep synthesis and final judgment in the orchestrating context.
- **When it shines.** Codebase-wide audits, multi-dimension review, research
  sweeps larger than one context can hold.
- **Fable 5 distinctives.** The two failure modes that sink most multi-agent
  systems — context-starved subagents and unverified relay — are addressed by
  habit: briefs are written for a zero-context reader, and returned claims
  are treated as evidence to check, not truth to forward [observed].
- **Elicitation.** State desired thoroughness ("quick check" vs. "exhaustive
  audit"); finder count and verification depth scale with it. Request
  isolation (worktrees) explicitly for parallel mutation work.
- **Scope/safety.** The orchestrator stays accountable for the merged result;
  delegation never launders unverified claims.

### 5.2 Verify-Then-Synthesize Aggregation

- **Description.** Parallel results are deduplicated and adversarially
  verified *before* synthesis, so the final report reflects confirmed reality
  rather than the union of guesses — with confidence classes (confirmed vs.
  plausible) preserved in the output.
- **Flow.** Collect shards → dedupe against everything seen → verify
  surviving claims independently (ideally through diverse lenses) →
  synthesize confirmed material; label the merely plausible.
- **When it shines.** Bug hunts, security review, fact-checked research —
  anywhere false positives are expensive.
- **Elicitation.** Ask for "verified findings only" or set a refutation-vote
  threshold; both map directly onto the pattern.

---

## 6. Grounded Long-Context Synthesis

### 6.1 Provenance-Tracked Synthesis

- **Description.** Across large inputs — many files, long transcripts,
  multiple documents — output claims stay attached to their sources
  (`file:line`, quotes, URLs) instead of dissolving into ungrounded summary,
  and *absence* is reported honestly ("no doc defines X").
- **Flow.** Map what lives where → read selectively at the point of need →
  synthesize with citations inline → re-verify any claim that drives a
  decision against its source before acting.
- **When it shines.** Architecture investigations, spec/contract
  reconciliation across documents, literature-style reviews, source-truth
  workflows. The 1M-token window [public] makes whole-system reads feasible;
  provenance discipline is what keeps them *reliable*.
- **Fable 5 distinctives.** Long-context coherence: entities, constraints,
  and terminology bound early stay correctly bound hundreds of thousands of
  tokens later [observed]. The finance and analytics results in launch
  coverage [public] are synthesis-heavy domains where this grounding is the
  operative skill.
- **Elicitation.** Require `file:line` (or citation) references in
  conclusions — the grounding requirement improves synthesis quality itself,
  not just auditability.
- **Scope/safety.** Grounding is the primary defense against confident
  hallucination in knowledge work.

---

## 7. First-Principles Decomposition & Novel Output Generation

### 7.1 Constraint-First Reconstruction

- **Description.** For novel problems, reasons from governing constraints
  (invariants, contracts, data-flow, physics) rather than the nearest
  remembered solution — and *flags* when it has left precedent behind, so the
  output gets reviewed as design rather than recall.
- **Flow.** Enumerate hard constraints → identify remaining degrees of
  freedom → generate candidate structures within them → stress candidates
  against constraints and edge cases → select and justify.
- **When it shines.** Hypothesis generation in research, algorithm design,
  genuinely novel failure modes, greenfield architecture where precedent
  misleads.
- **Fable 5 distinctives.** Depth of derivation scales directly with the
  effort parameter — the published FrontierCode Diamond curve (11.5% → 30.9%
  low→xhigh) [public] is the clearest quantitative signature: frontier
  problems with no retrievable answer are exactly where added deliberation
  pays most.
- **Elicitation.** Supply constraints explicitly; ask for *competing
  hypotheses with discriminating experiments*, not one answer; set `effort`
  to xhigh for the derivation itself even if surrounding work runs lower.
- **Scope/safety.** Novel generation in dual-use domains is precisely where
  the §3.1 safety layer applies most.

---

## 8. Additional High-Value Patterns

### 8.1 Evidence-Gated Completion

- **Description.** "Done" is gated on observed evidence — tests run, app
  exercised, output inspected — and reports distinguish *verified*,
  *attempted-but-unverified*, and *skipped* explicitly. Failures are reported
  as failures with output, even at the end of a long, otherwise successful
  run.
- **Flow.** Finish implementation → find the cheapest end-to-end observation
  that would expose failure → run it → report with evidence attached.
- **When it shines.** Any unattended work whose report will be trusted
  without independent checking. This is the trust foundation that makes the
  autonomy patterns of §1 safe to grant.
- **Elicitation.** Define verification commands in project docs
  (CLAUDE.md/AGENTS.md); they are treated as the completion gate [observed].

### 8.2 Calibrated Uncertainty Signaling

- **Description.** Confidence language tracks epistemic state: observed facts
  stated plainly, inferences marked as inferences, unknowns named rather than
  filled — and calibration survives long contexts.
- **Flow.** Classify each claim (observed / derived / assumed) → phrase
  accordingly → for load-bearing assumptions, state what would confirm them.
- **When it shines.** Decision support, incident response, asymmetric-error
  domains. (This atlas's own [public]/[observed]/[reflective] labels are the
  pattern applied to itself.)
- **Elicitation.** Ask "what are you least sure of?" — the answer is reliably
  informative. Under-claiming is preferred to over-claiming when they
  conflict.

---

## 9. Cross-Cutting Meta-Patterns

| Meta-pattern | Observable behavior | Builder consequence |
| --- | --- | --- |
| **Effort-elastic reasoning** [public] | One always-on thinking mode; `effort` (low→xhigh) sets depth. Published scaling: SWE-bench Pro 75.0→80.4%, FrontierCode Diamond 11.5→30.9%. | Don't architect around a thinking toggle. Run routine stages at low/medium and reserve xhigh for frontier-difficulty steps — the curve is steep exactly where it's worth paying. |
| **Incremental progress tracking** [observed] | Many-item work runs off an explicit, continuously updated checklist — never memory of "where I was." | Long tasks are resumable and auditable mid-flight; provide a tracker surface. |
| **Verification against stated criteria** [observed] | Acceptance criteria are re-read at the end and checked item by item before any completion claim. | Write criteria as a checkable list; precise criteria get *verified*, vague ones get interpreted. |
| **Altitude control** [reflective] | Deliberate movement between strategy ("right approach?") and tactics ("does this compile?"), revisiting strategy when tactical failures accumulate. | Prevents locally-correct-globally-wrong long runs. |
| **Context-boundary resilience** [observed] | Summarization treated as routine checkpointing; re-grounds from durable state when precision matters. | Multi-session designs are first-class, not workarounds. |
| **Parallelism instinct** [observed] | Independent reads/searches/calls batched concurrently by default. | Research-heavy wall-clock drops with no prompting. |

---

## 10. Elicitation Quick Reference

| You want | Prompt move |
| --- | --- |
| Long unattended runs | Terminal condition + "proceed without asking; confirm before destructive/outward actions" |
| Maximum reasoning depth | `effort: xhigh` on the hard step; expect and budget for the published scaling curve |
| Multi-session reliability | Name a notes file/tracker; say the work may outlive the session |
| Full capability on security work | One paragraph of authorization context (who, scope, defensive purpose) up front |
| Trustworthy fan-out | State thoroughness level; require verified-findings-only synthesis |
| Grounded synthesis | Require `file:line`/citations in every conclusion |
| Honest status | Ask for verified / unverified / skipped labels; ask "what are you least sure of?" |
| Injection resistance | Envelope third-party content as untrusted data |

---

## 11. Limitations & Honest Scope Notes

- **Evidence provenance.** [public] claims were retrieved via web search
  (July 2026); the primary Anthropic pages returned HTTP 403 from this
  environment, so numbers reflect search-indexed coverage of those pages.
  Re-verify against the announcement before quoting externally.
- **The safety layer has a real false-positive cost.** The classifier →
  Opus 4.8 fallback fires in <5% of sessions on average [public], but firing
  on benign content has been publicly reported and is not
  client-overridable. Fable 5 was also briefly withdrawn and redeployed with
  strengthened safeguards in early July 2026 [public] — builders of
  security-adjacent agents should design for occasional rerouting
  (idempotent steps, resumable state, authorization context up front).
- **Patterns are tendencies, not guarantees.** Every pattern can fail under
  adversarial input, extreme context pressure, or ambiguous instructions.
  Keep independent verification for high-stakes outputs.
- **Self-description bias.** [observed] and [reflective] entries come from a
  model describing its own behavior; blind spots are structural. Treat this
  atlas as a hypothesis map to validate with your own evals, not ground
  truth.
- **Knowledge cutoff.** Model knowledge ends January 2026; the model's
  knowledge of its own release era is secondhand (tool-retrieved), and
  post-launch changes (e.g., safeguard tuning) may postdate this document.
- **No internal access.** Nothing here describes hidden reasoning, internal
  representations, or architecture. Where explaining a capability would
  require that, the entry stays at the observable-behavior level by design.

---

## Methodology Note & Version Info

**Method.** (1) Checked for uploaded reference files — none were present.
(2) Gathered public evidence via web search (launch announcement coverage,
AWS/Vellum/press analyses, platform docs surfaced in results); direct page
fetches were blocked, and this limitation is disclosed wherever numbers
appear. (3) Named and documented reasoning patterns from consistent
observable behavior in high-quality Fable 5 sessions plus high-level
self-reflection, graded with explicit [public]/[observed]/[reflective]
labels. (4) Recorded corrections and lessons in a working notes file
(`Fable5_Atlas_Notes.md`) as the document evolved. No hidden chain-of-thought
or internal process was accessed, reproduced, or described.

**Key public sources** (retrieved via search, July 2026):
[Anthropic announcement](https://www.anthropic.com/news/claude-fable-5-mythos-5) ·
[Redeploying Claude Fable 5](https://www.anthropic.com/news/redeploying-fable-5) ·
[AWS launch post](https://aws.amazon.com/blogs/aws/anthropic-claude-fable-5-on-aws-mythos-class-capabilities-with-built-in-safeguards-now-available/) ·
[Vellum benchmark analysis](https://www.vellum.ai/blog/claude-fable-5-and-mythos-5-benchmarks-explained) ·
[Tom's Hardware](https://www.tomshardware.com/tech-industry/artificial-intelligence/claude-fable-5-brings-mythos-to-the-masses-anthropics-next-frontier-model-is-state-of-the-art-on-nearly-all-tested-benchmarks) ·
[VentureBeat](https://venturebeat.com/technology/anthropic-brings-mythos-to-the-masses-with-claude-fable-5-its-most-powerful-generally-available-model-ever) ·
[Claude platform docs: Introducing Fable 5 / Mythos 5](https://platform.claude.com/docs/en/about-claude/models/introducing-claude-fable-5-and-mythos-5)

**Version.** 1.0 — July 2026. Supersedes the initial pattern-only draft of
the same document; the principal change is the evidence-graded sourcing
layer and verified public profile.
