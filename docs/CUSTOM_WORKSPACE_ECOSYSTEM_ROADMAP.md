# Custom Workspaces · Post-v0.4.2 Mental Model & Roadmap

_Companion note to the v0.4.2 shipment (`@growthub/cli@0.4.2`, `create-growthub-local@0.2.2`, 10 bundled worker kits). Written for maintainers and agents who will extend the stack; references concrete source paths so everything here is grounded in what is actually on `main`._

Three things happened together in the run-up to v0.4.2:

1. The **Custom Workspace Starter Kit** landed as its own bundled kit (a real worker kit you can `kit download` and `starter init`), carrying a Vite 5 + React 18 UI shell.
2. The **Self-Healing Fork Sync Agent** matured into a full lifecycle (detector → plan → confirm → apply → remote push → trace), with a **two-source GitHub resolver** behind it (direct device-flow + hosted integrations bridge).
3. A **Fleet layer** emerged — `fleet view | drift | drift-summary | policy | approvals | agent-plan` — as a pure, derivational read view over the same durable in-fork state.

The pattern across all three is the same: **every new surface is a composition over frozen primitives; no new storage, no new transport, no new auth.** That is the thesis. The rest of this doc makes that thesis actionable.

## 1. Primitive Inventory (as shipped on `main`)

### 1.1 Bundled Starter Kit

`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/` ships:

- `kit.json` (schemaVersion 2, `family: "studio"`, `executionMode: "export"`) — see `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/kit.json`
- Full kernel-packet-shape asset surface: `QUICKSTART.md`, `.env.example`, `skills.md`, `output-standards.md`, `runtime-assumptions.md`, `validation-checklist.md`, `brands/_template/*`, `templates/{workspace-brief,agent-contract,deployment-plan}.md`, `examples/*`, `docs/{starter-kit-overview,fork-sync-integration,vite-ui-shell-guide}.md`, `growthub-meta/*`
- Worker entrypoint: `workers/custom-workspace-operator/CLAUDE.md`
- Vite 5 + React 18 **studio shell** under `studio/` (`index.html`, `package.json`, `vite.config.js`, `serve.mjs`, `src/{main,App}.jsx`, `src/app.css`) — ships source only, no `dist/` frozen

Catalog entry lives at `cli/src/kits/catalog.ts` (line 87). Registered with `family: "studio"`, `executionMode: "export"`, `activationModes: ["export"]`.

### 1.2 Starter Orchestrator

`cli/src/starter/init.ts` is the smallest legal composition:

```15:42:cli/src/starter/init.ts
import {
  getBundledKitSourceInfo,
  copyBundledKitSource,
} from "../kits/service.js";
import {
  registerKitFork,
  updateKitForkRegistration,
} from "../kits/fork-registry.js";
import {
  writeKitForkPolicy,
  makeDefaultKitForkPolicy,
} from "../kits/fork-policy.js";
import { appendKitForkTraceEvent } from "../kits/fork-trace.js";
import {
  gitAvailable,
  isGitRepo,
  initGitRepo,
  setOrigin,
  buildTokenCloneUrl,
} from "../kits/fork-remote.js";
import { resolveGithubAccessToken } from "../integrations/github-resolver.js";
import { createFork, parseRepoRef } from "../github/client.js";
```

Every production behaviour is a call into an already-shipping primitive. The orchestrator itself is ~140 lines and adds zero state.

Command surface: `growthub starter init --out <path> [--name <label>] [--upstream <owner/repo>] [--destination-org <org>] [--fork-name <name>] [--remote-sync-mode off|branch|pr] [--json]`. See `cli/src/commands/starter.ts`.

### 1.3 Self-Healing Fork Sync Agent

