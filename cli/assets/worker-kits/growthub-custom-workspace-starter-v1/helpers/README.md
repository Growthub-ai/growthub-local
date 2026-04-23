# `helpers/` — safe shell tool layer (primitive #6)

A **helper** is a small, deterministic script an agent invokes via one shell call instead of reconstructing a raw pipeline inline. Helpers are:

- **Reviewable.** They live in the repo; diffs are inspectable.
- **Deterministic.** Pinned inputs and outputs; no hidden state.
- **Safer.** Agents call `bash helpers/<verb>.sh <args>` instead of re-assembling a 4-line `ffmpeg` / `grep` / `python` pipeline every session.

Helpers are **not** capability nodes, and they do not cross policy boundaries. Anything that requires auth, hosted execution, or network reach lives in the CLI (`growthub <verb>`) or in MCP routing — not here.

## Convention

```
helpers/
├── README.md                 # this file
├── <verb>.sh                 # short, single-purpose shell scripts
├── <verb>.mjs                # optional: Node-based helper when shell is too weak
└── <verb>.py                 # optional: Python-based helper for CSV / data work
```

Every helper ships with:

1. A one-line comment at the top: what it does + the one command that invokes it.
2. `set -euo pipefail` (or the language equivalent) — no silent failures.
3. A matching row in the parent `SKILL.md`'s `helpers[]` frontmatter array:
   ```yaml
   helpers:
     - path: helpers/grep-hooks.sh
       description: 3-pass hook-library search against the frozen 500-hook CSV
   ```
4. A matching entry in `skills.md` pointing to the helper at the place the agent should invoke it (no duplicated shell bodies).

## When to promote an inline snippet into a helper

Promote when any of these are true:

- The same snippet appears in `skills.md` more than once.
- The snippet has fragile quoting or path interpolation.
- The snippet calls a side-effecting binary (`ffmpeg`, `git`, `gh`, `osascript`, `npm install`).
- Multiple sub-skills invoke the same snippet.

## Baseline ships zero helpers on purpose

The starter kit carries the convention only. Individual worker kits (creative-strategist, hyperframes, video-use, etc.) populate `helpers/` with concrete scripts — those are the reference implementations. This keeps the baseline surface minimal and predictable.
