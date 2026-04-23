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
### 2026-04-23 18:40 UTC · <skill-slug>
- **Plan.** What you intend to do this unit of work.
- **Changes.** Material change applied (must correspond to a trace event).
- **Self-eval.** attempt 2/3 — criterion "<one of skill.selfEval.criteria>" ✗ (<note>). Retrying.
- **Outcome.** retry-pending / pass / parked.
- **Next.** What the next attempt (or next session) should pick up.
```

### Machine row — append to `.growthub-fork/trace.jsonl` (via `appendKitForkTraceEvent`)

```json
{
  "ts": "2026-04-23T18:40:00.000Z",
  "forkId": "<fork-id>",
  "kitId": "<kit-id>",
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

1. **Never exceed `maxRetries`.** At the ceiling, park with a `needs_confirmation` note and stop. Do not loop forever.
2. **Record every attempt.** Even the first pass. Continuity depends on a complete journal.
3. **Keep `project.md` and `trace.jsonl` in sync.** One without the other is a protocol violation.
4. **Preserve prior entries.** Append-only. Never rewrite history.

## Bound the blast radius

Evaluate at the smallest unit of work the skill operates on, not only at the end of a multi-step run. The retry ceiling applies to that unit — so a bad attempt does not sink the whole job.

What counts as a "unit of work" is **kit-specific** and lives in that kit's `skills.md` operator runbook — not in this agnostic template. A kit picks its own smallest reversible boundary and documents it in `skills.md`; this template does not prescribe one.

The agnostic SDK (`@growthub/api-contract/skills::SkillSelfEval`) does not encode any domain-specific boundaries — it only carries `criteria[]`, `maxRetries`, and `traceTo`. See `SKILL.md::selfEval.criteria` in this kit for the concrete checks, and `skills.md` for the kit-specific unit of work.
