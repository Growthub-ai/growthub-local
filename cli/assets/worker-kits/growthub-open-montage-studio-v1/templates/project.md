---
# .growthub-fork/project.md — session memory primitive (v1)
#
# Written by the CLI at init/import time. Append-only, human-readable; sits
# alongside the machine-readable `trace.jsonl`. Approvals, self-eval outcomes,
# and sub-skill runs all record here.
#
# Replaceable tokens (seeded at init time):
#   {{KIT_ID}}   {{FORK_ID}}   {{STARTED_AT}}   {{SOURCE}}   {{SOURCE_REF}}

kitId: "{{KIT_ID}}"
forkId: "{{FORK_ID}}"
startedAt: "{{STARTED_AT}}"
source: "{{SOURCE}}"
sourceRef: "{{SOURCE_REF}}"
skillManifestVersion: 1
approvals: []
selfEvalHistory: []
subSkillRuns: []
---

# Project journal — fork `{{FORK_ID}}`

Baseline primitive: `{{KIT_ID}}`. Seeded at `{{STARTED_AT}}` from `{{SOURCE}}` (`{{SOURCE_REF}}`).

This is your cross-session continuity surface. Read the last few entries before every session; append after every material change, approval, and self-eval boundary.

## How to use this file

1. **Session start.** Read the last 3 entries + tail 20 events in `.growthub-fork/trace.jsonl`. State your plan.
2. **Material change.** Record as a dated bullet (what, why, outcome). Simultaneously append a typed event to `trace.jsonl` via the Fork Sync Agent — never bypass.
3. **Approval boundary.** Add a row to `approvals` in the frontmatter (verbatim decision).
4. **Self-eval boundary.** Append to `selfEvalHistory`: `attempt`, `criteria`, `outcome`, `notes`. Enforce `maxRetries: 3`.
5. **Sub-skill spawn.** Append to `subSkillRuns`: `subSkill`, `startedAt`, `result`.

## Session log

<!-- Append newest entries at the bottom. Format:

### {{YYYY-MM-DD HH:mm UTC}} · {{skill-slug}}
- **Plan.** What you intend to do.
- **Changes.** Material changes (each must correspond to a trace event).
- **Outcome.** Pass / fail / parked. Reference self-eval criteria.
- **Next.** What the next session should pick up.

-->

_No sessions recorded yet. Populated as the fork is operated._
