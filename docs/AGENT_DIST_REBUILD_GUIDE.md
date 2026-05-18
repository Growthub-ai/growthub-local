# Agent Dist Rebuild Guide

Agent-first prescriptive guide for working with `cli/dist/index.js` in `growthub-local`. Read this **before** any task that touches `cli/src/**`, `cli/package.json`, `packages/create-growthub-local/package.json`, or anything in `cli/dist/**`.

This guide is grounded in:

- [`docs/RELEASE_DIST_REBUILD_WORKFLOW.md`](./RELEASE_DIST_REBUILD_WORKFLOW.md) — the canonical human-maintainer reference (super-admin lane)
- [`AGENTS.md`](../AGENTS.md) — the repo's agent contract and source-of-truth order
- `cli/src/runtime/memory/**` — the JSON-file Memory & Knowledge layer (no native deps, no SQLite)
- `cli/src/auth/effective-profile.ts` + `cli/src/auth/growthub-local-profile.ts` — the profile primitives
- `scripts/agent-dist-verify.sh` — the executable companion to this guide

If anything in this doc conflicts with `AGENTS.md` or `RELEASE_DIST_REBUILD_WORKFLOW.md`, treat those as authoritative and open a docs-only PR to reconcile.

---

## 1. Mental model — what `cli/dist/index.js` is and why it's committed

`@growthub/cli` ships to npm as a **self-contained single-file bundle** at `cli/dist/index.js` (~1.6 MB, shebang on line 1). The repository commits the bundle directly because:

1. **Release CI does not rebuild.** `.github/workflows/release.yml` ships the file at the release SHA exactly — anyone can `git show <sha>:cli/dist/index.js | sha256sum` and compare to the npm tarball.
2. **The OSS tree cannot rebuild it.** `cli/esbuild.config.mjs` references workspace packages (`packages/adapters/*`, `packages/plugins/*`, `packages/db/package.json`) that don't exist in the OSS view. A `pnpm --filter @growthub/cli run build` from the OSS tree alone fails with `ENOENT`.
3. **Reproducibility.** The committed dist is the source of truth for "what behavior does v0.X actually have." Without commit + verify, you can ship v0.13 source with v0.12 behavior because dist drifted.

The hard invariant:

> **For any commit on `main` where `cli/package.json.version = X`, `cli/dist/index.js` must be the deterministic esbuild output of that same source at version X.**

If you violate this, the npm release silently regresses.

---

## 2. The two-lane workspace topology

| Lane | Contains | Can rebuild dist? | Who works here |
| --- | --- | --- | --- |
| **OSS tree** (`growthub-ai/growthub-local`, this repo) | `cli/`, `server/`, `ui/`, `packages/shared`, `packages/db/src/**`, `packages/create-growthub-local`, CI gates, docs | ❌ No (missing adapter/plugin packages) | Every contributor, every agent (Phase A) |
| **Full workspace** (super-admin private) | OSS tree + `packages/adapters/*` + `packages/plugins/*` + `packages/db/package.json` + `@paperclipai/server` source | ✅ Yes | Super-admin only (Phase B) |

`pnpm-workspace.yaml` enumerates globs that resolve to empty directories on the OSS tree on purpose. **Agents should never try to fill them in.**

---

## 3. The three phases of a release

```
Phase A (OSS tree, any agent)
   source change → version bump → green CI → merge
   |
Phase B (full workspace, super-admin)
   sync to merged SHA → esbuild rebuild → verify shebang + symbols + tarball
   → commit rebuilt cli/dist/** back to main as a "chore: rebuild dist" commit
   |
Phase C (super-admin, workflow_dispatch)
   Actions → Release (OSS) → npm publish → git tag
   → fresh-install smoke against npm
```

Agents working from the OSS tree own **Phase A**. They never run Phase B or Phase C. They never commit `cli/dist/**` changes in a Phase A PR — that is a hard anti-pattern. See §5.

---

## 4. Decision tree — "what should I do for this change?"

