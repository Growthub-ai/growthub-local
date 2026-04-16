# Fork Sync Agent Kernel Packet

Version: `v1` (full surface)

This packet freezes the contract, invariants, and procedure for the Fork Sync Agent subsystem — the CLI-native, agent-first mechanism that enables users to fork any Growthub worker kit, apply their own customisations, and stay in sync with upstream kit releases on their terms, locally and/or through first-party native GitHub integration.

## Why This Packet Exists

Worker kits are fully self-contained, versioned environments.  Users who fork them gain creative freedom but risk drift.  The Fork Sync Agent dissolves the "stay current vs preserve your work" tension by making:

1. **Drift detection** — always read-only.
2. **Heal plans** — policy-driven and non-destructive by construction.
3. **User confirmation** — first-class: any action the user asked to be flagged pauses the job until they explicitly approve.
4. **Long-running execution** — trace-backed: every checkpoint is appended to a durable JSONL event log inside the fork.
5. **Remote synchronisation** — optional and opt-in via explicit `remoteSyncMode` policy; powered by first-party native GitHub integration (device-flow auth).

Fork Sync is a worker-kit + kernel-packet concern.  Zero coupling to the Paperclip harness.

## Storage Model

Canonical, self-describing state lives **inside the fork**:

```
<forkPath>/.growthub-fork/
  fork.json                # KitForkRegistration (authoritative)
  policy.json              # KitForkPolicy (authoritative)
  trace.jsonl              # append-only event log
  jobs/<job-id>.json       # per-fork sync-job state
```

CLI-owned operational state lives under dedicated sub-system homes:

```
GROWTHUB_KIT_FORKS_HOME/   (default: ~/.growthub/kit-forks)
  index.json               # discovery pointer list
  orphan-jobs/<job-id>.json

GROWTHUB_GITHUB_HOME/      (default: ~/.growthub/github)
  token.json               # CliGithubToken (device-flow or PAT), chmod 600
  profile.json             # last-known authenticated identity
```

## Subsystem Layout

```
cli/src/kits/
  fork-types.ts         # KitForkRegistration, KitForkRemoteBinding, KitForkDriftReport,
                        # KitForkHealPlan, KitForkHealResult, KitForkSyncJob, KitHealAction
  fork-policy.ts        # KitForkPolicy read/write + evaluation helpers
  fork-trace.ts         # append-only JSONL trace log
  fork-remote.ts        # git wrapper (init/origin/branch/commit/push, token URL)
  fork-registry.ts      # in-fork registration + CLI-owned discovery index
  fork-sync.ts          # detector (read-only) + policy-aware plan builder + plan executor
  fork-sync-agent.ts    # async job lifecycle + confirmation resume + remote push
cli/src/github/
  types.ts, token-store.ts, client.ts  # device flow + REST + fork create + PR open
cli/src/commands/
  kit-fork.ts           # base verbs + interactive hub
  kit-fork-remote.ts    # create, connect, policy, trace, confirm
  github.ts             # login (device flow + PAT), whoami, logout, status
cli/src/config/
  kit-forks-home.ts     # GROWTHUB_KIT_FORKS_HOME + in-fork paths
  github-home.ts        # GROWTHUB_GITHUB_HOME
```

## Kernel Invariants

**Storage invariants**

- `KitForkRegistration` is always file-backed at `<forkPath>/.growthub-fork/fork.json`. No database, no `PAPERCLIP_HOME` dependency.
- `KitForkPolicy` is always file-backed at `<forkPath>/.growthub-fork/policy.json`. Missing policy → conservative defaults.
- `trace.jsonl` is append-only. The agent never truncates it.
- GitHub tokens persist at `GROWTHUB_GITHUB_HOME/token.json` with `chmod 600`; never in the fork dir, never in a harness dir.

**Detector invariants**

- The detector is read-only. It never writes to the fork directory or the bundled kit assets.

**Healer invariants**

- Heal plans ALWAYS honour policy:
  - `policy.untouchablePaths` — rewritten into `skip_user_modified` actions. No override, ever.
  - `policy.confirmBeforeChange` + action types not in `policy.autoApprove` / `policy.autoApproveDepUpdates` — flagged with `needsConfirmation: true`.
