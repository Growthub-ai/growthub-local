# Starter Kit — Fork Sync Integration

The starter kit is the first bundled worker kit that is both a **template** and a **native consumer** of the Self-Healing Fork Sync Agent.

## What the starter registers for you

On `growthub starter init` the CLI:

1. Materializes the bundled tree to `<out>` via `copyBundledKitSource`.
2. Calls `registerKitFork({ forkPath, kitId, baseVersion })` — writes `<out>/.growthub-fork/fork.json` and appends an entry to the CLI-owned discovery index at `GROWTHUB_KIT_FORKS_HOME/index.json`.
3. Seeds `<out>/.growthub-fork/policy.json` with conservative defaults (`autoApprove=additive`, `remoteSyncMode=off`, `interactiveConflicts=true`).
4. Appends a `registered` event to `<out>/.growthub-fork/trace.jsonl`.
5. Optionally binds a GitHub remote via `growthub kit fork create --upstream <owner/repo>` or `growthub kit fork connect --remote <owner/repo>`.

## What you never have to do manually

- Generate a forkId.
- Write the initial policy.json.
- Ensure `.growthub-fork/` is present and well-formed.
- Add the fork to the discovery index.

## When upstream ships a new version

Exactly the same flow as every other kit-fork:

```
growthub kit fork status <fork-id>
growthub kit fork heal <fork-id> --dry-run
growthub kit fork heal <fork-id>
```

The heal plan honours your `policy.json`. User-modified files, `policy.untouchablePaths`, and `CUSTOM_SKILL_PATTERNS` are never overwritten.
