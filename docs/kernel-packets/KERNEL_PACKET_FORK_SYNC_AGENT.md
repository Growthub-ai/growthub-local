# Fork Sync Agent Kernel Packet

Version: `v1`

This packet freezes the contract, invariants, and procedure for the Fork Sync Agent subsystem — the CLI-native, agent-first mechanism that enables users to fork any Growthub worker kit, apply their own customisations, and still receive non-destructive upstream version updates on demand.

## Why This Packet Exists

Worker kits are fully self-contained, versioned environments.  Users who fork them gain creative freedom but risk drift — their local copy diverges from the upstream kit as new versions ship.  The Fork Sync Agent solves this without asking users to choose between staying current and preserving their work.

The packet codifies:

1. How forks are registered and tracked (file-backed registry, no database)
2. How drift is detected (compare upstream bundled assets vs fork directory)
3. How heal plans are built (safe, non-destructive, preserves user modifications)
4. How async background jobs run within the CLI process (setImmediate dispatch, persisted to disk)
5. How the feature is surfaced in the Discovery Hub

## Subsystem Layout

```
cli/src/fork-sync/
  types.ts         # canonical type system (ForkRegistration, ForkDriftReport, ForkHealPlan, ForkSyncJob, …)
  registry.ts      # file-backed fork registration (PAPERCLIP_HOME/fork-sync/<kit-id>/<fork-id>/fork.json)
  detector.ts      # drift detection — compares upstream bundled assets vs fork directory
  healer.ts        # heal plan builder + executor (non-destructive, preserves user modifications)
  job-manager.ts   # async job lifecycle (pending → running → completed|failed, disk-persisted)
  index.ts         # stable public re-export surface

cli/src/commands/fork-sync.ts  # Commander registration + Clack interactive hub
```

## Kernel Invariants

Every change to the fork-sync subsystem must satisfy these invariants before merge:

- `ForkRegistration` is always file-backed at `PAPERCLIP_HOME/fork-sync/<kit-id>/<fork-id>/fork.json` — no database dependency.
- The detector is read-only — it never writes to the fork directory or the bundled kit assets.
- The healer never overwrites a user-modified file.  It only:
  - Adds new scaffold files from upstream that the fork is missing.
  - Merges new upstream dependency additions into package.json (additive only).
  - Patches kit.json schema-version and compatibility fields (controlled field list only).
  - Skips any file matching `USER_PROTECTED_PATTERNS` (skills/, custom/, .env, .env.local).
- Background jobs are dispatched with `setImmediate` — no child processes, no port binding.
- Job state is persisted at `PAPERCLIP_HOME/fork-sync/.jobs/<job-id>.json`.
- Custom skills (files matching `CUSTOM_SKILL_PATTERNS`) are detected and reported but never deleted or modified.
- The Discovery Hub entry `🔀 Fork Sync Agent` must be present in `runDiscoveryHub` in `cli/src/index.ts`.
- The `fork-sync` Commander subtree must be registered unconditionally (not gated on DX vs GTM surface).
- All CLI navigation follows existing Clack patterns: `p.select`, sentinel `__back_to_hub`, `allowBackToHub` flag.

## Packet Inputs

- Registered fork: a directory exported from `growthub kit download <kit-id>` (or any compatible kit directory)
- Kit ID: one of the entries in `BUNDLED_KIT_CATALOG`
- Base version: the kit version at registration time (stored in fork.json)
- Custom skills: optional list of relative paths inside the fork that are user-created additions

## Packet Procedure

### P1. Register

```bash
growthub fork-sync register <path>
# or interactive:
growthub fork-sync
```

Creates `PAPERCLIP_HOME/fork-sync/<kit-id>/<fork-id>/fork.json`.

### P2. Detect Drift

```bash
growthub fork-sync status <fork-id>
```

Produces a `ForkDriftReport` with:
- `fileDrifts` — files added/modified/deleted vs upstream
- `packageDrifts` — dependency version changes
- `customSkillsDetected` — user additions to preserve
- `overallSeverity` — none | info | warning | critical

### P3. Heal

```bash
growthub fork-sync heal <fork-id>
growthub fork-sync heal <fork-id> --dry-run
growthub fork-sync heal <fork-id> --background
```

Applies a `ForkHealPlan`:
- Adds missing upstream scaffold files
- Merges upstream dependency additions
- Patches kit.json alignment fields
- Skips user-modified and user-protected paths
- Updates `baseVersion` in fork.json on success

### P4. Validate

Run:

```bash
node scripts/check-fork-sync.mjs
```

(See P5 — the validation script is part of this packet.)

### P5. Validation Script

`scripts/check-fork-sync.mjs` must verify:
1. All exported fork-sync types are importable
2. Registry read/write round-trip works
3. Detector runs against a synthetic fork without errors
4. Healer dry-run produces zero file writes

### P6. Release + Ship Confirmation

No separate npm release is required for the fork-sync subsystem — it ships as part of `@growthub/cli`.  Follow the existing Custom Workspace Kernel Packet release procedure (rebuild esbuild bundle, force-commit `cli/dist/index.js`, trigger release workflow).

## Discovery Parity Contract

The Fork Sync Agent hub (`runForkSyncHub`) is surfaced in both:
- `growthub fork-sync` (direct Commander subcommand)
- `growthub discover` → `🔀 Fork Sync Agent` (Discovery Hub option)

Both paths call `runForkSyncHub` with `allowBackToHub`.  The hub itself follows the standard `while(true)` + `p.select` + `return "back"` pattern used by all other hubs.

## Canonical Commands

```bash
growthub fork-sync register <path>
growthub fork-sync list
growthub fork-sync status <fork-id>
growthub fork-sync heal <fork-id>
growthub fork-sync heal <fork-id> --dry-run
growthub fork-sync heal <fork-id> --background
growthub fork-sync jobs
node scripts/check-fork-sync.mjs
bash scripts/pr-ready.sh
```

## Definition Of Done

A fork-sync feature change is done only when:

- All invariants above are satisfied
- `node scripts/check-fork-sync.mjs` passes
- Vitest suite (`cli/src/__tests__/fork-sync*.test.ts`) passes
- Discovery Hub option `🔀 Fork Sync Agent` is visible in `growthub discover`
- PR checks are green
- `bash scripts/pr-ready.sh` passes