- The healer never overwrites a user-modified file.  It only:
  - Adds new scaffold files from upstream that the fork is missing (`add_file`).
  - Merges new upstream dependency additions into `package.json` (additive-only).
  - Patches `kit.json` schema-version and compatibility fields (controlled allow-list).
  - Skips any file matching `USER_PROTECTED_PATTERNS` (`skills/`, `custom/`, `.env`, `.env.local`).
- Actions flagged `needsConfirmation` without a matching entry in `opts.confirmations` are skipped with detail `"Policy requires confirmation — ..."`.
- Custom skills (files matching `CUSTOM_SKILL_PATTERNS`) are detected and reported but never deleted or modified.

**Agent invariants**

- Jobs with pending confirmations transition to `awaiting_confirmation` and persist until `confirmAndResumeJob(jobId, confirmations)` is called.
- Every heal run appends at least: `status_ran`, `heal_proposed`, and one of `heal_applied` / `heal_failed` to the trace log.
- Background jobs are dispatched with `setImmediate` — no child processes, no port binding.
- Job state is persisted at `<forkPath>/.growthub-fork/jobs/<job-id>.json` when resolvable, `GROWTHUB_KIT_FORKS_HOME/orphan-jobs/` otherwise.

**Remote invariants**

- Remote operations run only when `policy.remoteSyncMode !== "off"` AND `reg.remote` is populated AND `resolveGithubAccessToken()` returns a token from one of the two supported sources.
- GitHub access is resolved through a **two-source adapter** with a fixed preference order:
  1. **Direct CLI auth** — `readGithubToken()` (device-flow or PAT under `GROWTHUB_GITHUB_HOME`).
  2. **Growthub-hosted integrations bridge** — the user is authenticated into Growthub AND has connected GitHub inside the gh-app; token is minted on demand via `GET /api/cli/profile?view=integration&provider=github` through the existing `PaperclipApiClient` transport.
- Bridge-minted credentials are **never persisted to disk** — in-memory cache only, TTL clamped to the declared expiry or `DEFAULT_CACHE_TTL_MS` (5 minutes).
- Each heal push creates a dedicated branch `growthub/heal-<from>-to-<to>-<id>` — never force-pushes.
- `remoteSyncMode === "pr"` opens the pull request as **draft** by default.
- HTTPS push uses `https://x-access-token:<token>@github.com/...` form; token is never persisted in git config.
- Trace events for remote operations carry `authSource` ∈ {`direct`, `growthub-bridge`} so operators can audit which source mintied each push.

**Hosted integrations bridge invariants**

- The bridge is layered on top of the existing CLI ↔ gh-app transport (`cli/src/auth/hosted-client.ts` → `PaperclipApiClient`). **No new transport, no new auth primitive.**
- Hosted endpoints consumed:
  - `GET /api/cli/profile?view=integrations` — list connected integrations.
  - `GET /api/cli/profile?view=integration&provider=<id>` — mint a short-lived credential.
- Both endpoints are treated as best-effort (`ignoreNotFound: true`). A hosted deployment that has not yet shipped the endpoint returns a `HostedEndpointUnavailableError` that the bridge surfaces as `bridgeAvailable: false` — **direct CLI auth must continue to work in that state**.
- Additional first-party providers (beyond GitHub) flow through the same resolver: a new provider requires only a new resolver wrapper, not a new transport.
- Logout from Growthub must invalidate the in-memory bridge cache — `clearIntegrationBridgeCache()` is exposed for that wiring.

**Discovery Hub invariants**

- `🔀 Fork Sync Agent` entry is present in `runDiscoveryHub`.
- `🐙 GitHub Integration` entry is present in `runDiscoveryHub`.
- The `kit fork` Commander subtree and the `fork-sync` top-level alias both expose the full verb set unconditionally.
- The `github` Commander subtree is registered unconditionally.

**Anti-coupling invariants**

