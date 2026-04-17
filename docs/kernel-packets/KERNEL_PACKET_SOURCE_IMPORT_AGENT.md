# Source Import Agent Kernel Packet

Version: `v1`

This packet freezes the contract for the **Growthub Source Import Agent** — the canonical v1 primitive for the **Portable Source → Agent Environment Pipeline**. It unifies two first-class source types (GitHub repositories and skills.sh skills) into one starter-derived workspace materializer, preserving every invariant codified in the Custom Workspaces, Fork Sync Agent, and Custom Workspace Starter kernel packets.

## Why This Packet Exists

Users and operators need a single, safe, auditable way to turn a *portable source* (a repo URL, a skill reference, or a browsed skills.sh listing) into a registered Growthub custom workspace — without forking the whole monorepo, without hand-wiring `.growthub-fork/` state, and without silently executing foreign code.

Before this primitive, there was no source-agnostic path from "here is a thing I want to run under Growthub's governance" to "a materialized fork with policy, trace, and an imported payload." The Source Import Agent provides that path by:

- Treating `github-repo` and `skills-skill` as **parallel adapters** that feed the same starter/fork/trace/policy pipeline.
- Making **security inspection mandatory** for every skill import, and for any non-safe GitHub import.
- Parking the job on `awaiting_confirmation` until the operator double-confirms.
- Never executing fetched payloads — files are staged, inspected, placed at `<forkPath>/imported/`, and summarized.
- Re-using existing registry / policy / trace / remote primitives without introducing a new storage location, transport, or auth primitive.

## Kernel Invariants

**Source model invariants**

- `SourceKind` is a discriminated union with exactly two members in v1: `"github-repo" | "skills-skill"`. Any new source requires a v2 bump.
- `SourceInput`, `SourceAccessProbe`, and `SourceImportManifest` all carry the same `kind` discriminator. Every adapter speaks the same shape.
- GitHub source resolution composes the existing two-source token ordering (direct CLI token → Growthub bridge token → public). No new auth primitive is introduced.
- Skills source resolution uses `SKILLS_SH_BASE` (default `https://skills.sh`) and is public-by-design. No credentials are read or persisted for skills.sh requests.

**Pipeline invariants (`cli/src/starter/source-import/`)**

- The agent does NOT introduce a new storage location, transport, or auth primitive. It composes:
  - `probeGithubRepoSource`, `cloneGithubRepo`, `narrowToSubdirectory` (from `./github-source.ts`)
  - `probeSkillsSource`, `fetchSkillPayload`, `browseSkills`, `parseSkillRef` (from `./skills-source.ts`)
  - `inspectSourcePayload` (from `./security.ts`)
  - `buildSourceImportPlan`, `pendingConfirmations` (from `./plan.ts`)
  - `materializeImportPlan` (from `./materialize.ts`)
  - `writeImportSummary` (from `./summarize.ts`)
  - `copyBundledKitSource` (from `cli/src/kits/service.ts`)
  - `registerKitFork` + `updateKitForkRegistration` (from `cli/src/kits/fork-registry.ts`)
  - `writeKitForkPolicy` (from `cli/src/kits/fork-policy.ts`)
  - `appendKitForkTraceEvent` (from `cli/src/kits/fork-trace.ts`)
- The imported payload always lands at `<forkPath>/imported/` (wrap mode). Never scattered into the fork root.
- The canonical manifest is always written to `<forkPath>/.growthub-fork/source-import.json`. There is no alternate location.
- `copyBundledKitSource` is invoked **before** the staged payload is moved into the fork — the starter shell is guaranteed to exist around the imported payload.
- Every credential is **in-memory only**. Bridge tokens, clone URLs with tokens, and any transient secrets are never written to disk.

**Security invariants**

- `inspectSourcePayload` is mandatory. It is called pre-materialization (on staged source) and re-run post-materialization (on the placed payload).
- Bounds are fixed: `MAX_FILES = 2000`, `MAX_BYTES_PER_FILE = 256 KiB`, `MAX_TOTAL_BYTES = 16 MiB`. Inspection walks are capped; `.git/` and `node_modules/` are skipped.
- Risk classification is the four-value ladder: `"safe" | "caution" | "high-risk" | "blocked"`.
- `plan.security?.blocked === true` **MUST** prevent materialization even when confirmations are supplied. `materializeImportPlan` hard-fails in this case.
- Skill imports always require operator acknowledgement: `requireSkillAcknowledgement` injects at minimum an `info` finding that forces the risk class to `caution` or higher.
- The skills adapter NEVER marks fetched files executable (mode `0o644`) and NEVER auto-runs any script — not during fetch, not during materialization, not during summarization.

**Confirmation invariants**