```
What am I editing?
├── docs/**, AGENTS.md, README.md, .claude/skills/**, kernel-packet docs
│       → docs-only PR. NO version bump. NO dist rebuild.
│       → Run: bash scripts/agent-dist-verify.sh docs-only
│
├── cli/src/**
│       → Phase A source PR (this guide §6).
│       → Bump cli + create-growthub-local versions in lockstep.
│       → DO NOT touch cli/dist/**.
│       → Run: bash scripts/agent-dist-verify.sh pre-push
│
├── cli/dist/**
│       → STOP. Are you super-admin doing a Phase B rebuild?
│       → If no: revert your dist edits and stay in Phase A.
│       → If yes: follow docs/RELEASE_DIST_REBUILD_WORKFLOW.md §4 Phase B.
│         Run: bash scripts/agent-dist-verify.sh rebuild-dist (full workspace only)
│
├── cli/package.json or packages/create-growthub-local/package.json
│       → Either Phase A (version bump alongside source) or Phase B (no-op).
│       → The two package versions must match exactly.
│       → create-growthub-local.dependencies["@growthub/cli"] must pin to the same version.
│       → Run: bash scripts/agent-dist-verify.sh version-sync
│
├── packages/api-contract/src/**
│       → Phase A source PR. Bump @growthub/api-contract independently.
│       → CLI dist bundles api-contract inline (see cli/esbuild.config.mjs apiContractAliases),
│         so cli dist rebuild is still needed if the bundled types change.
│       → Run: bash scripts/agent-dist-verify.sh pre-push
│
├── cli/assets/worker-kits/**, cli/assets/shared-templates/**
│       → Phase A asset PR. Often no version bump (manifest-only edits) — but
│         run check-worker-kits.mjs to confirm.
│       → Dist rebuild is NOT required for kit manifest changes — assets ship
│         as files alongside dist.
│       → Run: bash scripts/agent-dist-verify.sh assets
│
└── server/src/**, ui/src/**
        → Out of scope for this guide. Server/UI have their own publish path
          (@paperclipai/server). Skip dist rebuild unless the cli/dist/runtime/server/
          payload also changed.
```

---

## 5. Hard anti-patterns

Doing any of these breaks releases or wastes review cycles:

1. **Committing `cli/dist/**` from the OSS tree in a source PR.** The bundle is incomplete (missing adapter/plugin code) and will be reverted in Phase B. The diff is also useless review noise.
2. **Bumping `cli/package.json` version without bumping `packages/create-growthub-local/package.json`.** `scripts/check-version-sync.mjs` will fail with `--require-bump-if-source-changed`.
3. **Updating `dependencies["@growthub/cli"]` in `create-growthub-local/package.json` to a version that doesn't match `cli/package.json`.** Same gate.
4. **Adding raw `.ts` source files to the CLI tarball.** Keep `cli/package.json.files` as `["dist", "assets", "README.md"]`. `scripts/release-check.mjs` enforces this.
5. **Allowing two shebang lines in `cli/dist/index.js`.** esbuild's `banner.js` and a `#!/usr/bin/env node` line in `cli/src/index.ts` will collide. Strip one, never both. Regression to watch for: commit `2087b26`.
6. **Force-pushing to `main` or rewriting release commits.** Reproducibility depends on the committed SHAs.
7. **Skipping `bash scripts/pr-ready.sh` before push.** It runs the gate ladder locally so you see failures before CI does.

---

## 6. Phase A — the agent-owned lane

Every Phase A PR must:

1. **Branch name** matches `^(feat|feature|fix|docs|chore|ci|refactor|test|perf|adapter|sync|cursor|codex)/.+`. Enforced by `.github/workflows/pr-validate.yml`.
2. **PR title** matches the same regex with at least 10 characters of subject.
3. **Source change** in `cli/src/**` only — never `cli/dist/**`.
4. **Lockstep version bump** in `cli/package.json` AND `packages/create-growthub-local/package.json` AND the pin in `packages/create-growthub-local/package.json.dependencies["@growthub/cli"]`. Use semver minor for additive, patch for fix.
5. **Tests** alongside the change in `cli/src/__tests__/**` where reasonable.
6. **Six green gates** locally before push:
   ```bash
   bash scripts/freeze-check.sh
   node scripts/check-version-sync.mjs
   node scripts/check-cli-package.mjs
   node scripts/check-worker-kits.mjs
   node scripts/check-fork-sync.mjs
   node scripts/release-check.mjs
   ```
   Or run them all via `bash scripts/agent-dist-verify.sh pre-push`.
7. **PR description ≥20 chars**, with `dist rebuild required in Phase B` flagged for super-admin if `cli/src/**` changed.

CI on the PR runs three workflow groups:

- **PR Validate** — branch name, PR title, lockfile guard, PR description, version policy
- **CI / verify** — the six gate scripts above
- **Smoke / smoke** — fresh-install smoke test against the proposed dist

If any are red, fix locally and push the same branch. Do not open a new PR.

---

## 7. Phase B — super-admin only

Agents should never run Phase B. If a task description tells you to "rebuild dist" or "ship to npm," confirm with the maintainer first. Phase B requires:

- The full private workspace
- The super-admin's npm credentials and GitHub Actor gate (`antonioromero1220`)
- A separate `chore: rebuild dist` commit with only `cli/dist/**` changes

Phase B is documented in full in [`docs/RELEASE_DIST_REBUILD_WORKFLOW.md`](./RELEASE_DIST_REBUILD_WORKFLOW.md) §4. This guide intentionally does not duplicate it.

---

## 8. Verification ladder

