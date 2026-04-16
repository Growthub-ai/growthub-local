# Growthub Custom Workspace Starter Kit — Quickstart

This kit is the canonical v1 starter primitive. Run `growthub starter init --name <workspace> --out <path>` and the CLI will:

1. Materialize this bundled asset tree at `<path>`.
2. Auto-register the directory as a kit-fork with a dedicated `forkId`, writing `<path>/.growthub-fork/fork.json` (canonical self-describing state).
3. Optionally create a GitHub remote with `growthub kit fork create --upstream <owner/repo>` flow.
4. Seed a conservative `policy.json` (`autoApprove=additive`, `remoteSyncMode=off` by default).
5. Append a `registered` + `remote_connected` trace event.

After that, every customization you make stays yours — the Self-Healing Fork Sync Agent will propose upstream additions non-destructively, honouring your policy.

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
