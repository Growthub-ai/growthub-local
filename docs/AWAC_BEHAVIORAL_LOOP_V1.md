# AWaC Behavioral Loop V1

Companion to [`docs/AWAC_ELIGIBILITY_CALCULUS_V1.md`](./AWAC_ELIGIBILITY_CALCULUS_V1.md) and [`docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`](./CAUSATION_ITT_ELIGIBILITY_DRIVERS.md).

This document records the behavioral architecture of the workspace: the deliberate, codified customer journey from quickstart checklist to Workspace Lens to helper widget to per-record cockpit, the scaffolding-with-fading design that makes the gamified layer dissolve into personalized operation, and the distillation flywheel that converts daily use into assistant intelligence. Every claim below is anchored to a literal in the repository.

## Verified Literals

The behavioral design is not folklore; it is written down in the artifact:

- `docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md` defines **Causation ITT** as *information-theoretic transformation*: high-entropy workspace state, a pure deriver, low-entropy guidance, governed action, recomputation. It states verbatim: *"This is the dopamine loop without hidden state: each useful action creates evidence, and evidence makes the next visible state better."*
- `apps/workspace/lib/workspace-activation.js` (workspace starter) documents the handoff in a code comment: *"The walkthrough is the dopamine handoff: it appears ONLY in the in-between state — onboarding complete, Workspace Lens unlocked, but no activity yet (not a power user)."* The predicate is pure: `show = activationComplete && !hasActivity && !dismissed`.
- Activation state is **never persisted** — every checklist field is derived per render. Template-specific derivations (for example the project-management deep-link checklist) personalize the checklist to the workspace shape.
- The lens registry marks activation as the `primary` lens; the global `nextAction` falls back from the incomplete primary to the first incomplete secondary lens. This is a workspace-wide attention scheduler.
- The contribution graph derives a GitHub-style daily-activity surface from run receipts, helper receipts, and source records — counts and dates only, no secrets.
- Distillation Pipeline V1 (`helpers/harvest-cursor-traces.mjs`, `grade-raw-pairs.mjs`, `export-training-traces.mjs`, `upload-graded-traces.mjs`) harvests helper/agent traces into a governed `training-traces` object, grades them by `qualityScore`, exports rows scoring at or above threshold as Unsloth-ready `{instruction, input, output}` JSONL, and PATCHes `exported=true` back through the same governed boundary.

## The Choreography

The journey is a staged behavioral loop in which the scaffold is reapplied at progressively finer granularity and then dissolves:

```text
1. Quickstart checklist        endowed progress; visible early wins
2. Activation completes        derived, never asserted; the percentage is real
3. Liminal walkthrough         shows exactly once, in the gap between
                               "set up" and "habitual" — the dopamine handoff
4. Workspace Lens ritual       contribution graph as the daily cue;
                               nextAction as the scheduled next win
5. Helper widget               configured through the same handoff;
                               propose -> review -> apply -> receipt
6. Per-record cockpits         the checklist grammar re-derived per entity
                               (subatomic); hides itself on completion
7. Data model feeds            every action deposits rows, records, receipts
8. Distillation                graded traces train the personalized assistant
9. Better assistance           the loop reruns cheaper and smarter
```

The critical design move is **disappearance**. The walkthrough shows only in the in-between state. The cockpit hides after evidence completes it. The activation lens yields to secondary lenses once primary completes. Gamification here is scaffolding in the instructional-design sense — and scaffolding that does not fade is nagging. The product fades every scaffold on derived competence, not on a timer.

## The Honesty Constraint

This loop is distinguishable from dark-pattern gamification by one invariant, inherited from the calculus: **every reward is collateralized by real artifact progress.** There are no streaks, no fake badges, no asserted progress. The percentage is a fold over evidence; the "win" is a receipt; the variable reward is the genuinely variable shape of the user's own workspace delta. The dopamine loop and the audit trail are the same data structure. Behavioral design and governance do not trade off here — they are one mechanism.

## Citation Map

| Mechanism in the product | Behavioral science | Source |
|---|---|---|
| Trigger -> action -> variable reward -> investment; data-model feeding as the investment phase | The Hook Model | Eyal, *Hooked: How to Build Habit-Forming Products*, 2014 |
| Cockpit prompts the one eligible action at the moment ability is highest | B = MAP (motivation, ability, prompt) | Fogg, "A Behavior Model for Persuasive Design," Persuasive '09, 2009 |
| Wins as prediction-error events; derived guidance keeps reward partially unpredictable | Dopamine encodes reward prediction error | Schultz, Dayan & Montague, "A Neural Substrate of Prediction and Reward," *Science* 275, 1997 |
| `90% ACTIVATED`, `3/7` progress display | Goal-gradient effect; endowed progress | Hull, "The Goal-Gradient Hypothesis and Maze Learning," 1932; Kivetz, Urminsky & Zheng, "The Goal-Gradient Hypothesis Resurrected," *JMR* 2006 |
| Pending/Blocked steps that stay visible until resolved | Zeigarnik effect (incomplete tasks dominate memory) | Zeigarnik, 1927 |
| Scaffold that fades on derived competence (walkthrough once; cockpit hides on completion) | Instructional scaffolding and fading; zone of proximal development | Wood, Bruner & Ross, "The Role of Tutoring in Problem Solving," *J. Child Psychol. Psychiatry* 1976; Vygotsky, *Mind in Society*, 1978 |
| Contribution graph as daily cue; Lens as context-stable routine | Habit formation via context-response associations | Wood & Neal, "A New Look at Habits and the Habit–Goal Interface," *Psychological Review* 2007 |
| Optional steps, dismissable callouts, review-before-apply | Autonomy and competence as intrinsic motivators | Ryan & Deci, "Self-Determination Theory and the Facilitation of Intrinsic Motivation," *American Psychologist* 2000 |
| Next action always eligible, never out of reach | Flow: challenge calibrated to ability | Csikszentmihalyi, *Flow*, 1990 |
| Real, variably-shaped workspace deltas as reinforcement | Variable reinforcement schedules | Ferster & Skinner, *Schedules of Reinforcement*, 1957 |
| Graded trace export for assistant fine-tuning | Knowledge distillation | Hinton, Vinyals & Dean, "Distilling the Knowledge in a Neural Network," 2015 |

## The Three Congruent Access Planes

The same derivation is reachable three ways, which is what makes the loop agent-traversable:

1. **Metadata graph and lens APIs** — read the derived state directly.
2. **`PATCH /api/workspace` and helper apply** — mutate through the validated boundary.
3. **The no-code interface itself** — real end-to-end clicking, used as the human path and as the QA smoke path.

An agent can read the condition packet (goal, current state, prerequisite, tools, expected evidence — defined in the ITT doc), act through plane 2, and verify through plane 1 or 3. Human and agent run the identical behavioral loop; the agent simply does not need the dopamine.

## The Flywheel Closed

The distillation pipeline closes the loop economically: daily habitual use deposits traces; grading filters them; export trains the workspace's own assistant; the assistant lowers the cost of the next action; lower cost increases daily use. The training-data bookkeeping itself flows through the governed PATCH boundary — the flywheel is governed by the same laws it accelerates.

## Release Rule

Extensions to the behavioral layer must preserve:

- no reward without persisted evidence (no streaks, badges, or asserted progress)
- every scaffold must have a derived fade condition
- one canonical helper widget and handoff path (per the ITT doc release rules)
- the walkthrough/dismiss state lives in the governed `workspace-ui-cache` row, never in browser-only state
- trace harvesting and export remain opt-in, secret-free, and routed through the workspace API
