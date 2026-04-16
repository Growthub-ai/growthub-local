# Fork Sync Agent Kernel Packet

Version: `v1`

This packet freezes the contract, invariants, and procedure for the Fork Sync Agent subsystem — the CLI-native, agent-first mechanism that enables users to fork any Growthub worker kit, apply their own customisations, and still receive non-destructive upstream version updates on demand.

## Why This Packet Exists

Worker kits are fully self-contained, versioned environments.  Users who fork them gain creative freedom but risk drift — their local copy diverges from the upstream kit as new versions ship.  The Fork Sync Agent solves this without asking users to choose between staying current and preserving their work.

Fork Sync is a **worker-kit / kernel-packet** concern.  It is deliberately decoupled from the Paperclip harness: no `PAPERCLIP_HOME` binding, no harness-specific home directory, no cross-subsystem coupling.  A fork is a self-describing kernel packet that travels with its own state.

The packet codifies:

1. How forks are registered and tracked (self-describing in-fork state + thin CLI-owned discovery index)
2. How drift is detected (compare upstream bundled assets vs fork directory)
3. How heal plans are built (safe, non-destructive, preserves user modifications)
4. How async background jobs run within the CLI process (setImmediate dispatch, persisted to disk)
5. How the feature is surfaced in the Discovery Hub

## Storage Model (zero Paperclip coupling)

Canonical, self-describing state lives **inside the fork**:

```
<forkPath>/.growthub-fork/
  fork.json               # KitForkRegistration — authoritative
  jobs/<job-id>.json      # background sync job state for this fork
```

CLI-owned operational state lives in a dedicated kit-forks home:

```
GROWTHUB_KIT_FORKS_HOME/   (default: ~/.growthub/kit-forks)
  index.json               # discovery index — [{forkId, kitId, forkPath, registeredAt}]
  orphan-jobs/<job-id>.json  # jobs for forks that are unresolved / deregistered
```

- The in-fork `fork.json` is the source of truth for a registration.
- The `index.json` is a rebuildable pointer list; it is not authoritative for registration fields.
- No component of the fork-sync subsystem reads or writes any `PAPERCLIP_*` env var or directory.

## Subsystem Layout

```
cli/src/kits/
  fork-types.ts         # canonical type system (KitForkRegistration, KitForkDriftReport, KitForkHealPlan, KitForkSyncJob, …)
  fork-registry.ts      # in-fork registration + CLI-owned discovery index
  fork-sync.ts          # drift detection + heal plan builder + plan executor
  fork-sync-agent.ts    # async job lifecycle (pending → running → completed|failed, disk-persisted)

cli/src/commands/kit-fork.ts   # Commander registration + Clack interactive hub
cli/src/config/kit-forks-home.ts  # GROWTHUB_KIT_FORKS_HOME + in-fork path resolvers
```

## Kernel Invariants

Every change to the fork-sync subsystem must satisfy these invariants before merge:

- `KitForkRegistration` is always file-backed at `<forkPath>/.growthub-fork/fork.json` — the fork is self-describing and portable.  No database dependency.  No `PAPERCLIP_HOME` dependency.
- The discovery index at `GROWTHUB_KIT_FORKS_HOME/index.json` is never treated as authoritative for registration content — it only stores `{forkId, kitId, forkPath, registeredAt}` pointers.
- The detector is read-only — it never writes to the fork directory or the bundled kit assets.
- The healer never overwrites a user-modified file.  It only:
  - Adds new scaffold files from upstream that the fork is missing.
  - Merges new upstream dependency additions into package.json (additive only).
  - Patches kit.json schema-version and compatibility fields (controlled field list only).
  - Skips any file matching `USER_PROTECTED_PATTERNS` (skills/, custom/, .env, .env.local).