- Every plan action carrying `needsConfirmation: true` must have a non-empty `confirmationLabel`.
- `pendingConfirmations(plan)` returns the deduplicated confirmation labels. A non-empty result parks the job as `awaiting_confirmation` until `confirmAndResumeSourceImportJob` is called with matching tokens.
- Skills imports always produce at least one pending confirmation.
- GitHub imports with risk class `safe` may run without parking; any non-safe inspection result forces a pending confirmation.
- The Discovery Hub surface wraps the single programmatic confirmation list with a **double prompt** (acknowledge-security + confirm-materialize) before calling the resume API.

**Background job invariants**

- Job records live at `${GROWTHUB_KIT_FORKS_HOME}/source-import-jobs/<job-id>.json`.
- Job IDs are `sij-<timestamp-b36>-<random>`; import IDs are `si-<timestamp-b36>-<random>`.
- `runSourceImportJob` is the foreground path. `dispatchSourceImportJobBackground` is fire-and-forget via `setImmediate`.
- `pruneSourceImportJobs` has a default retention of 7 days. Terminal statuses: `completed | failed | cancelled`.

**Trace invariants**

- The agent uses ONLY existing `KitForkTraceEventType` values (`registered`, `policy_updated`, `agent_checkpoint`). No new trace event schema is introduced.
- Source-import-specific metadata is carried in the trace event `detail` field.

**Anti-coupling invariants**

- No file under `cli/src/starter/source-import/` imports `PAPERCLIP_HOME` or calls `resolvePaperclipHomeDir`.
- The Source Import Agent does NOT import the fork-sync *engine* (`fork-sync.ts`, `fork-sync-agent.ts`). It only touches registry, policy, trace, and remote primitives + the catalog helpers + the source-import module tree.
- The Source Import Agent does NOT re-implement GitHub cloning, token resolution, or fork registration — it composes the existing primitives.

## Command Surface

- `growthub starter import-repo <repo>` — GitHub repo import (foreground).
- `growthub starter import-skill <skill>` — skills.sh skill import (foreground).
- `growthub starter browse-skills` — paginated skills.sh catalog browser.

Every command supports:

- `--out <path>` — destination fork directory (required).
- `--json` — machine-readable `{status: "ok" | "error", ...}` shape-compatible with the `SourceImportResult` / `SourceImportJob` types.
- `--confirm <targets...>` — variadic confirmation tokens matching `plan.pendingConfirmations`, for non-interactive use.

## Discovery Hub Invariants

- The **Settings → Custom Workspace Starter** entry opens a submenu with four options:
  1. `new-greenfield` — invokes `growthub starter init`.
  2. `import-github` — routes to `startSourceImportFlow({ kind: "github-repo" })`.
  3. `import-skill` — routes to `startSourceImportFlow({ kind: "skills-skill" })`.
  4. `browse-skills` — routes to `runBrowseSkills(...)` followed by an optional import.
- The submenu loops (`starterLoop`) so back navigation returns to Settings without losing context.
- The demo CLI (`scripts/cli-demo.mjs`) exposes a `source-import` preview entry labelled `📥 Source Import Agent Preview` that invokes `growthub starter import-repo --help` through the real CLI binary.

## Canonical Commands

```bash
# GitHub repo import, interactive double-confirmation
growthub starter import-repo octocat/hello-world --out ./my-workspace

# GitHub repo import, non-interactive with explicit confirmations
growthub starter import-repo octocat/hello-world \
  --out ./my-workspace \
  --confirm materialize-starter-shell inspect-security --json

# Skills.sh skill import (always requires confirmations)
growthub starter import-skill acme/research-agent@1.2.0 --out ./ws-skill

# Browse skills.sh catalog, then import interactively
growthub starter browse-skills
```

## Validation

```bash
node scripts/check-fork-sync.mjs             # source-import structural section
bash scripts/pr-ready.sh                     # typecheck + test + kernel checks
```

The `check-fork-sync.mjs` source-import section asserts:

- Every file listed in the pipeline invariants exists under `cli/src/starter/source-import/`.
- `SourceKind` union is exactly `"github-repo" | "skills-skill"` in `types.ts`.
- `security.ts` exposes `inspectSourcePayload` and the four-value `SourceRiskClass`.
- No file under `cli/src/starter/source-import/` references `PAPERCLIP_HOME` or `resolvePaperclipHomeDir`.
- No file under `cli/src/starter/source-import/` imports `fork-sync.ts` or `fork-sync-agent.ts`.

## Definition Of Done

- All invariants above satisfied.
- `growthub starter import-repo <repo> --out <tmp>` produces a directory with valid `.growthub-fork/fork.json`, `policy.json`, `trace.jsonl`, `source-import.json`, plus a populated `imported/` payload and an `IMPORT_SUMMARY.md`.
- `growthub starter import-skill <skill> --out <tmp>` parks on confirmation by default and produces the same final state after resume.
- `cli/src/starter/source-import/` imports only the composing primitives listed above.
- `node scripts/check-fork-sync.mjs` passes with the source-import section green.
- Discovery Hub submenu + demo CLI preview entry are wired.
- Vitest coverage exists for detect, security, plan, github-source, skills-source, agent, and command layers.
