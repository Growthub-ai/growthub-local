---
# .growthub-fork/project.md — session memory primitive (v1)
#
# Seeded by `growthub kit fork register` from this template.
# Replaceable tokens: {{KIT_ID}} {{FORK_ID}} {{STARTED_AT}} {{SOURCE}} {{SOURCE_REF}}

kitId: "{{KIT_ID}}"
forkId: "{{FORK_ID}}"
startedAt: "{{STARTED_AT}}"
source: "{{SOURCE}}"
sourceRef: "{{SOURCE_REF}}"
skillManifestVersion: 1
approvals: []
selfEvalHistory: []
subSkillRuns: []

# Pipeline state (update after each stage)
pipelineState:
  stage1Brief:
    status: pending       # pending | in_progress | complete
    clientSlug: ""
    projectSlug: ""
    briefPath: ""
    sceneCount: 0
    hookVariations: 0
    completedAt: ""
  stage2Generative:
    status: pending       # pending | in_progress | complete
    adapter: ""           # growthub-pipeline | byo-api-key
    provider: ""
    artifactCount: 0
    manifestPath: ""
    completedAt: ""
  stage3Edit:
    status: pending       # pending | in_progress | complete
    videoUseForkPath: ""
    finalVideoPath: ""
    durationTarget: ""
    qaPass: false
    completedAt: ""
---

# Project journal — fork `{{FORK_ID}}`

Baseline primitive: `{{KIT_ID}}`. Seeded at `{{STARTED_AT}}` from `{{SOURCE}}` (`{{SOURCE_REF}}`).

## How to use this file

1. **Session start.** Read the last 3 entries below + tail 20 events in `.growthub-fork/trace.jsonl`. Update `pipelineState` to reflect actual completion.
2. **Stage completion.** Record a dated entry in "Session log" with: stage, client, project, key paths, self-eval outcome.
3. **Material change.** Append a dated bullet here AND a typed event to `trace.jsonl`.
4. **Self-eval boundary.** Append to `selfEvalHistory`: `attempt`, `criteria`, `outcome`, `notes`.
5. **Sub-skill spawn.** Append to `subSkillRuns`: `subSkill`, `startedAt`, `result`.

## Session log

<!-- Append entries below, newest at the bottom.

### YYYY-MM-DD HH:mm UTC · creative-video-pipeline-operator
- **Plan.** What you intend to do this session.
- **Stage.** Which stage (1/2/3) and what sub-task.
- **Changes.** What you actually did (each must correspond to a trace event).
- **Outcome.** Pass / fail / parked. Reference the selfEval criteria checked.
- **Next.** What the next session should pick up.

-->

_No sessions recorded yet. This block is populated as the fork is operated._