- **Detector** (read-only): `detectKitForkDrift(reg)` in `cli/src/kits/fork-sync.ts` — enumerates file drift, package drift, custom skills, and severity (`none|info|warning|critical`).
- **Plan builder** (read-only): `buildKitForkHealPlan(report, { policy })` — rewrites plan through `policy.untouchablePaths`, `policy.confirmBeforeChange`, `policy.autoApprove`, `policy.autoApproveDepUpdates`.
- **Executor**: `applyKitForkHealPlan(plan, { registration, dryRun, skipFiles, confirmations, onProgress })` — additive only; never overwrites user-modified files; every action typed (`add_file | update_package_json_deps | patch_manifest | add_custom_skill | skip_user_modified`).
- **Job agent**: `runKitForkSyncJob`, `dispatchKitForkSyncJobBackground`, `confirmAndResumeJob`, `listKitForkSyncJobs`, `cancelKitForkSyncJob`, `pruneKitForkSyncJobs` in `cli/src/kits/fork-sync-agent.ts`.
- **Trace**: append-only JSONL at `<forkPath>/.growthub-fork/trace.jsonl`. Every checkpoint, including `agent_checkpoint`, is durable.
- **Remote**: `fork-remote.ts` wraps `git` binary (no SDK). Heal pushes always target a fresh `growthub/heal-<from>-to-<to>-<id>` branch — never force-push. `remoteSyncMode === "pr"` opens a draft PR.

### 1.4 Two-Source GitHub Access

`cli/src/integrations/github-resolver.ts` is a fixed-preference resolver:

1. **Direct** — `readGithubToken()` (device-flow or PAT stored at `GROWTHUB_GITHUB_HOME/token.json` chmod 600).
2. **Bridge** — `resolveIntegrationCredential("github")` through `cli/src/integrations/bridge.ts` → hosted `/api/cli/profile?view=integration&provider=github` → **in-memory only**, TTL clamped to `DEFAULT_CACHE_TTL_MS = 5 min`.

Trace events carry `authSource: "direct" | "growthub-bridge"` so every push is auditable.

### 1.5 Fleet Layer

`cli/src/fleet/` is five tiny files, all pure composition:

- `summary.ts` — `buildFleetSummary()` / `buildForkSummary(reg)` map drift + policy + jobs + trace into `ForkHealthLevel` (`clean | drift-minor | drift-major | awaiting-confirmation | error | unknown`).
- `drift-summary.ts` — `buildDriftArtifactSummary(report, plan, policy)` buckets every path into `safeAdditions | safeUpdates | skippedUserModified | skippedUntouchable | needsConfirmation | customSkills | unresolvedUpstreamDeletion | packageAdditions | packageUpgrades`.
- `approvals.ts` — `buildApprovalQueue()` scans in-fork jobs for `awaiting_confirmation` status.
- `agent-plan.ts` — `buildAgentHealPlanDocument(reg, { captureInTrace })` emits `AgentHealPlanDocument` and appends an `agent_checkpoint` trace event. **Never auto-applies.**
- `types.ts` — `ForkSummary`, `FleetSummary`, `DriftArtifactSummary`, `ApprovalQueueEntry`, `AgentHealPlanDocument`.

Commander surface: `growthub fleet view | drift | drift-summary | policy | approvals | agent-plan` (see `cli/src/commands/fleet.ts`).

### 1.6 Statuspage

`growthub status` = 8 probes + 2 super-admin. Implemented in `cli/src/status/probes.ts`:

| probe | component id | category |
| --- | --- | --- |
| `probeNode` | `local-node` | local-env |
| `probeGit` | `local-git` | local-env |
| `probeBundledKits` | `bundled-kits` | local-env |
| `probeGithubApi` | `github-api` | github |
| `probeGithubDirectAuth` | `github-direct-auth` | cli-auth |
| `probeGrowthubHosted` | `growthub-hosted` | growthub-hosted |
| `probeIntegrationsBridge` | `integrations-bridge` | growthub-hosted |
| `probeKitForksIndex` | `kit-forks-index` | fork-sync |
| `probeNpmRegistry` | `npm-registry` | package-registry |
| `probeReleaseBundleArtifacts` (super-admin) | `release-bundle` | package-registry |

