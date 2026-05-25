# Growthub Custom Workspace Starter Kit — Quickstart

This kit is the canonical v1 starter primitive. Run `growthub starter init --name <workspace> --out <path>` and the CLI will:

1. Materialize this bundled asset tree at `<path>`.
2. Auto-register the directory as a kit-fork with a dedicated `forkId`, writing `<path>/.growthub-fork/fork.json` (canonical self-describing state).
3. Optionally create a GitHub remote with `growthub kit fork create --upstream <owner/repo>` flow.
4. Seed a conservative `policy.json` (`autoApprove=additive`, `remoteSyncMode=off` by default).
5. Append a `registered` + `remote_connected` trace event.

After that, every customization you make stays yours — the Self-Healing Fork Sync Agent will propose upstream additions non-destructively, honouring your policy.

## Official workspace paths

Workspace 1 stays the blank governed workspace:

```bash
growthub starter init --name "My Workspace" --out ./my-workspace
```

Workspace 2 is the opinionated project-management template path. It builds on the same app and adapter surface, but seeds API Registry, Data Source, Sandbox Environment workflow, and dashboard placeholders for project task deltas. It stores no provider secrets, OAuth connection ids, or provider task data.

```bash
growthub starter init \
  --name "Project Management Workspace" \
  --out ./project-management-workspace \
  --seed-config project-management
```

After export, set `NANGO_SECRET_KEY` in the workspace runtime, complete provider OAuth, then fill `providerConfigKey`, `connectionIds`, and project identifiers in the Data Model before running the workflow.

## Run the bundled Vite UI shell

```bash
cd studio
npm install
npm run dev          # local dev server
npm run build        # produces studio/dist
node serve.mjs       # serves the built shell
```

## Build out the agent contract

Edit `workers/custom-workspace-operator/CLAUDE.md`. This is the living contract between the CLI agent and your workspace. Add tools, skills, and output rules here.

## Healing from upstream

```bash
growthub kit fork status <fork-id>
growthub kit fork heal <fork-id> --dry-run
growthub kit fork heal <fork-id>
growthub kit fork trace --fork-id <fork-id> --tail 50
```

## Policy primer

```bash
growthub kit fork policy --fork-id <fork-id> --set \
  autoApprove=additive \
  untouchablePaths+=studio/src/views/MyFeature.jsx \
  confirmBeforeChange+=workers/custom-workspace-operator/CLAUDE.md \
  remoteSyncMode=pr
```
