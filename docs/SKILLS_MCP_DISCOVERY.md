# Skills + MCP Discovery — v1 Reference

Public reference for the six-primitive layer that ships with every Growthub worker kit as of `@growthub/api-contract@1.2.0-alpha.1`. This doc is the neutral reference; the user-facing narrative lives in the starter kit (`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/docs/governed-workspace-primitives.md`), which ships into every fork.

## The contract

- **SDK surface:** `@growthub/api-contract/skills` — type-only, capability-agnostic.
- **Version sentinel:** `SKILL_MANIFEST_VERSION = 1`.
- **Runtime surfaces:**
  - `cli/src/skills/catalog.ts` — walks a repo or fork, returns a `SkillCatalog`.
  - `cli/src/skills/session-memory.ts` — reads `.growthub-fork/project.md`.
  - `cli/src/skills/self-eval.ts` — records a self-eval attempt to `project.md` + `trace.jsonl`.
  - `cli/src/starter/scaffold-session-memory.ts` — seeds `project.md` from a kit's `templates/project.md` at greenfield / source-import time.

## The six primitives

| # | Primitive | Where it lives in a kit | SDK field |
|---|---|---|---|
| 1 | **`SKILL.md`** — single source of truth + discovery entry | `<kit>/SKILL.md` (and `<kit>/skills/<sub>/SKILL.md`) | `SkillManifest` |
| 2 | **Symlinked pointer** — AGENTS.md as the canonical repo-root contract | repo root: `AGENTS.md`, `CLAUDE.md`, `.cursorrules` | — |
| 3 | **Session memory** — append-only human journal alongside `trace.jsonl` | fork: `.growthub-fork/project.md` · kit: `templates/project.md` | `SkillManifest.sessionMemory` |
| 4 | **Self-evaluation** — generate → apply → evaluate → record, bounded by `maxRetries` | `SkillManifest.selfEval.criteria` + `.growthub-fork/trace.jsonl::self_eval_recorded` events | `SkillManifest.selfEval` |
| 5 | **Sub-skills** — parallel-agent lanes for heavy / narrow work | `<kit>/skills/<slug>/SKILL.md` | `SkillManifest.subSkills[]` |
| 6 | **Helpers** — safe shell tool layer | `<kit>/helpers/<verb>.{sh,mjs,py}` | `SkillManifest.helpers[]` |

## Life of a fork

```
growthub starter init --out ./ws            (greenfield)
  │   or
growthub starter import-repo <ref> --out ./ws
  │   or
growthub starter import-skill <ref> --out ./ws
  │
  ▼
copyBundledKitSource ── ► materialise kit tree (includes SKILL.md + templates + helpers/ + skills/)
  │
  ▼
registerKitFork ─────── ► .growthub-fork/fork.json
writeKitForkPolicy ──── ► .growthub-fork/policy.json
appendKitForkTraceEvent► .growthub-fork/trace.jsonl  (registered + policy_updated)
  │
  ▼
scaffoldSessionMemory ► .growthub-fork/project.md   (seeded from templates/project.md)
appendKitForkTraceEvent► trace.jsonl  (skills_scaffolded)
  │
  ▼
operator agent reads (in order):
  1. .growthub-fork/project.md    (primitive #3)
  2. SKILL.md                     (primitive #1)
  3. skills.md                    (operator runbook — deep)
  4. workers/<worker>/CLAUDE.md   (agent contract)
  │
  ▼
agent drives work:
  generate → apply → self-eval (record on both surfaces) → retry ≤ maxRetries
  spawn sub-skill as needed (primitive #5) — uses same project.md journal
  invoke helpers (primitive #6) instead of reconstructing raw shell
```

## Export parity

`scripts/export-worker-kit.mjs --qa` enforces the six-primitive shape on every exported kit:

- `SKILL.md` must exist with a well-formed `name:` + `description:` frontmatter.
- `templates/project.md` and `templates/self-eval.md` must exist.
- `helpers/README.md` and `skills/README.md` must exist.
- `kit.json.frozenAssetPaths` must declare all five primitive paths.

A kit that forgets any of these cannot ship. All 13 kits in this repo pass.

## Capability-agnostic by design

The SDK contract (`@growthub/api-contract/skills::SkillSelfEval`) carries only `criteria[]`, `maxRetries`, and `traceTo`. It does not prescribe a "unit of work" — kits define their own (file edit, paragraph, rule, API call, cut boundary) in `skills.md`. Creative / video / montage kits specialise the loop per-cut in their own operator runbook; the baseline never assumes video.

## Telemetry

No new telemetry events introduced. Existing trace events added:

- `skills_scaffolded` — emitted once per fork at seed time.
- `self_eval_recorded` — emitted once per self-eval attempt.

## Related

- User-facing narrative: `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/docs/governed-workspace-primitives.md`
- Root agent contract: [`AGENTS.md`](../AGENTS.md)
- Claude Skills catalog: [`.claude/skills/README.md`](../.claude/skills/README.md)
- SDK changelog: [`packages/api-contract/CHANGELOG.md`](../packages/api-contract/CHANGELOG.md)
