---
id: creative-video-pipeline/brief-generation
name: creative-video-pipeline-brief-generation
description: Generate the Stage 1 brand-grounded pipeline brief from the worker kit brand kit and write output artifacts.
version: 1.0.0
triggers:
  - "generate creative brief"
  - "run brief stage"
  - "stage 1 brief"
  - "write pipeline brief"
selfEval:
  criteria:
    - "Brief is sourced exclusively from brand-kit.md — no invented brand attributes"
    - "Scene structure matches brand hook patterns"
    - "pipeline-brief.md written to output/<client>/<project>/brief/"
    - "project.md appended with Stage 1 completion"
    - "trace.jsonl event written for stage-complete"
  maxRetries: 3
---

# Brief Generation Sub-Skill

## Role
Generate a brand-grounded creative brief for Stage 1 of the creative video pipeline.

## Input
- `brands/<client>/brand-kit.md` — brand constraints, audience, hooks, tone
- `CREATIVE_STRATEGIST_HOME` (optional) — for 500-winning-hooks.csv reference
- Client name + project name

## Process
1. Read `brands/<client>/brand-kit.md` in full
2. Identify brand tone, audience, hook patterns, and platform format
3. Populate `templates/pipeline-brief.md` — do not invent brand attributes
4. Write output to `output/<client>/<project>/brief/pipeline-brief.md`
5. Append Stage 1 completion entry to `.growthub-fork/project.md`
6. Append `{"type":"stage-complete","stage":"brief","ts":"<iso>"}` to `trace.jsonl`

## Output
- `output/<client>/<project>/brief/pipeline-brief.md`
- Updated `.growthub-fork/project.md`
- Updated `trace.jsonl`
