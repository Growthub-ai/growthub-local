# Custom Workspace Starter Kit Kernel Packet

Version: `v1`

This packet freezes the contract for the **Growthub Custom Workspace Starter Kit** — the canonical v1 primitive for forking a single worker kit without the rest of `growthub-local`, while preserving every invariant codified in the Custom Workspaces and Fork Sync Agent kernel packets.

## Why This Packet Exists

Users who want to customize one worker kit shouldn't have to fork the whole repository.  Before this primitive, there was no supported path for "just the one kit."  The starter kit gives that user:

- A minimal but complete custom-workspace tree (kit.json, frozen assets, brand scaffolds, templates, examples, docs, studio UI shell, growthub-meta).
- An auto-registered kit-fork with its own `forkId`, policy, and trace log.
- An optional first-party native GitHub remote.
- A guaranteed upgrade path back to upstream via the Self-Healing Fork Sync Agent.

## Kernel Invariants

**Bundled kit invariants**

- The starter kit is registered in `BUNDLED_KIT_CATALOG` with `family: "studio"`, `executionMode: "export"`, `activationModes: ["export"]`.
- `kit.json` is schemaVersion 2; every path in `frozenAssetPaths` and `outputStandard.requiredPaths` physically exists on disk.
- `bundles/growthub-custom-workspace-starter-v1.json` `requiredFrozenAssets` is a subset of `kit.json.frozenAssetPaths`.
- `studio/` ships source only — no `dist/` is frozen in the starter (the user runs `npm run build` after init).

**Orchestrator invariants (`cli/src/starter/init.ts`)**

- The initializer does NOT introduce a new storage location, transport, or auth primitive. It composes:
  - `copyBundledKitSource` (from `cli/src/kits/service.ts`)
  - `registerKitFork` + `updateKitForkRegistration` (from `cli/src/kits/fork-registry.ts`)
  - `writeKitForkPolicy` (from `cli/src/kits/fork-policy.ts`)
  - `appendKitForkTraceEvent` (from `cli/src/kits/fork-trace.ts`)
  - `createFork` + `parseRepoRef` (from `cli/src/github/client.ts`)
  - `resolveGithubAccessToken` (from `cli/src/integrations/github-resolver.ts`)
  - `gitAvailable` / `isGitRepo` / `initGitRepo` / `setOrigin` / `buildTokenCloneUrl` (from `cli/src/kits/fork-remote.ts`)
- The initializer fails fast if the destination exists and is non-empty.
- On every successful init, the fork's `.growthub-fork/trace.jsonl` contains at least three events: `registered`, `policy_updated`, and (when `--upstream` is set) `remote_connected`.
- `policy.json` is seeded with `autoApprove=additive`, `autoApproveDepUpdates=additive`, `remoteSyncMode={--remote-sync-mode or "off"}`, `interactiveConflicts=true`.

**Command surface invariants**

- `growthub starter init` requires `--out <path>`. No other positional arguments.
- `--upstream <owner/repo>` triggers the first-party GitHub path; without it the init is purely local.
- `--remote-sync-mode off|branch|pr` is validated before any write.
- `--json` emits `{status: "ok" | "error", ...}` shape-compatible with the `StarterInitResult` type.

**Discovery Hub invariants**

- The `runDiscoveryHub()` function surfaces a top-level lane labelled `🧪 Custom Workspace Starter`.
- The demo CLI (`scripts/cli-demo.mjs`) exposes a `custom-workspace-starter` preview entry that invokes `growthub starter init` through the real CLI binary.

**Anti-coupling invariants**

- The starter primitive does NOT import the fork-sync *engine* (`fork-sync.ts`, `fork-sync-agent.ts`) — it only touches registry, policy, trace, remote primitives + the catalog helpers.
- No file in `cli/src/starter/` references `PAPERCLIP_HOME` or `resolvePaperclipHomeDir`.

## Canonical Commands

```bash
growthub starter init --out ./my-workspace
growthub starter init --out ./my-workspace --name "My Workspace"
growthub starter init --out ./my-workspace \
  --upstream octocat/my-workspace \
  --remote-sync-mode pr
```

## Validation

```bash
node scripts/check-worker-kits.mjs           # all frozen assets present
bash scripts/check-custom-workspace-kernel.sh
node scripts/check-fork-sync.mjs             # starter-specific section
```

## Definition Of Done

- All invariants above satisfied.
- Starter kit is listed in `BUNDLED_KIT_CATALOG`, discoverable via `growthub kit list`.
- `growthub starter init --out <tmp>` produces a directory with a valid `.growthub-fork/fork.json`, `policy.json`, and `trace.jsonl`.
- `cli/src/starter/` imports only the composing primitives listed above.
- `node scripts/check-fork-sync.mjs` passes (starter kit section included).
- Discovery Hub + demo CLI surfaces are wired.
