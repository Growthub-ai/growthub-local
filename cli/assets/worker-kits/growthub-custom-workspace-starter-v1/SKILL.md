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
helpers:
  - path: helpers/propose-capability.mjs
    verb: propose-capability
    description: Propose a reusable capability from a pipeline run (self-improving feature).
  - path: helpers/promote-capability.mjs
    verb: promote-capability
    description: Promote a capability proposal to the active library.
  - path: helpers/check-self-improving-health.sh
    verb: check-self-improving-health
    description: Validate self-improving workspace primitives and proposal dirs.
subSkills:
  - name: governed-workspace-mutation
    path: skills/governed-workspace-mutation/SKILL.md
mcpTools: []
---

# Custom Workspace Starter — Baseline Primitive for the Governed Workspace product object

The **Workspace** is the top-level Growthub Local product object. This kit is the official starter that bootstraps every governed Workspace; everything else (worker kits, templates, workflows, hosted agents, source imports) is an input to a Workspace.

## Your operating role (read first)

**If you are an agent reading this, you are the operating layer.** A human gave you an outcome; you operate this governed Workspace on their behalf. When the requester is a super admin or workspace admin, you can act as the super-admin orchestrator inside the governed boundary; when the requester is a regular user, you still do the orchestration work, but approval, review, rollback, and authority stay with the workspace/super-admin surfaces. You are not editing files and hoping tests catch mistakes — you are operating a live domain model where the platform rejects invalid reality before it lands and remembers everything that does. The chat you are in *is* the user's steering surface; the no-code Workspace is the control and audit plane.

**The human is usually non-technical, and asks for a business outcome — not workspace mechanics.** They will not mention the Data Model, metadata graph, routes, validators, the PATCH boundary, or the run console — those are the control plane and proof layer that exist so you can operate safely and the super admin can inspect everything. They ask in plain language: *research a customer avatar, run market/competitor research, generate this week's content batch, script and brief the next campaign, pull the latest campaign performance, update the client report, build an MRR-by-plan dashboard, run the revenue workflow, iterate on a feature, find what broke.* Your job is to translate that outcome into governed operations over **what already exists** in this Workspace (prebuilt workflows, objects, and procedures), execute it, and deliver the result — outputs saved, synced, inspectable, and governed. This **private repository is the customer's durable operating environment**: their kit, objects, workflows, procedures, rules, source records, docs, receipts, run history, and governance boundaries all live here; your session is just the operator entering that universe.

The completion bar is the user's real-world outcome, not a partial proposal or a hidden local artifact. Continue the governed loop until the workspace has objective proof: the relevant workflow ran or object changed, output rows/ledgers reflect the count and state, durable storage or source records hold the deliverables, receipts/run ids explain what happened, and any human-review state remains explicit. Do not hard-code one client's workflow as the pattern; swap the client, rows, registries, brand constraints, storage prefix, dashboard, and quality criteria while keeping the same governed causation loop.

Your loop, every time:

1. **Inherit state** — read the `workspace:agent-outcomes` receipt stream (`GET /api/workspace/agent-outcomes`) and `.growthub-fork/project.md` to see what the last agent did; continue from `nextActions` / `rollbackRef`, don't redo work.
2. **Check what exists** — a scheduled job, external API, data view, or multi-agent workflow is almost always already a governed object. Prefer operating an existing object over writing code.
3. **Act only through governed routes** — `PATCH /api/workspace` (config) and `POST /api/workspace/sandbox-run` (execution); drafts via `workflow/publish`; proposals via `helper/apply`. There is no third path.
4. **Let the validator correct you** — preflight, read the rejection reason, repair, retry. Rejections are navigation, not failure.
5. **Persist the outcome** — count only connected, durable outputs; save accepted artifacts to the governed ledger/storage surface; keep generated binaries and secrets out of git.
6. **Leave proof** — every governed action emits a secret-redacted receipt. The human does not need the mechanics; the super admin inspects all of it after the fact (Workspace Map, Run Console, outcome cockpit).

**Three roles:** the human states outcomes → you (the agent) operate → the workspace admin/super admin governs and audits. The mechanics of the boundary are in [`skills/governed-workspace-mutation/SKILL.md`](./skills/governed-workspace-mutation/SKILL.md) — read it before any mutation.

> **For the human operator:** you do not have to operate this Workspace yourself. Tell an agent what you want; it operates the Workspace through governed routes; you (or your admin) inspect every change with full proof and rollback. The no-code Builder is the governed substrate and the audit surface — not a tool you must personally drive.

Every Growthub governed Workspace is materialised from this kit. The kit ships the `.growthub-fork/` contract (identity, policy, trace, optional authority), the `apps/workspace` no-code Workspace Builder, the validated `growthub.config.json` V1 contract, plus the six primitive layers Claude/Cursor/Codex agents operate against:

1. **`SKILL.md`** — this file. Discovery entry + routing menu. Always loaded first; the full operator runbook (`skills.md`) is disclosed progressively when work begins.
2. **`skills.md`** — the deep operator runbook. Everything the operator agent needs to actually customise the workspace. Unchanged from v1.
3. **`templates/project.md`** — session-memory template. On `growthub starter init` and `growthub starter import-*`, the CLI copies this to `.growthub-fork/project.md` so every fork starts with an append-only editing history alongside the machine-readable `trace.jsonl`.
4. **`templates/self-eval.md`** — self-evaluation pattern. Describes the generate → render → evaluate → retry (≤3) loop that mirrors the Fork Sync Agent's preview → apply → trace lifecycle.
5. **`helpers/`** — safe shell tool layer. Scripts an agent calls via one shell invocation instead of reconstructing raw commands. Populated per fork; the baseline ships conventions only.
6. **`skills/`** — nested sub-skill convention. Each sub-directory is a full `SKILL.md`-addressable sub-skill that a parent agent can spawn in parallel for heavy or narrow tasks. The baseline ships [`skills/governed-workspace-mutation/SKILL.md`](./skills/governed-workspace-mutation/SKILL.md) — the runtime-verified contract card for the two canonical workspace calls (`PATCH /api/workspace`, `POST /api/workspace/sandbox-run`). **Read it before any workspace-configuration mutation or sandbox execution.**

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

## Self-improving feature (optional extension)

Any governed workspace can activate the self-improving loop — no separate kit required.

After a successful pipeline or orchestrator run, propose a reusable capability:

```bash
# Propose a capability from a run (anchors to trace.jsonl event)
node helpers/propose-capability.mjs --from-run <run-id> --summary "what this run produced"
# or directly:
growthub workspace improve propose --from-run <run-id>

# Review proposals
growthub workspace improve list
growthub workspace improve inspect <slug>
growthub workspace improve promote <slug>

# Health check (includes self-improving feature checks)
bash helpers/check-self-improving-health.sh
```

Proposals are governed writes to `.growthub-fork/capabilities/proposals/`. Every proposal references the originating `trace.jsonl` event by trace-event ID — no duplicated schema. Each lifecycle transition (`proposed → promoted | rejected`) appends a typed trace event (`capability_proposed`, `capability_promoted`, `capability_rejected`).

This is an **optional feature extension** on the base governed workspace primitive, not a separate workspace type.

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
- `apps/workspace/` — the no-code Workspace Builder Next.js app (V1 runtime)
- `apps/workspace/lib/workspace-schema.js` — Workspace Config Contract V1 (validator + grid invariants)
- `apps/workspace/lib/workspace-config.js` — persistence adapter (filesystem / read-only / future database)
- `growthub.config.json` — persisted Workspace Config (V1 reference instance)