- Background jobs are dispatched with `setImmediate` — no child processes, no port binding.
- Job state is persisted at `<forkPath>/.growthub-fork/jobs/<job-id>.json` when the fork is resolvable, or at `GROWTHUB_KIT_FORKS_HOME/orphan-jobs/<job-id>.json` otherwise.
- Custom skills (files matching `CUSTOM_SKILL_PATTERNS`) are detected and reported but never deleted or modified.
- The Discovery Hub entry `🔀 Fork Sync Agent` must be present in `runDiscoveryHub` in `cli/src/index.ts`.
- The `kit fork` Commander subtree must be registered unconditionally (not gated on DX vs GTM surface), with `fork-sync` available as a top-level alias.
- All CLI navigation follows existing Clack patterns: `p.select`, sentinel `__back_to_hub`, `allowBackToHub` flag.
- The fork-sync source tree must contain zero references to `PAPERCLIP_HOME` or `resolvePaperclipHomeDir`.

## Packet Inputs

- Registered fork: a directory exported from `growthub kit download <kit-id>` (or any compatible kit directory)
- Kit ID: one of the entries in `BUNDLED_KIT_CATALOG`
- Base version: the kit version at registration time (stored in fork.json)
- Custom skills: optional list of relative paths inside the fork that are user-created additions

## Packet Procedure

### P1. Register

```bash
growthub kit fork register --path <fork-path> --kit <kit-id>
# or interactive:
growthub fork-sync
```

Creates `<forkPath>/.growthub-fork/fork.json` and appends an entry to `GROWTHUB_KIT_FORKS_HOME/index.json`.

### P2. Detect Drift

```bash
growthub kit fork status <fork-id>
```

Produces a `KitForkDriftReport` with:
- `fileDrifts` — files added/modified/deleted vs upstream
- `packageDrifts` — dependency version changes
- `customSkillsDetected` — user additions to preserve
- `overallSeverity` — none | info | warning | critical

### P3. Heal

```bash
growthub kit fork heal <fork-id>
growthub kit fork heal <fork-id> --dry-run
growthub kit fork heal <fork-id> --background
```

Applies a `KitForkHealPlan`:
- Adds missing upstream scaffold files
- Merges upstream dependency additions
- Patches kit.json alignment fields
- Skips user-modified and user-protected paths
- Updates `baseVersion` in `<forkPath>/.growthub-fork/fork.json` on success

### P4. Validate

```bash
node scripts/check-fork-sync.mjs
```

### P5. Validation Script

`scripts/check-fork-sync.mjs` must verify:
1. All exported fork-sync types are importable
2. In-fork registry read/write round-trip works
3. Detector runs against a synthetic fork without errors
4. Healer dry-run produces zero file writes
5. No `PAPERCLIP_HOME` / `resolvePaperclipHomeDir` references exist anywhere in the fork-sync source tree

### P6. Release + Ship Confirmation

No separate npm release is required for the fork-sync subsystem — it ships as part of `@growthub/cli`.  Follow the existing Custom Workspace Kernel Packet release procedure (rebuild esbuild bundle, force-commit `cli/dist/index.js`, trigger release workflow).

## Discovery Parity Contract

The Fork Sync Agent hub (`runKitForkHub`) is surfaced in both:
- `growthub kit fork` / `growthub fork-sync` (direct Commander subcommand + top-level alias)
- `growthub discover` → `🔀 Fork Sync Agent` (Discovery Hub option)

Both paths call `runKitForkHub` with `allowBackToHub`.  The hub itself follows the standard `while(true)` + `p.select` + `return "back"` pattern used by all other hubs.

## Canonical Commands

```bash
growthub kit fork register --path <fork-path> --kit <kit-id>
growthub kit fork list
growthub kit fork status <fork-id>
growthub kit fork heal <fork-id>
growthub kit fork heal <fork-id> --dry-run
growthub kit fork heal <fork-id> --background
growthub kit fork jobs
growthub fork-sync                    # top-level alias
node scripts/check-fork-sync.mjs
bash scripts/pr-ready.sh
```

## Definition Of Done

A fork-sync feature change is done only when:

- All invariants above are satisfied
- `node scripts/check-fork-sync.mjs` passes
- Vitest suite (`cli/src/__tests__/kit-fork-*.test.ts`) passes
- Discovery Hub option `🔀 Fork Sync Agent` is visible in `growthub discover`
- Zero `PAPERCLIP_HOME` references remain in any `cli/src/kits/fork-*.ts`, `cli/src/commands/kit-fork.ts`, or fork-sync test file
- PR checks are green
- `bash scripts/pr-ready.sh` passes
