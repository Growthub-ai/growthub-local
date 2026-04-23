# @growthub/cli

## 0.8.0

### Minor Changes

Adds the `growthub skills` command surface and the session-memory scaffold primitive. Everything is additive — no existing command, flag, or behaviour changes.

- **`growthub skills list [--json] [--root <path>]`** — enumerate every `SKILL.md` reachable from the cwd. Walks `.claude/skills/*`, `cli/assets/worker-kits/*/SKILL.md`, nested `<kit>/skills/*/SKILL.md`, and optional project-root `SKILL.md`.
- **`growthub skills validate [--json]`** — strict shape check: frontmatter bounds (`name` ≤ 64 chars, `description` ≤ 1024 chars), helper + sub-skill path existence, `selfEval.maxRetries` within recommended 1..10.
- **`growthub skills session init [--fork <path>] [--kit <id>] [--json]`** — seed `.growthub-fork/project.md` from the kit's `templates/project.md`. No-op on kits that do not ship the template. Traces a `skills_scaffolded` event when seeded inside a registered fork.
- **`growthub skills session show [--fork <path>] [--body] [--json]`** — print the session-memory head of a fork.
- **Discovery hub**: `📇 Skills Catalog` lane added under the existing Memory & Knowledge / Connect Growthub layout.
- **Greenfield + source-import**: `growthub starter init` and `growthub starter import-{repo,skill}` now scaffold `.growthub-fork/project.md` from the kit's `templates/project.md` when present. Additive trace event `skills_scaffolded`.
- **Fork trace**: new additive event types `skills_scaffolded` and `self_eval_recorded` in the `KitForkTraceEventType` union.
- **SDK pin**: `@growthub/api-contract` bumped to `1.2.0-alpha.1` — adds the `./skills` subpath export (`SkillManifest`, `SkillNode`, `SkillCatalog`, helper refs, sub-skill refs, `SkillSelfEval`, `SkillSessionMemory`, `SkillSource`, `SKILL_MANIFEST_VERSION`).

### Worker-kit primitive layer (v1.2)

Every worker kit under `cli/assets/worker-kits/*` now ships the six architectural primitives — `SKILL.md`, `templates/project.md`, `templates/self-eval.md`, `helpers/README.md`, `skills/README.md` — with the starter kit (`growthub-custom-workspace-starter-v1`) carrying the user-facing narrative doc at `docs/governed-workspace-primitives.md`. `scripts/export-worker-kit.mjs --qa` now asserts this shape on every exported kit.

Reference implementations land in `creative-strategist-v1`: `helpers/grep-hooks.sh` + `helpers/extract-muse-frames.sh` + `skills/frame-analysis/SKILL.md` (sub-skill pattern).

## 0.3.1

### Patch Changes

- Stable release preparation for 0.3.1
- Updated dependencies
  - @paperclipai/adapter-utils@0.3.1
  - @paperclipai/adapter-claude-local@0.3.1
  - @paperclipai/adapter-codex-local@0.3.1
  - @paperclipai/adapter-cursor-local@0.3.1
  - @paperclipai/adapter-gemini-local@0.3.1
  - @paperclipai/adapter-openclaw-gateway@0.3.1
  - @paperclipai/adapter-opencode-local@0.3.1
  - @paperclipai/adapter-pi-local@0.3.1
  - @paperclipai/db@0.3.1
  - @paperclipai/shared@0.3.1
  - @paperclipai/server@0.3.1

## 0.3.0

### Minor Changes

- Stable release preparation for 0.3.0

### Patch Changes

- Updated dependencies [6077ae6]
- Updated dependencies
  - @paperclipai/shared@0.3.0
  - @paperclipai/adapter-utils@0.3.0
  - @paperclipai/adapter-claude-local@0.3.0
  - @paperclipai/adapter-codex-local@0.3.0
  - @paperclipai/adapter-cursor-local@0.3.0
  - @paperclipai/adapter-openclaw-gateway@0.3.0
  - @paperclipai/adapter-opencode-local@0.3.0
  - @paperclipai/adapter-pi-local@0.3.0
  - @paperclipai/db@0.3.0
  - @paperclipai/server@0.3.0

## 0.2.7

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.7
  - @paperclipai/adapter-utils@0.2.7
  - @paperclipai/db@0.2.7
  - @paperclipai/adapter-claude-local@0.2.7
  - @paperclipai/adapter-codex-local@0.2.7
  - @paperclipai/adapter-openclaw@0.2.7
  - @paperclipai/server@0.2.7

## 0.2.6

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.6
  - @paperclipai/adapter-utils@0.2.6
  - @paperclipai/db@0.2.6
  - @paperclipai/adapter-claude-local@0.2.6
  - @paperclipai/adapter-codex-local@0.2.6
  - @paperclipai/adapter-openclaw@0.2.6
  - @paperclipai/server@0.2.6

## 0.2.5

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.5
  - @paperclipai/adapter-utils@0.2.5
  - @paperclipai/db@0.2.5
  - @paperclipai/adapter-claude-local@0.2.5
  - @paperclipai/adapter-codex-local@0.2.5
  - @paperclipai/adapter-openclaw@0.2.5
  - @paperclipai/server@0.2.5

## 0.2.4

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.4
  - @paperclipai/adapter-utils@0.2.4
  - @paperclipai/db@0.2.4
  - @paperclipai/adapter-claude-local@0.2.4
  - @paperclipai/adapter-codex-local@0.2.4
  - @paperclipai/adapter-openclaw@0.2.4
  - @paperclipai/server@0.2.4

## 0.2.3

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.3
  - @paperclipai/adapter-utils@0.2.3
  - @paperclipai/db@0.2.3
  - @paperclipai/adapter-claude-local@0.2.3
  - @paperclipai/adapter-codex-local@0.2.3
  - @paperclipai/adapter-openclaw@0.2.3
  - @paperclipai/server@0.2.3

## 0.2.2

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.2
  - @paperclipai/adapter-utils@0.2.2
  - @paperclipai/db@0.2.2
  - @paperclipai/adapter-claude-local@0.2.2
  - @paperclipai/adapter-codex-local@0.2.2
  - @paperclipai/adapter-openclaw@0.2.2
  - @paperclipai/server@0.2.2

## 0.2.1

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.1
  - @paperclipai/adapter-utils@0.2.1
  - @paperclipai/db@0.2.1
  - @paperclipai/adapter-claude-local@0.2.1
  - @paperclipai/adapter-codex-local@0.2.1
  - @paperclipai/adapter-openclaw@0.2.1
  - @paperclipai/server@0.2.1
