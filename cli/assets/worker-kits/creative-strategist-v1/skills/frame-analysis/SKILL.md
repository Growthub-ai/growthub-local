---
name: creative-strategist-frame-analysis
description: Sub-skill of creative-strategist-v1 — runs the muse-video frame-extraction pass when no frozen ad-format matches the brief. Invokes helpers/extract-muse-frames.sh and returns a scene-map draft. Meant to be spawned as a parallel sub-agent by the parent creative-strategist skill when Step 2b of the brief runbook is triggered.
triggers:
  - muse frame extraction
  - muse analysis
  - new muse format
  - frame-by-frame analysis
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Frame count in the brief matches the muse scene count (if muse has 9 scenes, brief has 9).
    - Each frame read via the agent's file-read tool, batched at most 3 per call.
    - Tone-flip boundary (problem → solution) identified and recorded in the scene map.
    - Output scene map references helpers/extract-muse-frames.sh invocation, not inline shell.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers:
  - path: ../../helpers/extract-muse-frames.sh
    description: Deterministic ffprobe + ffmpeg wrapper — replaces the inline Step 2b shell block.
subSkills: []
mcpTools: []
---

# Creative Strategist — Frame Analysis Sub-Skill

Spawned by `creative-strategist-v1` when Step 2b of the brief runbook triggers (no frozen ad-format matches the new muse). Runs in parallel to the parent agent so the parent retains the brief's full context while this sub-agent focuses on frame extraction + scene mapping.

Source of truth for the methodology: `templates/ad-formats/frame-analysis.md` in the parent kit (loaded on demand — this SKILL.md is the routing menu, not the methodology).

## When to spawn this sub-skill

- The brief's muse does not match any entry in `templates/ad-formats/INDEX.md`.
- A new muse is being frozen into a reusable ad-format.
- The operator wants the frame-extraction work isolated so the main agent can continue drafting the brief's narrative.

## Decision tree

```
No frozen ad-format matches?
├── Yes → parent spawns this sub-skill → parallel execution:
│         1. bash helpers/extract-muse-frames.sh <muse.mp4>
│         2. Agent Read-tool over /tmp/muse_frames/*.jpg (batch ≤ 3)
│         3. Produce scene-map draft with 4 answers:
│              • scene count
│              • tone-flip boundary
│              • character / visual format
│              • text rhythm
│         4. Self-eval against criteria above; if pass, return to parent.
│
└── No → do not spawn. Parent uses the frozen ad-format directly.
```

## Sub-skill run protocol

1. Append a `subSkillRuns` row to the fork's `.growthub-fork/project.md` frontmatter: `subSkill: creative-strategist-frame-analysis`, `startedAt`, target muse path.
2. Run the helper: `bash helpers/extract-muse-frames.sh <muse.mp4>`.
3. Batch-Read up to 3 frames at a time. Do not dump raw pixel data back to the parent — summarise into the 4-answer scene map.
4. Self-evaluate against `selfEval.criteria`. Each attempt recorded to `project.md` + `trace.jsonl` via the `growthub-local` `recordSelfEval` primitive (`cli/src/skills/self-eval.ts`).
5. When `attempt === maxRetries` without pass, park with `needs_confirmation` in `project.md` and return control to the parent.

## Parent-facing return value

Return to the parent agent:

```yaml
sceneMap:
  sceneCount: <int>
  toneFlipAt: <scene index or "none">
  visualFormat: <short description>
  textRhythm: <short description>
selfEval:
  attempts: <int>
  result: pass | parked
framesDir: /tmp/muse_frames
```

## Freeze-after-run (when brief ships)

After the parent brief ships with this new muse, freeze the format by adding a row to `templates/ad-formats/INDEX.md` + a new `templates/ad-formats/<new-id>.md`. This sub-skill is only re-spawned when a new muse does not match the growing frozen set.

## What this sub-skill does NOT do

- It does not write the brief. The parent skill owns the brief.
- It does not install ffmpeg / ffprobe. Those are runtime assumptions (see `runtime-assumptions.md` at the kit root, when present).
- It does not read outside `/tmp/muse_frames/`. Agents running this sub-skill should not probe other tmp paths.
