# Self-evaluation template — v1 primitive (Growthub, capability-agnostic)

A skill's `selfEval` contract declares **what good looks like** (`criteria[]`) and **the retry ceiling** (`maxRetries`). The agent drives the loop; this file is the pattern the agent follows at every unit of work.

The contract is defined in `@growthub/api-contract/skills::SkillSelfEval` and is **capability-agnostic** — the same primitive applies to code edits, copy drafts, CRM rules, API payloads, asset renders, audit passes, and every other domain. The "unit of work" is the smallest reversible change the skill operates on; concrete boundaries are defined in the kit's own `skills.md` operator runbook, not here.

## Loop

```
for attempt in 1..maxRetries:          # default maxRetries = 3
  generate       — produce a proposal (whatever the skill produces)
  apply          — materialise the proposal against the fork
  self-evaluate  — for each criterion in skill.selfEval.criteria:
                     check → pass / fail / needs-confirmation
  record         — append to project.md (human) + trace.jsonl (machine)

  if all criteria pass: break
  if attempt == maxRetries: park with needs_confirmation note. Stop.
```

## What each attempt writes

### Human row — append to `.growthub-fork/project.md` "Session log"

```md
### 2026-04-24 · creative-video-pipeline-operator
- **Plan.** What you intend to do this unit of work.
- **Changes.** Material change applied (must correspond to a trace event).
- **Self-eval.** attempt 2/3 — criterion "<one of skill.selfEval.criteria>" ✗ (<note>). Retrying.
- **Outcome.** retry-pending / pass / parked.
- **Next.** What the next attempt (or next session) should pick up.
```

### Machine row — append to `.growthub-fork/trace.jsonl`

```json
{
  "ts": "2026-04-24T00:00:00.000Z",
  "forkId": "<fork-id>",
  "kitId": "growthub-creative-video-pipeline-v1",
  "type": "self_eval_recorded",
  "summary": "attempt 2/3 failed on <criterion>",
  "detail": {
    "skill": "<skill-slug>",
    "attempt": 2,
    "maxRetries": 3,
    "criterion": "<one of skill.selfEval.criteria>",
    "outcome": "fail",
    "notes": "<short explanation>"
  }
}
```

## Hard rules

1. **Never exceed `maxRetries`.** At the ceiling, park with a `needs_confirmation` note and stop.
2. **Record every attempt.** Even the first pass.
3. **Keep `project.md` and `trace.jsonl` in sync.**
4. **Preserve prior entries.** Append-only. Never rewrite history.

## Kit-specific self-eval units

| Stage | Unit of work |
|---|---|
| Stage 1 — Brief | Completed `pipeline-brief.md` for one creative concept |
| Stage 2 — Generate | `manifest.json` with one artifact URL per scene |
| Stage 3 — Edit | `final.mp4` exists, duration ±10% of target, QA pass |