### 1.7 Discovery UX (post-Settings nav)

Top-level menu in `cli/src/index.ts` → `runDiscoveryHub()`:

```
🧰 Worker Kits
📚 Templates
🔗 Workflows          (or locked)
🧠 Local Intelligence
🤖 Agent Harness
⚙️  Settings          ← Connect · GitHub · Fork Sync · Status · Starter · Fleet
❓ Help CLI
```

Seven lanes at the top; six operational surfaces under Settings. Power users can still go direct: `growthub starter init`, `growthub fork-sync …`, `growthub github login`, `growthub status`, `growthub fleet view`.

### 1.8 Kernel Packet Registry (docs are contracts, not prose)

`docs/kernel-packets/README.md` lists 5 frozen packets:

- Custom Workspace Kernel Packet (`KERNEL_PACKET_CUSTOM_WORKSPACES.md`)
- Agent Harness Kernel Packet
- Hosted SaaS Kit Kernel Packet
- Fork Sync Agent Kernel Packet
- Custom Workspace Starter Kit Kernel Packet

Each packet defines: invariants, canonical commands, validation scripts, definition-of-done. Enforced by `node scripts/check-fork-sync.mjs`, `bash scripts/check-custom-workspace-kernel.sh`, `node scripts/check-worker-kits.mjs`, `bash scripts/pr-ready.sh`.

---

## 2. Emergent Behaviours & Patterns (what actually happened)

Reading the last ~30 commits, the stack has converged on six repeatable patterns. Every new surface since the Zernio kit freeze reused them.

### P1. Self-describing forks — state lives with the artifact

```
<forkPath>/.growthub-fork/
  fork.json          # KitForkRegistration — authoritative
  policy.json        # KitForkPolicy — authoritative
  trace.jsonl        # append-only event log
  jobs/<id>.json     # per-fork sync-job state
```

A fork moved to another machine carries its `forkId`, policy, trace, and jobs with it. CLI-owned state (`~/.growthub/kit-forks/index.json`, `~/.growthub/github/token.json`) is **discovery pointer + credential only** — never canonical.

### P2. Policy is the contract; code honours it

Every action that touches the fork reads `policy.json`:

- `untouchablePaths` → rewritten to `skip_user_modified` in the plan, no override.
- `confirmBeforeChange` + `autoApprove` + `autoApproveDepUpdates` → flag `needsConfirmation` on the plan action, with a `confirmationReason`.
- `remoteSyncMode` ∈ `off | branch | pr` → gates remote push; `pr` opens drafts.

The plan builder is pure (`fork-sync.ts → buildKitForkHealPlan`). The executor consumes `confirmations` opt-in only; untouched paths stay untouched.

### P3. Trace is the durable runtime log

`appendKitForkTraceEvent` is called on **every** checkpoint: `registered`, `policy_updated`, `status_ran`, `heal_proposed`, `heal_confirmed`, `heal_applied`, `heal_failed`, `remote_connected`, `remote_pushed`, `remote_pr_opened`, `conflict_encountered`, `conflict_resolved`, `conflict_aborted`, `script_executed`, `agent_checkpoint`.

Agents never truncate. Cross-session continuity is free.

### P4. Jobs are first-class long-running work

`KitForkSyncJob` has states `pending | running | awaiting_confirmation | completed | failed | cancelled`. Background dispatch is `setImmediate` — no child processes, no ports. Parked jobs persist indefinitely; `confirmAndResumeJob(jobId, confirmedPaths)` replays the plan. This is the shape the agentic UX demands.

### P5. Auth resolvers collapse deployment topologies

`resolveGithubAccessToken()` is the template. The CLI never knows or cares whether credentials came from direct device-flow or the hosted bridge. New providers (Vercel, Supabase, Notion, Linear, etc.) plug in by:

1. adding a resolver file under `cli/src/integrations/<provider>-resolver.ts`,
2. letting the bridge call `/api/cli/profile?view=integration&provider=<id>` unchanged.

