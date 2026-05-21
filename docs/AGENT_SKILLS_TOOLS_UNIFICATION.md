# Agent Skills + Tools Unification Map

This map aligns Growthub Local's agent-facing skills, CLI tools, helper scripts, and markdown contracts to the AWaC L1-L5 model. It is an organizing reference, not a new architecture.

## L1 INPUT (Token Validation)

Inputs are the concrete things a human or agent brings into Growthub Local:

- GitHub repositories via `growthub starter import-repo`
- skills.sh skills via `growthub starter import-skill`
- worker kits via `growthub kit download`
- starter workspaces via `growthub starter init`
- workspace helper prompts via `growthub workspace helper query`
- Data Model objects, dashboard widgets, workflow nodes, sandbox rows, traces, and source records

Relevant markdown and skills:

- `README.md`
- `docs/FIRST_RUN_PATHS.md`
- `docs/SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md`
- `.claude/skills/growthub-discover/SKILL.md`
- `.claude/skills/growthub-worker-kits/SKILL.md`
- `.claude/skills/growthub-workspace-helper/SKILL.md`

## L2 PARSING (Data Aggregation)

The parser layer normalizes inputs into one governed workspace shape:

- `growthub.config.json`
- `apps/workspace`
- `.growthub-fork/fork.json`
- `.growthub-fork/policy.json`
- `.growthub-fork/trace.jsonl`
- `SKILL.md`, `AGENTS.md`, `helpers/`, `skills/`, `templates/`, and `workers/`

Relevant contracts:

- `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`
- `docs/WORKSPACE_CONFIG_CONTRACT_V1.md`
- `docs/SKILLS_MCP_DISCOVERY.md`
- `docs/WORKER_KIT_CONTRACT_V1.md`
- `docs/KIT_PUBLISH_CONTRACT_V1.md`

## L3 HEURISTICS (Strategy Selection)

The strategy layer chooses the safe path for the current task:

- start from a starter, repo, skill, worker kit, or hosted template
- use Builder for dashboards, Data Model, and workflow folder items
- use Workspace Helper for proposal-first changes
- use sandbox runs for execution proof
- use fork policy and trace for governed changes
- use deploy checks before publishing a workspace

Relevant tools and docs:

- `growthub workspace status --json`
- `growthub workspace qa --json`
- `growthub workspace deploy check --json`
- `growthub workspace upstream check --json`
- `growthub workspace helper query|apply|receipts`
- `docs/WORKSPACE_DEPLOY_FLOW.md`
- `docs/WORKSPACE_HELPER_V1.md`
- `docs/WORKSPACE_WORKFLOWS_FOLDER_ITEM_V1.md`

## L4 EXECUTION (Atom Persistence)

Execution persists atomic state through governed write paths:

- `PATCH /api/workspace` updates allowed workspace config surfaces
- `.growthub-fork/*` stores identity, policy, trace, memory, authority, and agent bindings
- `POST /api/workspace/sandbox-run` executes sandbox-backed workloads
- helper apply receipts and source records preserve assistant-applied changes
- npm packages publish the CLI and starter export path

Relevant implementation surfaces:

- `apps/workspace/app/api/workspace/route.js`
- `apps/workspace/app/api/workspace/sandbox-run/route.js`
- `apps/workspace/lib/workspace-helper.js`
- `apps/workspace/lib/workspace-helper-apply.js`
- `cli/src/commands/`
- `scripts/agent-dist-verify.sh`
- `docs/AGENT_DIST_REBUILD_GUIDE.md`
- `docs/RELEASE_DIST_REBUILD_WORKFLOW.md`

## L5 PRESENTATION (Snapshot Emission)

The presentation layer emits the workspace snapshot for humans and agents:

- README quick links
- the local Builder at `apps/workspace`
- folders, dashboards, Data Model, workflow canvas, sidecars, run traces, and Helper
- CLI JSON envelopes for agent automation
- release tarballs for npm-distributed workspace exports
- whitepapers and protocol docs for open-source onboarding

Relevant docs:

- `README.md`
- `docs/assets/agent-workspace-as-code-whitepaper-workflows.pdf`
- `docs/WORKSPACE_BUILDER_RUNTIME_V1.md`
- `docs/WORKSPACE_FOLDERS_NAVIGATION_V1.md`
- `docs/WORKSPACE_WORKFLOWS_FOLDER_ITEM_V1.md`
- `docs/GOVERNED_WORKSPACE_AGENTS.md`

## Key Equation

```text
S[k+1] = Freeze( Emit( Exec( Heur( Parse( Tokens[k+1] + D1/R1-R22 deltas ) ) ) ) )
```

## Alignment Actions

- Keep `README.md`, `AGENTS.md`, and `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md` aligned on the same product object: the governed workspace.
- Keep `.claude/skills/README.md` and `docs/SKILLS_MCP_DISCOVERY.md` aligned on skill shape, helper paths, sub-skills, and session memory.
- Keep `docs/WORKSPACE_DEPLOY_FLOW.md` and `docs/AGENT_DIST_REBUILD_GUIDE.md` aligned on CLI verification and npm release reality.
- Keep `docs/WORKSPACE_HELPER_V1.md` and `docs/WORKSPACE_WORKFLOWS_FOLDER_ITEM_V1.md` aligned with the same PATCH boundary and sandbox execution authority.
