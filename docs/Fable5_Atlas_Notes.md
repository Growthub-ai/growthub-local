# Fable5_Atlas_Notes.md — working memory for the Fable 5 Reasoning Atlas

**Summary:** Biggest lesson — grade every claim by provenance ([public]/[observed]/[reflective]); the v1 draft threw away real benchmark facts by treating "unverified by me" as "unverifiable," and public sourcing later confirmed them.

Entries (one lesson/correction each, newest last):

1. **No uploaded files existed.** The task context promised announcements/benchmark notes; scratchpad and home dir were empty. Lesson: verify referenced inputs before planning around them, and disclose their absence in the deliverable rather than silently proceeding.

2. **Correction from the first draft: benchmarks were real.** v1 omitted all numbers (couldn't verify "FrontierCode" from training knowledge, cutoff Jan 2026). Web search confirmed FrontierCode Diamond (11.5%→30.9% low→xhigh effort), SWE-bench Pro 80.3%, FrontierBench #1, analytics >90%. Lesson: post-cutoff ≠ unknowable — search before excluding.

3. **Primary pages 403, search synthesis works.** anthropic.com, vellum.ai, aws.amazon.com all blocked direct WebFetch via the session proxy; WebSearch returned consistent multi-source summaries. Mitigation: label all such claims [public, search-derived] and instruct re-verification before external quoting. Don't present search-derived numbers as primary-source-confirmed.

4. **Safety layer is more concrete than v1 assumed.** v1 described a generic "Fable safety layer"; public record specifies classifier screening → Opus 4.8 fallback, <5% of sessions, distillation-attempt detection, Mythos via Project Glasswing (~150 orgs, 15+ countries), plus a withdrawal/redeploy event (early July 2026) and reported false positives on benign content (not client-overridable). Lesson: the safety section must document costs and failure modes, not just design intent — that's what agent builders need.

5. **Effort parameter specifics.** Adaptive thinking is the *only* mode (no toggle); effort levels low/medium/high(default)/xhigh; xhigh adds self-reflection/validation of completed work. This moved "effort scaling" from a reflective claim to a [public] one with numbers — promoted it to a top-level meta-pattern with prescriptive guidance (route routine stages low, reserve xhigh for frontier steps).

6. **Structure lesson: evidence grading beats prose hedging.** Instead of hedging every sentence ("directionally," "appears to"), a single up-front confidence-label scheme keeps the body prose clean and honest at once. Also cut the v1 <example> appendix — the per-pattern schema already demonstrates the style, and the new spec favors signal density.

7. **Self-referential validation.** The checkpointing pattern (§4.1) and calibration pattern (§8.2) are demonstrated by this document's own build process (this notes file; the confidence labels). Used sparingly as evidence — it's [observed] from one session, not proof.

8. **Golden-path phase: recon overturned the assumed topology.** The schedule/ceo/loop/swarm "commands" are not CLI verbs — they are helper-sidecar slash commands + pure derivers inside the starter-kit workspace app, closing through two mutation lanes and one receipt stream. Two parallel Explore agents found this in one pass; designing from the atlas alone would have produced a parallel-architecture anti-pattern.

9. **The closed dopamine loop already existed as contract language.** `docs/GOVERNED_CAPABILITY_BINDING_LOOP_V1.md:60-70` names the cockpit view-model the "agent condition packet" and `outcomeStatus` the reward signal. Lesson: search for the concept in the target repo's own vocabulary before inventing new framing — the golden path became a composition task, not an invention task.

10. **Subagent-verified path corrections.** The second Explore agent falsified three skill paths named in my own brief (growthub-governed-mutation-loop, growthub-outcome-receipts-bootstrap, growthub-causal-impact-analysis — all listed in unmerged PR #276, absent on main). Lesson: session-context skill catalogs can describe a *branch*, not main; verify on-disk before citing.

11. **Zone discipline set the implementation scope.** Starter-kit runtime is core-product (version bump + six gates + maintainer dist lane), so Phase A shipped scaffolding-zone primitives (contract doc + operator skill + catalog row) with Phase B/C runtime edits specified file-exactly but labeled Proposed. Lesson: "implement the core pieces" in a governed monorepo means implementing at the highest zone you can ship cleanly and specifying the rest at file precision.

12. **One deliverable, one PR.** The golden-path work initially rode the atlas branch; the maintainer asked for separation, so it moved to its own branch/PR (#279) via cherry-pick off main, with this journal staying in the atlas PR to avoid a cross-PR file conflict. Lesson: default to a fresh branch per deliverable even when the session's designated branch makes stacking convenient.