**No new transport, no new auth primitive.** That phrase appears verbatim in five different source files and two kernel packets. It is now a first-class invariant.

### P6. Fleet = derivational read view over durable state

`buildFleetSummary` reads `listKitForkRegistrations()` + `detectKitForkDrift()` + `readKitForkPolicy()` + `listKitForkSyncJobs()` + `tailKitForkTrace()` and classifies each fork. No writes. No cache. No new storage.

The pattern generalises: any future dashboard, analytics, or hosted mirror is a pure function of in-fork JSON + the bundled catalog.

---

## 3. Mental Model

> **Growthub Local is a control plane for forked worker kits. The CLI is the executor, the hosted app is the identity authority, the worker kit is the unit of portable agent infrastructure, and the fork is the operator's personal branch of that infrastructure — policy-governed, trace-backed, and self-healing.**

The layers, top to bottom:

1. **Hosted identity plane** — Growthub account + connected integrations. Authority, never state.
2. **Machine bridge** — CLI session store + direct credentials (GitHub, eventually Vercel/Supabase/…). The resolver fuses (1) and (2).
3. **Bundled catalog** — 10 worker kits, frozen asset trees, `kit.json` schemaVersion 2. The upstream baseline.
4. **Operator fork** — a single kit materialised on disk, self-describing (`.growthub-fork/*`). Canonical state.
5. **Agent loop** — detector → plan → (confirm) → apply → (push) → trace. Every step idempotent, every step auditable.
6. **Fleet view** — N forks derived into one health grid + one approval queue + per-fork drift artifact summaries.

The user is always the authority; the agent always proposes and traces. The user's customisations never decay silently.

The "done-for-you" experience is what (5) looks like when policy is set to `autoApprove=additive, autoApproveDepUpdates=additive, remoteSyncMode=pr`: the agent detects drift, drafts the plan, applies safe additive changes, opens a draft PR for remote sync, and waits on human review for anything flagged. The "full customization control" experience is the same loop with `autoApprove=none, remoteSyncMode=off, untouchablePaths=[…]` — strict, local, every action paused for review.

Both modes use the same code paths. That is the core achievement of the v0.4.x line.

---

## 4. High-Value Low-Hanging Fruit (non-UX)

Ordered by value-to-effort ratio, not by calendar. Each item names the files it would touch and the primitive it extends. **Nothing here invents a new storage or transport.** Everything composes.

### 4.1 `growthub fleet heal` — bulk heal with one command

**Today:** `fleet view`, `fleet drift`, `fleet approvals` are read-only; the operator must loop over fork IDs to actually heal.
**Gap:** no bulk executor.
**Proposal:** add `fleet heal [--kit <id>] [--severity <info|warning|critical>] [--dry-run] [--background] [--only-auto-approvable]`. Dispatch one job per matching fork via `dispatchKitForkSyncJobBackground`. Trace `fleet_heal_dispatched` per fork (new type, additive to `KitForkTraceEventType`). Pure composition over `listKitForkRegistrations` + `runKitForkSyncJob`.
**Files:** `cli/src/fleet/*`, `cli/src/commands/fleet.ts`.
**Why it ships fast:** no new state; the selector logic already exists in `fleet drift`.

### 4.2 `growthub fleet confirm` — one-shot approval queue drain

**Today:** each parked job is confirmed with `growthub kit fork confirm --job-id <id> --approve a b c`. Operators managing 5+ forks fan out by hand.
**Proposal:** `fleet confirm [--all] [--job-id <id>…] [--approve-safe]` where `--approve-safe` only confirms actions whose `actionType ∈ {add_file, update_package_json_deps, patch_manifest}`. Delegates to `confirmAndResumeJob`.
**Files:** `cli/src/fleet/approvals.ts` (add classifier), `cli/src/commands/fleet.ts`.

### 4.3 Watch-mode drift monitor