- No file in the fork-sync or GitHub source tree references `PAPERCLIP_HOME` or `resolvePaperclipHomeDir` (enforced by the gate).
- `cli/src/github/*` depends only on stdlib + `node:child_process` + `fetch`. No third-party GitHub SDK.

## Canonical Commands

```bash
# GitHub auth (first-party native)
growthub github login                                   # OAuth device flow
growthub github login --token <pat>                     # PAT fallback
growthub github whoami
growthub github logout

# One-click end-to-end fork creation
growthub kit fork create \
  --kit <kit-id> \
  --upstream <owner/repo> \
  --out ./my-fork

# Bind / manage existing fork
growthub kit fork connect --fork-id <id> --remote <owner/repo>
growthub kit fork register --path <fork> --kit <kit-id>
growthub kit fork list
growthub kit fork status <fork-id>

# Policy
growthub kit fork policy --fork-id <id>
growthub kit fork policy --fork-id <id> \
  --set autoApprove=none untouchablePaths+=skills/mine.md remoteSyncMode=pr

# Heal (honours policy)
growthub kit fork heal <fork-id>
growthub kit fork heal <fork-id> --dry-run
growthub kit fork heal <fork-id> --background

# Long-running coordination
growthub kit fork jobs
growthub kit fork confirm --job-id <id>                 # approve all pending
growthub kit fork confirm --job-id <id> --approve a.md b.md
growthub kit fork trace --fork-id <id> --tail 50

# Aliases
growthub fork-sync ...                                  # same verb tree

# Validation gates
node scripts/check-fork-sync.mjs
bash scripts/pr-ready.sh
```

## Packet Procedure

### P1. Authenticate GitHub (optional but required for remote features)

```
growthub github login
```

Device-flow opens the verification URL; user enters the code; token stored at `GROWTHUB_GITHUB_HOME/token.json` with chmod 600.

### P2. Fork end-to-end (advanced users)

```
growthub kit fork create --kit creative-strategist-v1 \
                         --upstream growthub-ai/creative-strategist \
                         --out ./my-fork
```

Creates the GitHub fork, materializes bundled kit assets, initializes git, sets origin, writes `.growthub-fork/fork.json`, appends `registered` + `remote_connected` trace events.

### P3. Local-only fork (beginner users)

```
growthub kit download creative-strategist-v1 --out ./my-fork
growthub kit fork register --path ./my-fork --kit creative-strategist-v1
```

No GitHub required. `remote` stays unset.

### P4. Configure policy (per fork)

```
growthub kit fork policy --fork-id <id> \
  --set autoApprove=additive \
        autoApproveDepUpdates=none \
        untouchablePaths+=custom/my-prompt.md \
        confirmBeforeChange+=package.json \
        remoteSyncMode=pr
```

### P5. Heal (honours policy)

```
growthub kit fork heal <fork-id> --dry-run     # preview
growthub kit fork heal <fork-id>               # apply (interactive confirm)
growthub kit fork heal <fork-id> --background  # async + trace-backed
```

Background heals returning `awaiting_confirmation` surface every flagged action. Resume with:

```
growthub kit fork confirm --job-id <id> --approve a b c
```

### P6. Remote sync (when policy.remoteSyncMode !== "off")

On successful heal, the agent creates `growthub/heal-<from>-to-<to>-<id>`, commits, pushes, and — when `remoteSyncMode === "pr"` — opens a draft PR. Every step is traced.

### P7. Validate

```
node scripts/check-fork-sync.mjs
```

## Definition Of Done

- All invariants above satisfied.
- `node scripts/check-fork-sync.mjs` passes.
- Vitest suites (`cli/src/__tests__/kit-fork-*.test.ts`, `cli/src/__tests__/github-*.test.ts`, `cli/src/__tests__/fork-policy.test.ts`, `cli/src/__tests__/fork-trace.test.ts`) pass.
- Discovery Hub options `🔀 Fork Sync Agent` + `🐙 GitHub Integration` visible.
- Zero `PAPERCLIP_HOME` / `resolvePaperclipHomeDir` references in fork-sync + github subsystems.
- `bash scripts/pr-ready.sh` passes.
