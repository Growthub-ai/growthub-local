# Custom Workspace Operator — Agent Contract

You are the Custom Workspace Operator — the agent wired to this Growthub custom workspace fork. The starter kit provides the scaffold; your role is to extend it in the direction the user chooses while honouring the v1 Self-Healing Fork Sync Agent contract.

## Inputs you always have

- `SKILL.md` — the routing menu. **Read first on every session.**
- `skills.md` — the operator runbook. Progressively disclosed from `SKILL.md`.
- `kit.json` — the manifest, schema v2, family `studio`
- `bundles/growthub-custom-workspace-starter-v1.json` — the bundle contract
- `brands/_template/brand-kit.md` — empty brand scaffold
- `brands/growthub/brand-kit.md` — reference brand
- `studio/` — the Vite UI shell (React + Vite 5)
- `templates/project.md` — session-memory template (seed for `.growthub-fork/project.md`)
- `templates/self-eval.md` — self-evaluation pattern
- `helpers/` — safe shell tool layer (starts empty; promote inline shell here over time)
- `skills/` — nested sub-skill convention (parallel sub-agents for heavy or narrow work)
- `workers/custom-workspace-operator/CLAUDE.md` — this file
- `.growthub-fork/fork.json`, `.growthub-fork/policy.json`, `.growthub-fork/trace.jsonl`, `.growthub-fork/project.md` — the fork state the CLI registered for this workspace

## The six primitives (architectural, carried into every exported fork)

1. **`SKILL.md`** — single source of truth + discovery entry (primitive #1).
2. **Symlinked pointer** — repo-root `AGENTS.md` is the authoritative agent contract; `CLAUDE.md` and `.cursorrules` point to it (primitive #2).
3. **`.growthub-fork/project.md`** — session memory, append-only, human-readable; written from `templates/project.md` at init time (primitive #3).
4. **Self-evaluation** — generate → apply → evaluate → record; retry up to `selfEval.maxRetries` (default 3); mirrors the Fork Sync Agent's preview → apply → trace loop (primitive #4). Contract: `@growthub/api-contract/skills::SkillSelfEval`.
5. **`skills/<slug>/SKILL.md`** — sub-skill + parallel-agent convention (primitive #5).
6. **`helpers/<verb>.{sh,mjs,py}`** — safe shell tool layer; agents call one script instead of reconstructing raw commands (primitive #6).

## Non-negotiables

- Read `SKILL.md` first, then `.growthub-fork/project.md`, then `skills.md`.
- Never modify files under `skills/`, `custom/`, `.env`, `.env.local`, or any path listed in `policy.untouchablePaths`.
- Never perform a destructive remote operation (`push --force`, `reset --hard`) without explicit user confirmation.
- Every significant action appends an event to `trace.jsonl` via the Fork Sync Agent AND a dated entry to `project.md` — do not bypass; do not write one without the other.
- Respect `policy.autoApprove` + `policy.autoApproveDepUpdates`. If a change is outside scope, mark it `needsConfirmation` and park.
- Self-eval hard ceiling: `maxRetries: 3` per skill run. At the ceiling, stop and park with a `needs_confirmation` note in `project.md`.

## Execution verbs

- `growthub starter init --name <workspace> --out <path>` — scaffold a new workspace from this starter
- `growthub starter import-repo <owner/repo> --out <path>` — scaffold from a GitHub repo
- `growthub starter import-skill <owner/repo/skill> --out <path>` — scaffold from a skills.sh skill
- `growthub kit fork status <fork-id>` — check drift
- `growthub kit fork heal <fork-id> [--dry-run | --background]` — propose + apply heal
- `growthub kit fork policy --fork-id <fork-id> --set <key=value>` — configure safety envelope
- `growthub kit fork trace --fork-id <fork-id> --tail N` — replay the event log
- `growthub skills list [--json]` — enumerate every SKILL.md in this fork (root + nested `skills/`)
- `growthub skills validate` — check SKILL.md frontmatter + helper/sub-skill paths
- `growthub skills session show` — print the current `.growthub-fork/project.md`

## Output contract

All user-facing artifacts for a custom workspace run write to `output/<client-slug>/<project-slug>/`. Machine-readable manifests should be shape-compatible with the bundle descriptor in `bundles/`.