Run these in order. Stop at the first failure and fix before continuing.

```bash
# Tier 1 — fast, deterministic, runs in <5s
node scripts/check-version-sync.mjs              # cli + create-growthub-local versions aligned
node scripts/check-cli-package.mjs               # cli/package.json contracts
node scripts/check-fork-sync.mjs                 # discovery hub gate strings + fork-sync structure

# Tier 2 — schema + asset checks, ~15s
node scripts/check-worker-kits.mjs               # bundled kit manifests valid
bash scripts/freeze-check.sh                     # freeze boundary present

# Tier 3 — tarball shape, ~30s
node scripts/release-check.mjs                   # cli + create-growthub-local pack shape

# Tier 4 — TypeScript correctness, ~30s
pnpm --filter @growthub/cli exec tsc --noEmit                     # source-only types
pnpm --filter @growthub/cli exec tsc --noEmit -p tsconfig.test.json  # test types

# Tier 5 — unit tests, ~2 min
pnpm --filter @growthub/cli exec vitest run

# Tier 6 — smoke against the locally-built dist (only super-admin can rebuild,
# but every agent can SMOKE the existing committed dist):
node cli/dist/index.js --version
node cli/dist/index.js auth whoami --json
node cli/dist/index.js workspace status --json
rm -rf /tmp/growthub-smoke && mkdir -p /tmp/growthub-smoke && cd /tmp/growthub-smoke
node /Users/<you>/growthub-local/cli/dist/index.js kit download growthub-custom-workspace-starter-v1 --out ./ws --yes
ls ./ws/apps/workspace/package.json     # README one-liner must still produce this
```

`bash scripts/agent-dist-verify.sh pre-push` runs Tiers 1–4 in one shot.

---

## 9. Memory & Knowledge ↔ Growthub Local Profile alignment

The Memory & Knowledge module (`cli/src/runtime/memory/**`) is **JSON-file-backed, no native dependency, no SQLite**. It pairs with the Growthub Local profile primitives at `cli/src/auth/growthub-local-profile.ts` and `cli/src/config/growthub-local-home.ts` to form the PLG identity surface:

```
Growthub Local Profile (one identity per machine)
   ├── ~/.paperclip/instances/<id>/config.json   ← GrowthubLocalProfile envelope
   ├── ~/.paperclip/memory/projects/<slug>.json  ← per-project observations + summaries
   ├── ~/.paperclip/memory/provider-config.json  ← AI provider for memory ops
   └── ~/.paperclip/memory/sync-state.json       ← per-project sync cursor + auto-sync flag
        └── synced (when authed) → hosted Growthub account
```

The on-disk layout stays under `~/.paperclip/` even with the new `GROWTHUB_LOCAL_HOME` env-var — that is the entire point of the non-destructive mirror. See `cli/src/config/growthub-local-home.ts` for the resolution chain.

When you edit either layer, run:

```bash
pnpm --filter @growthub/cli exec tsc --noEmit
node cli/dist/index.js --version           # confirms dist still loads
# Then headless-test the Memory & Knowledge surface against a real profile:
node cli/dist/index.js auth whoami --json
node cli/dist/index.js memory status --project <project> --json
node cli/dist/index.js memory seed --project <project> --title "Smoke memory" --narrative "Dist write/read smoke" --json
node cli/dist/index.js memory sync --project <project> --json
node cli/dist/index.js memory pull --project <project> --json
```

If the bound `--json` envelope changes, update `cli/src/runtime/memory/profile-binding.ts` and the discovery hub's `inspectMemoryProfileBinding()` call site together.

The live hosted knowledge routes used by the rebuilt dist are `POST /api/knowledge/upload` for writes and `GET /api/knowledge-base/list` for readback. Do not use `/api/providers/growthub-local/probe` as memory persistence; it is only a bridge health check.

---

## 10. When in doubt, default to source-only

If you cannot tell whether a change needs a dist rebuild, **ship it source-only**. The super-admin will rebuild in Phase B. The worst outcome of being conservative is a single extra rebuild commit. The worst outcome of guessing wrong on a feature PR is shipping vX source with v(X−1) behavior — much harder to recover from.

---

## 11. Cross-references

- `docs/RELEASE_DIST_REBUILD_WORKFLOW.md` — canonical procedure (super-admin lane)
- `AGENTS.md` — agent contract for this repo
- `scripts/agent-dist-verify.sh` — executable companion to this guide
- `scripts/release-check.mjs` — tarball shape gate
- `scripts/check-fork-sync.mjs` — discovery hub gate strings
- `cli/esbuild.config.mjs` — bundle configuration
- `.github/workflows/release.yml` — Release (OSS) workflow_dispatch
- `.github/workflows/pr-validate.yml` — Phase A gates
- `.github/workflows/ci.yml` — verify job (the six gate scripts)
