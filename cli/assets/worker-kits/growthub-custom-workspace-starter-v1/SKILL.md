---
name: growthub-custom-workspace-starter
description: Baseline primitive for every Growthub governed workspace. Routing menu for the Custom Workspace Operator — delegates to the operator runbook (`skills.md`), the session-memory template (`templates/project.md`), the self-evaluation contract (`templates/self-eval.md`), the safe-shell helpers layer (`helpers/`), and the parallel sub-skill convention (`skills/`). Invoked when the user starts a greenfield workspace via `growthub starter init`, imports a GitHub repo or skills.sh skill via `growthub starter import-repo`/`import-skill`, or downloads this kit directly via `growthub kit download`.
triggers:
  - greenfield workspace
  - starter init
  - custom workspace
  - import repo
  - import skill
  - baseline primitive
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Scaffolded tree matches kit.json frozenAssetPaths.
    - .growthub-fork/ carries fork.json + policy.json + trace.jsonl.
    - .growthub-fork/project.md seeded from templates/project.md.
    - Operator contract read before any material change.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers: []
subSkills: []
mcpTools: []
---

# Custom Workspace Starter — Baseline Primitive

Every Growthub governed workspace is materialised from this kit. The kit ships the `.growthub-fork/` contract (identity, policy, trace, optional authority) plus the six primitive layers Claude/Cursor/Codex agents operate against:

1. **`SKILL.md`** — this file. Discovery entry + routing menu. Always loaded first; the full operator runbook (`skills.md`) is disclosed progressively when work begins.
2. **`skills.md`** — the deep operator runbook. Everything the operator agent needs to actually customise the workspace. Unchanged from v1.
3. **`templates/project.md`** — session-memory template. On `growthub starter init` and `growthub starter import-*`, the CLI copies this to `.growthub-fork/project.md` so every fork starts with an append-only editing history alongside the machine-readable `trace.jsonl`.
4. **`templates/self-eval.md`** — self-evaluation pattern. Describes the generate → render → evaluate → retry (≤3) loop that mirrors the Fork Sync Agent's preview → apply → trace lifecycle.
5. **`helpers/`** — safe shell tool layer. Scripts an agent calls via one shell invocation instead of reconstructing raw commands. Populated per fork; the baseline ships conventions only.
6. **`skills/`** — nested sub-skill convention. Each sub-directory is a full `SKILL.md`-addressable sub-skill that a parent agent can spawn in parallel for heavy or narrow tasks.

## When to use this skill

- User says: "start a new custom workspace", "scaffold a fork", "import this repo into a workspace", "bring this skill into a fork".
- An agent has just been dropped into a directory that contains `.growthub-fork/fork.json` — this is the SKILL.md that routes the agent into the right operator flow for that fork.

## Decision tree

```
Did the user ask to CREATE a new workspace?
├── Yes → route to `growthub starter init --out <path>` (greenfield)
│         or `growthub starter import-repo <owner/repo> --out <path>`
│         or `growthub starter import-skill <owner/repo/skill> --out <path>`
│         Afterwards: open the fork + read `.growthub-fork/project.md` (just seeded).
│
└── No  → the fork already exists. Read in this order:
          1. `.growthub-fork/project.md`      — session memory (your own prior state)
          2. `SKILL.md` (this file)           — routing menu
          3. `skills.md`                      — operator runbook
          4. `workers/custom-workspace-operator/CLAUDE.md` — agent contract
          5. `.growthub-fork/policy.json`     — what you may touch
          6. `.growthub-fork/trace.jsonl`     — machine history (tail 20)
```

## Self-evaluation (primitive #4)

After each material change to the fork:

1. Append an entry to `.growthub-fork/project.md` (human-readable: what you tried, why, outcome).
2. Append a typed event to `.growthub-fork/trace.jsonl` via `appendKitForkTraceEvent` — never bypass.
3. Check against `selfEval.criteria` above. If failed, retry up to `maxRetries: 3` — then stop and park with a `needs_confirmation` note in `project.md`. Do not loop indefinitely.

See `templates/self-eval.md` for the concrete template.

## Session memory (primitive #3)

`.growthub-fork/project.md` is the single cross-session continuity surface. Write to it:

- before you begin each session (what you plan),
- after each material change (what you did),
- at approval boundaries (what the user approved / rejected),
- at self-eval boundaries (retry count, outcome).

`project.md` is human-readable; `trace.jsonl` is machine-readable. The two are kept in sync by the CLI's fork primitives — you never pick one over the other.

## Sub-skills (primitive #5)

If this fork declares sub-skills under `skills/<slug>/SKILL.md`, list them below. Spawn a sub-agent per sub-skill only when the work is (a) heavy enough that isolating context helps, or (b) narrow enough that a specialist lane is clearer than a generalist lane.

(None declared at the baseline; forks populate this as the workspace evolves.)

## Helpers (primitive #6)

Helpers live under `helpers/`. When an existing shell snippet in `skills.md` is re-used in multiple sessions, extract it into `helpers/<verb>.sh`, add a row to `helpers/README.md`, and add an entry to this frontmatter's `helpers[]` array. Agents then call one shell file rather than reconstructing the snippet — safer, reviewable, consistent.

(None declared at the baseline; see `helpers/README.md` for the pattern.)

## MCP routing (optional)

If a concrete MCP server is available for this fork, list its tool IDs in `mcpTools[]`. Growthub's baseline ships declarative-only routing vocabulary — the CLI does not run an MCP server at v1. This field lets future MCP integration light up additively without a breaking change.

## Execution verbs (from `workers/custom-workspace-operator/CLAUDE.md`)

- `growthub starter init --name <workspace> --out <path>` — scaffold a new workspace from this kit
- `growthub starter import-repo <ref> --out <path>` — scaffold from a GitHub repo
- `growthub starter import-skill <ref> --out <path>` — scaffold from a skills.sh skill
- `growthub kit fork status <fork-id>` — drift check
- `growthub kit fork heal <fork-id> [--dry-run | --background]` — preview + apply heal
- `growthub kit fork policy --fork-id <fork-id> --set <key=value>` — configure safety envelope
- `growthub kit fork trace --fork-id <fork-id> --tail N` — replay the event log
- `growthub skills list [--json]` — enumerate every SKILL.md (this fork + nested)
- `growthub skills validate` — check SKILL.md frontmatter + helper/sub-skill paths
- `growthub skills session show` — print the current `.growthub-fork/project.md`

## Related files

- `skills.md` — operator runbook (deep)
- `QUICKSTART.md` — first-run steps
- `runtime-assumptions.md` — what the kit expects from the host
- `output-standards.md` — where outputs go
- `validation-checklist.md` — pre-flight checklist
- `templates/project.md` — session-memory template (seed for `.growthub-fork/project.md`)
- `templates/self-eval.md` — self-evaluation template
- `helpers/README.md` — helpers convention
- `skills/README.md` — sub-skills convention
- `workers/custom-workspace-operator/CLAUDE.md` — agent contract
