# `skills/` — nested sub-skill convention (primitive #5)

A **sub-skill** is a full `SKILL.md`-addressable lane that a parent skill can spawn as a parallel sub-agent. Use sub-skills when work is:

- **Heavy** — isolating the context keeps the parent lean (e.g. frame extraction, Manim render, PIL compositing).
- **Narrow** — a specialist lane is clearer than a generalist lane (e.g. hook-library lookup, scene-module assembly).

Sub-skills are **not** CLI commands and **not** capability nodes. They are local-to-the-kit Claude/Cursor/Codex skills, discovered by walking the tree.

## Convention

```
skills/
├── README.md                        # this file
└── <slug>/                          # kebab-case; matches the SKILL.md `name`
    ├── SKILL.md                     # frontmatter + routing body (≤ 500 lines)
    ├── references/                  # optional — long docs loaded on demand
    ├── templates/                   # optional — reusable text/JS templates
    └── scripts/                     # optional — deterministic helpers
```

Each sub-skill's `SKILL.md` follows the same shape as the parent (see `@growthub/api-contract/skills::SkillManifest`):

```yaml
---
name: <slug>
description: <trigger + capability, <=1024 chars>
triggers: [ ... ]
sessionMemory:
  path: .growthub-fork/project.md      # same fork journal — sub-skills do not branch the journal
selfEval:
  criteria: [ ... ]
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers: []
mcpTools: []
---
```

## Parallelism

A parent skill spawns a sub-skill sub-agent when (a) the sub-skill's work is fully scoped by its own criteria, and (b) the parent's next step does not depend on intermediate state from the sub-skill. Each sub-skill run appends a row to the fork's `project.md::subSkillRuns` frontmatter so the parent can read the outcome on return.

Example wiring:

```
creative-strategist-v1/
└── skills/
    └── frame-analysis/
        └── SKILL.md   — parent delegates Step 2b (ffprobe + ffmpeg + frame read)
```

## Baseline ships zero sub-skills on purpose

The starter kit carries the convention only. Individual worker kits populate `skills/` as they discover specialist lanes during operation.
