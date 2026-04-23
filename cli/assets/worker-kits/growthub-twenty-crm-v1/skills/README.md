# `skills/` — nested sub-skill convention (primitive #5)

A **sub-skill** is a full `SKILL.md`-addressable lane that a parent skill can spawn as a parallel sub-agent.

## Convention

```
skills/
├── README.md                        # this file
└── <slug>/                          # kebab-case; matches the SKILL.md name
    ├── SKILL.md                     # frontmatter + routing body (≤ 500 lines)
    ├── references/                  # optional — long docs loaded on demand
    ├── templates/                   # optional — reusable text/JS templates
    └── scripts/                     # optional — deterministic helpers
```

Each sub-skill's frontmatter follows `@growthub/api-contract/skills::SkillManifest`. Sub-skills share the parent's `.growthub-fork/project.md` journal — they do not branch it.

## Parallelism

Spawn a sub-skill sub-agent when (a) the sub-skill's work is fully scoped by its own criteria, and (b) the parent's next step does not depend on intermediate state from the sub-skill. Each sub-skill run appends a row to `project.md::subSkillRuns` so the parent can read the outcome on return.

See the parent `SKILL.md` `subSkills[]` array for the current roster.
