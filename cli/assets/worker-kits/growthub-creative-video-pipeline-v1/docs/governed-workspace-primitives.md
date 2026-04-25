# Governed Workspace Primitives v1.2

This kit implements the six-primitive governed-workspace contract.

## Primitive 1 — SKILL.md

Top-level `SKILL.md` at the kit root. Frontmatter declares triggers, selfEval criteria (5 items), maxRetries:3, helpers[], and subSkills[].

## Primitive 2 — AGENTS.md Pointer

`workers/creative-video-pipeline-operator/CLAUDE.md` serves as the operator contract. References the repo-level `AGENTS.md` as authoritative agent contract.

## Primitive 3 — project.md

`.growthub-fork/project.md` seeded from `templates/project.md` at fork register time via `scaffoldSessionMemory`. Contains `pipelineState` frontmatter tracking stage status.

Every stage boundary appends a log entry:
```
## Stage N Complete — <stage-name>
Date: <iso>
Output: <artifact path>
```

## Primitive 4 — selfEval

`templates/self-eval.md` provides the self-eval template. `recordSelfEval` in `cli/src/skills/self-eval.ts` is the canonical primitive. maxRetries:3 applies to all three stages.

## Primitive 5 — Sub-skills

`skills/` directory contains three sub-skill SKILL.md files:
- `skills/brief-generation/SKILL.md`
- `skills/generative-execution/SKILL.md`
- `skills/video-edit/SKILL.md`

## Primitive 6 — Helpers

`helpers/` directory contains safe shell wrappers:
- `helpers/run-pipeline.sh` — wraps `growthub pipeline execute`
- `helpers/check-generative-adapter.sh` — validates adapter env

## trace.jsonl

Machine-readable governance log. Each stage boundary writes:
```json
{"type":"stage-complete","stage":"brief","ts":"<iso>"}
{"type":"stage-complete","stage":"generative","ts":"<iso>"}
{"type":"stage-complete","stage":"edit","ts":"<iso>"}
```

Additional event types: `auth-preflight`, `adapter-selected`, `artifact-written`, `self-eval-pass`, `self-eval-retry`.
