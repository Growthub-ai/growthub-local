---
name: workspace-causal-cli
description: Run the offline causal-intelligence CLI over a governed Growthub workspace — growthub plan (blast radius, stale surfaces, lineage), growthub patch (offline allowlisted edit with impact + compliance, PR-ready), growthub capture (live vs repo drift), growthub readiness (ship verdict across forks). Use for scripted or CI-side impact analysis when you want JSON output instead of MCP tool calls.
---

# Workspace Causal CLI — the console's scriptable twin

The same pure derivers behind the `governed-universe` MCP tools ship as four
CLI commands. Use these when you want machine-readable JSON in a script, a CI
gate, or a PR body — the MCP tools and these commands derive from one spine,
so they can never disagree.

Resolve the CLI in this order (first available wins):

1. `growthub …` — installed CLI (`npm i -g @growthub/cli`)
2. `npx -y @growthub/cli@0.14.25 …` — no install required

All commands accept `--fork <path>` (default: cwd; the path must contain
`growthub.config.json` at root or under `apps/workspace/`) and `--json`.

## `growthub plan` — pre-merge causal impact

```bash
growthub plan --json                       # graph stats + stale surfaces
growthub plan --impact <nodeId> --json     # blast radius + workflow impact
growthub plan --lineage <nodeId> --json    # dependents + dependencies closure
```

`<nodeId>` accepts a graph node id, `metadataId`, or label.

## `growthub patch` — offline allowlisted edit, PR-ready

```bash
growthub patch --set 'dataModel.objects[0].label="Customers"' --json   # dry-run
growthub patch --set '<path>=<jsonValue>' --write                      # edit repo artifact
```

- Only `dashboards`, `widgetTypes`, `canvas`, `dataModel` are patchable —
  disallowed top-level keys are reported and never written.
- Reports impact (added / modified / **removed** objects + dashboards) and
  contract compliance before writing.
- `--write` edits the **repo artifact only** — it never touches live state.
  Promotion stays on the governed `PATCH /api/workspace` / `workflow/publish`
  lanes (see the `governed-workspace-mutation` skill).

## `growthub capture` — live ↔ repo drift

```bash
growthub capture --live http://127.0.0.1:3777 --json
```

Compares the running control plane (`GET /api/workspace`) against the repo
artifact per allowlisted field and prints the reconcile step when drifted.

## `growthub readiness` — ship verdict

```bash
growthub readiness --json                          # this fork
growthub readiness --fork ./a --fork ./b --json    # rollup across forks
growthub readiness --app <appId> --json            # one app scope
```

Returns `{ ready, score, summary, nextAction }` per fork plus a rollup —
suitable as a CI gate before deploys.

## Boundaries

- All four commands are read-only except `patch --write`, which writes one
  file (the repo config artifact) and is still never a live mutation.
- Do not parse human-mode output — always pass `--json` in scripts.
- Version-pin `@growthub/cli` in CI for reproducible verdicts.