**Today:** drift is detected on demand.
**Proposal:** `growthub fork-sync watch [--interval 30m]` — long-running process that periodically calls `detectKitForkDrift` across the fleet and writes an `agent_checkpoint` trace event when severity rises. No daemon required; `setInterval` inside a foreground CLI is fine, and `--background` can fork it off with the same dispatcher used for jobs. The `agent_checkpoint` type is already in `KitForkTraceEventType`.
**Files:** `cli/src/kits/fork-sync-agent.ts` (watch loop), `cli/src/commands/kit-fork.ts`.

### 4.4 `starter init --from-fork <url>` (register an already-cloned fork)

**Today:** `starter init` requires materialising a fresh copy. Users who cloned their own GitHub fork already can't easily register it as a kit-fork.
**Proposal:** accept `--from-fork <url|path>`: if it's a path that already has `kit.json`, skip `copyBundledKitSource`, detect `kitId` from the fork's `kit.json`, call `registerKitFork` + `writeKitForkPolicy` + `appendKitForkTraceEvent` only. If it's a URL, `git clone` then the same flow. One-line addition to the orchestrator; zero new primitives.
**Files:** `cli/src/starter/init.ts`, `cli/src/commands/starter.ts`.

### 4.5 Non-GitHub remote providers

**Today:** `KitForkRemoteBinding.provider` is typed as `"github"`. Fork Sync can't push to GitLab or Bitbucket despite the resolver architecture already being provider-agnostic.
**Proposal:** add `"gitlab"` | `"bitbucket"` to the provider union. Reuse `fork-remote.ts` (it's just `git` over https). The only new code is a GitLab/Bitbucket equivalent of `createFork` + `openPullRequest` — both are thin REST calls. Bridge and direct resolvers generalise via provider-keyed helpers.
**Files:** `cli/src/kits/fork-types.ts`, new `cli/src/gitlab/client.ts` (mirror of `cli/src/github/client.ts`), `cli/src/integrations/bridge.ts` (list/credential calls already parameterised by `providerId`).
**Why it ships fast:** the resolver is already provider-shaped; only the outbound REST client is new per provider.

### 4.6 `growthub fork-sync diff <fork-id>` — unified patch output

**Today:** `detectKitForkDrift` returns typed drift entries. Operators looking at `kit.json`/`package.json` content drift currently get a "content differs" line, not the actual diff.
**Proposal:** add `diff` command that renders unified diffs for every `AUDIT_PATHS` entry with `modified` severity, plus a synthetic patch for the `merge_add_only` dep delta. Pure read; uses Node's `diff` module (optional add) or a hand-rolled line diff.
**Files:** `cli/src/kits/fork-sync.ts` (helper), `cli/src/commands/kit-fork.ts`.

### 4.7 Policy presets

**Today:** `makeDefaultKitForkPolicy()` is the only preset. Users hand-build everything else.
**Proposal:** add `makeStrictPolicy()`, `makeAutonomousPolicy()`, `makeReviewEverythingPolicy()` as named presets. Expose via `growthub kit fork policy --preset <name>`. Uses `updateKitForkPolicy` under the hood.
**Files:** `cli/src/kits/fork-policy.ts`, `cli/src/commands/kit-fork-remote.ts`.
**Why it matters:** accelerates the "done-for-you" persona onboarding to a single flag.

### 4.8 `growthub status --json --exit-nonzero-on <outage|degraded>`

**Today:** `growthub status` prints a grid; non-zero exit is binary. CI/scripts wanting to gate specifically on "bundled kits broken" or "integrations bridge degraded" have to parse output.
**Proposal:** already has `--json`; add `--exit-nonzero-on` enum and `--only <componentId>[,…]`. Pure wrapper in `cli/src/status/runner.ts`.

### 4.9 Fork lifecycle: `suspend`, `resume`, `archive`

**Today:** a fork is either registered or deregistered. No in-between.
**Proposal:** add `status: "active" | "suspended" | "archived"` to `KitForkRegistration`. Drift/heal skip `suspended`. `archived` is read-only. Strictly additive to `fork-types.ts`; back-compat via default `"active"`.
**Files:** `cli/src/kits/fork-types.ts`, `cli/src/kits/fork-registry.ts`, `cli/src/fleet/summary.ts` (classifier).

### 4.10 Trace export / rotate

**Today:** `trace.jsonl` grows forever; rotation is manual per the kernel packet.
**Proposal:** `growthub fork-sync trace rotate --fork-id <id> [--archive-dir …]` that renames the current file and starts a new one, keeping the last N events. Trace the rotation itself. No new storage — existing `.growthub-fork/` directory holds archives.
**Files:** `cli/src/kits/fork-trace.ts`, `cli/src/commands/kit-fork-remote.ts`.

### 4.11 Drift summary narration in Local Intelligence

**Today:** `summariseArtifactSummaryAsNarrative` returns static prose.
**Proposal:** in Local Intelligence hub (gemma3:4b), pass the `DriftArtifactSummary` + `policySnapshot` to `provider.summarizeExecution` to get a model-written, operator-friendly recap. Pure add — if the local backend is unavailable, fall back to the existing narrative. Routes through `runNativeIntelligenceFlowSuite` shape.
**Files:** `cli/src/fleet/drift-summary.ts` (opt-in helper), `cli/src/commands/fleet.ts`.

### 4.12 Installer-aware starter (`create-growthub-local` → starter)

**Today:** `create-growthub-local` scaffolds the Paperclip Local App. Fresh users who want just a workspace still have to run `growthub starter init` as a second step.
**Proposal:** add `create-growthub-local@latest -- --profile workspace --out ./my-workspace` that imports `initStarterWorkspace` directly (already an exported function). Zero cross-package coupling beyond the existing dependency pin.
**Files:** `packages/create-growthub-local/bin/create-growthub-local.mjs`.

### 4.13 `fleet export-manifest` — portable fleet dump

**Today:** no way to move an operator's fleet definition to another machine except copying each fork dir.
**Proposal:** `fleet export-manifest [--out fleet.json]` dumps `{forks: Array<{forkId, kitId, baseVersion, remote, policy, label}>}` derived from `listKitForkRegistrations` + `readKitForkPolicy`. Counterpart `fleet import-manifest fleet.json` re-runs `starter init --from-fork` per entry on the new machine. Pure orchestration; no new state.
**Files:** `cli/src/fleet/summary.ts`, `cli/src/commands/fleet.ts`, (cross-reference: requires §4.4).

### 4.14 Studio dev server handoff

**Today:** the starter kit ships a Vite shell. After `starter init`, users `cd studio && npm install && npm run dev` by hand.
**Proposal:** `growthub starter dev --fork-id <id>` that shells out to `npm --prefix <forkPath>/studio run dev` with stdout passthrough. Optional; it is a shell wrapper, not a new runtime.
**Files:** `cli/src/commands/starter.ts`.

### 4.15 CI pr-ready artifact output

**Today:** `bash scripts/pr-ready.sh` returns a composite exit code.
**Proposal:** also emit `pr-ready.json` with per-check status, which the PR bot (or GitHub Action) can surface as a comment. Already have `check-fork-sync.mjs`, `check-worker-kits.mjs`, `check-version-sync.mjs` — just concatenate JSON outputs. No new scripts.

---

## 5. Forward Roadmap — the shape, not the schedule

Mapping the primitives above onto the ecosystem mission produces three concurrent tracks. Each track compounds with the others; none gates the others.

### Track A — Operator experience (human in control)

Goal: the single-user workflow "I forked one kit, I want to keep it current without losing my changes" becomes a 10-second command.

Build-outs: §4.1, §4.2, §4.6, §4.7, §4.10, §4.14.

Exit condition: `growthub fleet view` is all the operator runs; everything else the agent proposes with `needsConfirmation` where appropriate.

### Track B — Agentic infrastructure (done-for-you)

Goal: an autonomous agent runs the same loop under a strict policy and produces a reviewable PR per fork, per upstream release.

Build-outs: §4.3 (watch), §4.5 (non-GitHub), §4.8 (machine-friendly status), §4.11 (narrated plans), §4.13 (fleet portability).

Exit condition: a scheduled watch agent on a maintainer box keeps a fleet of 50+ forks within one minor-version of upstream with zero human intervention for `info`-severity drift, and prepares PRs for everything else.

### Track C — Platform surface (the ecosystem promise)

Goal: worker kits, templates, workflows, capabilities, and forks compose into a hosted view with the same primitives — no new backends required to render the picture.

Build-outs: §4.12 (starter installer profile), extensions of the integrations bridge to cover Vercel, Supabase, Notion, Linear using the same resolver pattern, and a future hosted mirror of `buildFleetSummary()` that reads user-uploaded `.growthub-fork/` snapshots.

Exit condition: a user logged into Growthub can see their fleet in the hosted app while the CLI remains the only writer.

### Cross-track invariants (do not violate)

- No new storage locations — canonical state stays inside `.growthub-fork/`.
- No new transports — hosted calls go through `PaperclipApiClient`.
- No new auth primitives — every provider flows through the two-source resolver.
- Every new trace event type is appended to `KitForkTraceEventType`, not placed in a sibling file.
- Every new command is either (a) a read view over existing state or (b) a job dispatched into the existing agent runner.
- Kernel packets are the governance layer; any new invariant is captured in a packet doc in the same PR as the code.

These are the same invariants `scripts/check-fork-sync.mjs` and the packet validators already enforce. Code and docs ship together.

---

## 6. What is already true (do not re-invent)

Quick list for future contributors skimming this doc — if you think you need one of these, read the existing source first.

- **Job runner** — `cli/src/kits/fork-sync-agent.ts`. Has foreground, background, confirmation-resume, cancellation, pruning, orphan job recovery.
- **Policy evaluation** — `cli/src/kits/fork-policy.ts`. `isUntouchable`, `requiresConfirmation`, `canAutoApplyAddition`, `canAutoApplyModification`, `canAutoApplyDepAddition`, `canAutoApplyDepUpgrade`.
- **Trace** — `cli/src/kits/fork-trace.ts`. Append-only, 16 event types, durable across sessions.
- **GitHub client** — `cli/src/github/client.ts`. Device flow, PAT, `createFork`, `openPullRequest`. No SDK.
- **Integrations bridge** — `cli/src/integrations/bridge.ts`. `describeIntegrationBridge`, `listConnectedIntegrations`, `resolveIntegrationCredential`, `clearIntegrationBridgeCache`.
- **Probe engine** — `cli/src/status/probes.ts` + `cli/src/status/runner.ts`. 10 probes today; add new ones by appending a function with signature `(timeoutMs) => Promise<ServiceProbeResult>`.
- **Fleet derivation** — `cli/src/fleet/*`. Pure read. Compose for new views.
- **Kit service** — `cli/src/kits/service.ts`. `listBundledKits`, `inspectBundledKit`, `copyBundledKitSource`, `getBundledKitSourceInfo`.
- **Catalog** — `cli/src/kits/catalog.ts`. One entry per kit; the bundle must be rebuilt after catalog edits (see Release Bundle Contract in the Custom Workspace kernel packet).

---

## 7. Closing frame

The v0.4.x line made a bet: **every ecosystem feature should be a composition over frozen primitives, not a new primitive.** The Starter Kit, Self-Healing Fork Sync Agent, Integrations Bridge, Statuspage, Fleet, and Settings nav all proved that bet. The roadmap above is the same bet extended — the items are different surfaces, but every one of them is a five-to-fifty-line orchestrator over something that already exists on `main`.

That is the mature-ecosystem signal: the interesting work has moved from "build primitives" to "rearrange them." Keep the invariants, keep the kernel packets honest, and the stack will continue to compound.
