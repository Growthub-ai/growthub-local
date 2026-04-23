---
# .growthub-fork/project.md — session memory primitive (v1)
#
# This file is written by `growthub starter init` / `import-repo` / `import-skill`
# (and by `growthub skills session init` inside an existing fork). It is the
# human-readable continuity surface across agent sessions — it sits alongside
# the machine-readable `trace.jsonl` without duplicating it.
#
# Rules:
#   - Append-only. Never delete a dated entry; cross it out instead.
#   - Every material change to the fork gets a paragraph here AND a typed event
#     in `.growthub-fork/trace.jsonl`. The two are kept in sync.
#   - Approvals, rejections, and self-eval outcomes all land here.
#
# Replaceable tokens (seeded at init time):
#   {{KIT_ID}}    {{FORK_ID}}    {{STARTED_AT}}    {{SOURCE}}    {{SOURCE_REF}}

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

This is your cross-session continuity surface. Return here at the start of every session; append to it at the end of every session and at every self-eval boundary.

## How to use this file

1. **Session start.** Read the last 3 entries in the "Session log" below + tail 20 events in `.growthub-fork/trace.jsonl`. State what you plan to do.
2. **Material change.** Record the change as a dated bullet in "Session log" (what, why, outcome). Simultaneously append a typed event to `trace.jsonl` via the Fork Sync Agent — never bypass.
3. **Approval boundary.** Add a row to `approvals` in the frontmatter above (include the operator's decision verbatim).
4. **Self-eval boundary.** Append to `selfEvalHistory` in the frontmatter: `attempt`, `criteria`, `outcome`, `notes`. Enforce `maxRetries: 3` from the active skill's frontmatter.
5. **Sub-skill spawn.** Append to `subSkillRuns` in the frontmatter: `subSkill`, `startedAt`, `result`.

## Session log

<!-- Append entries below, newest at the bottom. Format:

### {{YYYY-MM-DD HH:mm UTC}} · {{skill-slug}}
- **Plan.** What you intend to do this session.
- **Changes.** What you actually did (material changes only; each must correspond to a trace event).
- **Outcome.** Pass / fail / parked. Reference the self-eval criteria you checked.
- **Next.** What the next session should pick up.

-->

_No sessions recorded yet. This block is populated as the fork is operated._
