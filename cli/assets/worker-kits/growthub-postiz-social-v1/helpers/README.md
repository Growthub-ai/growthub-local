# `helpers/` — safe shell tool layer (primitive #6)

A **helper** is a small, deterministic script an agent invokes via one shell call instead of reconstructing a raw pipeline inline. Helpers are reviewable, deterministic, and safer than raw commands.

## Convention

```
helpers/
├── README.md                 # this file
├── <verb>.sh                 # single-purpose shell scripts
├── <verb>.mjs                # optional: Node-based helper
└── <verb>.py                 # optional: Python-based helper
```

Every helper:

1. Carries a one-line header comment: what it does + how to invoke it.
2. Uses `set -euo pipefail` (or equivalent) — no silent failures.
3. Has a matching row in the parent `SKILL.md`'s `helpers[]` frontmatter.
4. Is referenced from `skills.md` at the step the agent should invoke it (no duplicated shell bodies).

## When to promote an inline snippet

- Appears more than once in `skills.md`.
- Has fragile quoting or path interpolation.
- Calls a side-effecting binary (ffmpeg, git, gh, npm install).
- Multiple sub-skills invoke it.

See the parent `SKILL.md` `helpers[]` array for the current roster.
