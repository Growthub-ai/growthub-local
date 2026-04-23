---
name: creative-strategist-v1
description: "Frozen Creative Strategist worker kit — produces video creative briefs from frozen ad formats + scene modules + a 500-hook CSV. Use when the user says: \"new creative brief\", \"creative strategist\", \"hook library\", \"scene modules\". Session memory at .growthub-fork/project.md tracks brand kits used, hook variations chosen, and per-cut self-eval outcomes across multi-day brief production."
triggers:
  - creative strategist
  - fork creative-strategist-v1
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Operator contract (workers/creative-strategist/CLAUDE.md) read before any material change.
    - .growthub-fork/project.md appended to at each material change.
    - .growthub-fork/trace.jsonl receives a typed event for each material change.
    - Kit-specific QUICKSTART / runtime-assumptions / output-standards honoured.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers:
  - path: helpers/grep-hooks.sh
    description: 3-pass keyword search over the frozen 500-winning-hooks CSV (replaces inline Step 2d shell).
  - path: helpers/extract-muse-frames.sh
    description: Deterministic ffprobe + ffmpeg wrapper for Step 2b muse-frame extraction.
subSkills:
  - name: creative-strategist-frame-analysis
    path: skills/frame-analysis/SKILL.md
mcpTools: []
---

# Growthub Agent Worker Kit — Creative Strategist

Discovery entry + routing menu for the `creative-strategist-v1` worker kit. Family: `workflow`. Agent contract: `workers/creative-strategist/CLAUDE.md`.

## When to use this skill

When the user's intent matches any of the triggers above — or when an agent has been dropped into a fork whose `.growthub-fork/fork.json` declares `kitId: "creative-strategist-v1"`.

## Decision tree

```
Fork exists (this directory contains .growthub-fork/fork.json)?
├── No  → run: growthub starter init --out <path>   (or import-repo / import-skill)
│         then: growthub kit download creative-strategist-v1 --out <path>
│
└── Yes → read in this order:
          1. .growthub-fork/project.md                         — session memory (primitive #3)
          2. SKILL.md  (this file)                             — routing menu  (primitive #1)
          3. skills.md                                         — operator runbook
          4. workers/creative-strategist/CLAUDE.md                              — agent contract
          5. QUICKSTART.md                                     — first-run steps
          6. runtime-assumptions.md                            — host expectations
          7. .growthub-fork/policy.json                        — what you may touch
          8. .growthub-fork/trace.jsonl (tail 20)              — recent machine history
```

## The six primitives (same shape across every Growthub worker kit)

1. **`SKILL.md`** — this file.
2. **Symlinked pointer** — repo-root `AGENTS.md` is authoritative.
3. **`.growthub-fork/project.md`** — session memory, seeded by the CLI from `templates/project.md` at init/import time.
4. **Self-evaluation** — generate → apply → evaluate → record; retry up to `selfEval.maxRetries` (default 3); mirrors the Fork Sync Agent's preview → apply → trace loop (primitive #4). Contract: `@growthub/api-contract/skills::SkillSelfEval`.
5. **`skills/`** — nested sub-skills for parallel sub-agents on heavy / narrow work.
6. **`helpers/`** — safe shell tool layer. Promote inline shell here whenever the same snippet is re-used.

## Self-evaluation (primitive #4)

Enforce `selfEval.maxRetries: 3`. At the ceiling, park with a `needs_confirmation` note in `project.md` and stop. Record every attempt to both `project.md` and `trace.jsonl`.

## Session memory (primitive #3)

`.growthub-fork/project.md` is the only cross-session continuity surface for this fork. Append at every material change, approval boundary, and self-eval outcome.

## Sub-skills (primitive #5)

(None declared at the baseline; populate `skills/` and the frontmatter `subSkills[]` array as specialist lanes emerge.)

## Helpers (primitive #6)

(None declared at the baseline; populate `helpers/` and the frontmatter `helpers[]` array as inline shell matures.)

## MCP routing (optional)

List concrete MCP tool IDs in `mcpTools[]` when a fork runs an MCP server for auth-heavy actions. Declarative only at v1.

## Related files

- `skills.md` — operator runbook (deep)
- `QUICKSTART.md` — first-run steps
- `runtime-assumptions.md` — host expectations
- `output-standards.md` — output locations + manifest shape
- `validation-checklist.md` — pre-flight checklist (if present)
- `templates/project.md` — session-memory template
- `templates/self-eval.md` — self-evaluation template
- `helpers/README.md` — safe shell tool layer convention
- `skills/README.md` — sub-skill convention
- `workers/creative-strategist/CLAUDE.md` — agent contract
