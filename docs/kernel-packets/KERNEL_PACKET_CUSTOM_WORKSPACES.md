# Custom Workspace Kernel Packet

Version: `v1`

This packet freezes the reusable primitive for shipping CLI custom workspace worker kits end to end.

Use it when you are adding a new worker kit, extending an existing one, or rolling up multiple kit branches into one integration branch.

## Why This Packet Exists

Recent custom workspace releases proved a stable path:

1. package the environment as a self-contained kit
2. validate all manifest-required assets
3. confirm discovery and download flow in CLI
4. enforce deterministic tests and release gates
5. merge, release, and confirm npm publication

This document turns that path into a repeatable kernel for future agent work.

## Kernel Invariants

Every custom workspace kit must satisfy these invariants before merge:

- `kit.json` and bundle manifests are schema-valid and path-complete
- all `frozenAssetPaths`, `outputStandard.requiredPaths`, and `requiredFrozenAssets` exist on disk
- `BUNDLED_KIT_CATALOG` includes the kit with `family: "studio"`
- discovery flow can list, inspect, and download the kit without runtime errors
- downloaded folder and zip include stable setup assets (`.env.example`, `QUICKSTART.md`)
- CI gates are green (`validate`, `smoke`, `verify`)

## Packet Inputs

- target kit slug (`growthub-<name>-v1`)
- kit folder under `cli/assets/worker-kits/<kit-id>`
- worker entrypoint (`workers/<worker-id>/CLAUDE.md`)
- catalog registration in `cli/src/kits/catalog.ts`
- optional core config registration in `cli/src/kits/core/index.ts`

## Packet Procedure

### P1. Contract + Asset Freeze

- create/confirm `kit.json`
- create/confirm `bundles/<bundle-id>.json`
- include required setup assets:
  - `.env.example`
  - `QUICKSTART.md`
  - `validation-checklist.md`
  - `setup/check-deps.sh`
  - `setup/verify-env.mjs`

### P2. Discovery Registration

- add catalog entry in `cli/src/kits/catalog.ts`
- ensure custom workspace kits remain in `family: "studio"`

### P3. Deterministic Validation

Run:

```bash
node scripts/check-worker-kits.mjs
bash scripts/check-custom-workspace-kernel.sh
```

### P4. Integration Branch Rollup (when multiple kit PRs exist)

- create fresh branch from latest `origin/main`
- cherry-pick each kit commit stack
- resolve conflicts in shared files (`catalog.ts`, `core/index.ts`)
- re-run packet validation before opening consolidation PR

### P5. Release + Ship Confirmation

- merge PR after checks are green
- run release workflow (stable publish)
- confirm npm remote latest versions match merged package versions

## Reuse Beyond Worker Kits

This packet is reusable for other CLI extension work by keeping the same shape:

- **contract primitive:** machine-readable source of truth
- **registration primitive:** one canonical discovery/index registration point
- **validation primitive:** deterministic scripts + focused Vitest suite
- **release primitive:** CI gates + release workflow + remote publish proof

Apply the same structure for Templates, Workflows, Local Intelligence, and future discovery lanes.

## Canonical Commands

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
node scripts/check-worker-kits.mjs
bash scripts/check-custom-workspace-kernel.sh
bash scripts/pr-ready.sh
```

## Definition Of Done

A custom workspace change is done only when:

- packet validation commands pass locally
- PR checks are green
- merge lands in `main`
- release workflow succeeds
- npm remote shows updated `latest` versions
