# Release Dist Rebuild — End-to-End Dev Workflow

Canonical procedure for shipping a new `@growthub/cli` / `@growthub/create-growthub-local` version from `growthub-ai/growthub-local`.

This document is the single source of truth for the maintainer lane (release orchestration + npm publication). Contributors in the OSS lane only need Phase A.

> **Claude Code note.** A Claude skill pointer lives at `.claude/skills/release-dist-rebuild/SKILL.md` (per-operator, gitignored). Future agent sessions invoke it via the Skill tool and read the body of this doc for the authoritative steps. If that SKILL.md is absent in your clone, recreate it from the template at the bottom of this file.

---

## 1. Why this document exists

The OSS tree is a **partial view** of the real workspace. Feature PRs live in the OSS tree; dist rebuilds require the full workspace. Confusing the two loses feature code at publish time — the failure mode is shipping `vX` source to npm with `v(X-1)` behavior because `cli/dist/index.js` was never rebuilt.

## 2. The two workspace views

| Surface | Where | Contains | Cannot do |
|---|---|---|---|
| **OSS tree** (`growthub-ai/growthub-local`) | this repo | `cli/`, `server/`, `ui/`, `packages/shared`, `packages/db/src/**`, `packages/create-growthub-local`, CI gates, docs | rebuild `cli/dist/index.js` (esbuild needs adapter/plugin packages absent here) |
| **Full workspace** (super-admin private) | super-admin environment | everything above + `packages/adapters/*` + `packages/plugins/*` + `packages/plugins/examples/*` + `packages/db/package.json` + `@paperclipai/server` source | n/a — is the complete source of truth |

`pnpm-workspace.yaml` at repo root lists all workspace globs; many resolve to empty dirs on the OSS tree. That is intentional. `cli/esbuild.config.mjs` hard-codes `workspacePaths` that include `packages/adapters/*` — running `pnpm --filter @growthub/cli run build` on the OSS tree alone will fail (ENOENT on `packages/db/package.json`, missing adapter directories).

**Mental model:** the OSS tree is the _source lane_ for feature PRs and CI; the full workspace is the _build lane_ for `cli/dist/index.js`. Committing the built dist to the OSS tree is how the two lanes stay in sync.

## 3. Why dist is committed to the OSS tree

`.github/workflows/release.yml` explicitly ships the committed `cli/dist/index.js` directly — it does not rebuild in CI. This was established by `0d6ef0a: ci: skip esbuild rebuild in CI — ship committed dist directly`. Reasons:

1. Release CI runs on ubuntu-latest against the public OSS tree — rebuilding would fail for the same workspace reason above.
2. Reproducibility: the dist that ships to npm is the exact file committed at the release SHA; anyone can `git show <sha>:cli/dist/index.js | sha256sum` and compare to the npm tarball.
3. Release-check (`scripts/release-check.mjs`) enforces tarball _shape_ (required files, no leaks) but does not verify dist-source parity — that is the super-admin's responsibility during rebuild.

**Invariant:** for any commit on `main` where `cli/package.json.version = X`, `cli/dist/index.js` must be the esbuild output of that same source at version X. If a feature PR bumps version without rebuilding dist, the next release publishes vX source with v(X-1) behavior.

## 4. End-to-end workflow

### Phase A — Source PR (OSS tree, any contributor)

Land the feature as a source-only change. Do **not** rebuild `cli/dist/index.js` here; the super-admin rebuilds in Phase B.

1. **Branch naming** — must match `^(feat|fix|docs|chore|ci|refactor|test|perf|adapter|sync)/.+`. Enforced by `.github/workflows/pr-validate.yml`.
2. **Implement** the change in `cli/src/**`. Add unit tests in `cli/src/__tests__/**`.
3. **Version bump** (required by `check-version-sync --require-bump-if-source-changed` whenever `cli/src/**` changes):
   - `cli/package.json` → bump minor for additive feature, patch for fix
   - `packages/create-growthub-local/package.json` → bump same semver step
   - `packages/create-growthub-local/package.json.dependencies["@growthub/cli"]` → pin to new cli version
4. **Local CI-gate validation** (every PR must pass these; run them before pushing):
   ```bash
   bash scripts/freeze-check.sh
   node scripts/check-version-sync.mjs
   node scripts/check-cli-package.mjs
   node scripts/check-worker-kits.mjs
   node scripts/check-fork-sync.mjs
   node scripts/release-check.mjs
   ```
   Any red gate blocks the PR. `release-check.mjs` passes on the OSS tree even if dist is stale — it checks shape, not version parity.
5. **Commit + push** — conventional commit, e.g. `feat(cli): Fork Authority Protocol`. PR title must also match `^(feat|fix|...): .{10,}`.
6. **Open draft PR → `main`** with ≥20-char body. Flag "dist rebuild required in Phase B" in the PR description so super-admin catches it at merge time.
7. **CI checks on the PR** — three jobs must go green:
   - `PR Validate / validate` — branch name, PR title, lockfile guard, PR description, version policy
   - `CI / verify` — all six gate scripts
   - `Smoke / smoke` — fresh-install smoke test

> **Anti-pattern:** don't include `cli/dist/index.js` changes in a feature PR from the OSS tree. The diff will be the old bundle with no new symbols — review noise, and the real rebuild must happen in Phase B anyway.

### Phase B — Dist rebuild (full workspace, super-admin only)

Immediately after the feature PR merges (or bundled with it), the super-admin produces the dist from the full workspace and commits it to `main` as a separate release commit.

1. **Sync the full workspace** to the merged OSS-tree SHA:
   ```bash
   cd /path/to/full-workspace
   git fetch origin
   git checkout main
   git reset --hard origin/main        # full-workspace main tracks OSS main
   pnpm install --frozen-lockfile
   ```
2. **Rebuild cli dist**:
   ```bash
   pnpm --filter @growthub/cli run build
   ```
   Runs esbuild against `cli/esbuild.config.mjs`:
   - entry: `cli/src/index.ts`
   - format: `esm`, target: `node20`, platform: `node`
   - bundles all `@paperclipai/*` workspace packages inline via the alias map
   - externalizes `@paperclipai/server` (loaded at runtime from `cli/dist/runtime/server/`)
   - externalizes every top-level npm dep from bundled packages (see `externals` set)
3. **Verify the rebuilt dist**:
   ```bash
   # shebang on line 1, once only (see 2087b26 for the duplicate-shebang regression)
   head -1 cli/dist/index.js                          # must be exactly: #!/usr/bin/env node
   grep -c "^#!/usr/bin/env node" cli/dist/index.js   # must be 1

   # new feature symbols present — e.g. for v0.7.0 authority protocol
   grep -q "signAuthorityEnvelope\|AuthorityEnvelope" cli/dist/index.js

   # runtime payload intact
   test -f cli/dist/runtime/server/dist/app.js
   test -d cli/dist/runtime/server/ui-dist
   ```
4. **Verify tarball shape**:
   ```bash
   cd cli && npm pack --dry-run
   cd ../packages/create-growthub-local && npm pack --dry-run
   ```
   `cli` tarball MUST contain:
   - `dist/index.js` (single-file bundle with shebang)
   - `dist/runtime/server/dist/app.js`
   - `dist/runtime/server/ui-dist/**`
   - `assets/worker-kits/*/kit.json` (all 10 bundled kits)

   `cli` tarball MUST NOT contain:
   - `src.zip`, `r2.dev` references (leak blockers)
   - raw `.ts` source files from our packages (`.d.ts`, `.js.map`, and vendor `node_modules/*.ts` are allowed)

5. **Run full release-check**:
   ```bash
   node scripts/release-check.mjs
   ```
   Must end with `release:check passed / @growthub/cli@<new-version> / @growthub/create-growthub-local@<new-version>`.

6. **Commit the rebuild back to the OSS tree**:
   ```bash
   cd /path/to/oss-tree
   git fetch origin
   git checkout main && git reset --hard origin/main
   cp /path/to/full-workspace/cli/dist/index.js cli/dist/index.js
   # if runtime payload changed, also sync cli/dist/runtime/ and cli/dist/utils/
   rsync -a --delete /path/to/full-workspace/cli/dist/runtime/ cli/dist/runtime/
   rsync -a --delete /path/to/full-workspace/cli/dist/utils/   cli/dist/utils/
   git add cli/dist/
   git commit -m "chore: rebuild dist — v<new-version> <feature-slug>"
   git push origin main
   ```

   Commit scope discipline: this commit should contain **only** rebuilt dist files. No source changes. No version-bump changes. No doc edits. That is how reviewers (and post-hoc auditors) confirm it is a deterministic artifact of the preceding source commit.

### Phase C — Release (super-admin only, workflow_dispatch)

1. Go to **Actions → Release (OSS) → Run workflow**.
2. Inputs:
   - `source_ref`: `main`
   - `stable_date`: UTC `YYYY-MM-DD` of the release window
   - `dry_run`: `true` for preview, `false` for real publish
3. Actor gate: `antonioromero1220` only (hard-coded in `release.yml`).
4. The `verify` job re-runs `freeze-check`, `check-fork-sync`, and `release-check` against the committed dist.
5. The `publish` job runs under the `npm-stable` environment, publishes both packages to npm with `--tag latest`, then creates a git tag.
6. Post-release smoke:
   ```bash
   # fresh install from npm — do NOT reuse repo-run state
   TMPDIR=$(mktemp -d) && cd "$TMPDIR"
   npx create-growthub-local@latest
   ./node_modules/.bin/growthub --version    # must equal new version
   # exercise any new surface — e.g. for v0.7.0 authority protocol:
   ./node_modules/.bin/growthub kit fork authority issuer list
   ```

## 5. Failure modes and how to recognize them

| Symptom | Root cause | Fix |
|---|---|---|
| `pnpm --filter @growthub/cli run build` fails with `ENOENT packages/db/package.json` | Running on OSS tree, not full workspace | Switch to full workspace; the OSS tree does not ship adapter/plugin/db packages. |
| Release workflow publishes vX but `growthub --version` on npm shows v(X-1) behavior | `cli/dist/index.js` is stale — source bumped, dist not rebuilt in Phase B | Re-run Phase B; ship a patch release with fresh dist. |
| `pr-validate` fails on `Validate branch name` | Branch doesn't match regex | Push the commit to a compliant branch name (`feat/<slug>`, etc.) and open a new PR. |
| `check-version-sync` fails `--require-bump-if-source-changed` | `cli/src/**` changed without `cli/package.json` version bump | Bump cli and create-growthub-local in lockstep; realign the pin. |
| `release-check` fails `raw .ts source file detected in tarball` | `cli/package.json.files` mis-includes `src/` | Keep `files` at `["dist", "assets"]` only. |
| Duplicate shebang (`#!/usr/bin/env node` appears twice in `cli/dist/index.js`) | esbuild `banner.js` + source `#!/...` collision (see `2087b26`) | Strip shebang from `cli/src/index.ts` OR remove `banner.js`; never both. |

## 6. When NOT to follow this workflow

- **Not for server-only changes** (`server/src/**`, `ui/src/**`). Those have their own publish paths (`@paperclipai/server`) and do not require cli dist rebuild unless the bundled runtime under `cli/dist/runtime/server/` also changed.
- **Not for docs / kernel-packet changes.** No version bump, no rebuild.
- **Not for worker-kit manifest changes** (`assets/worker-kits/**`). Those ship in the CLI tarball as-is — rebuild not needed for kit manifest edits, but `check-worker-kits.mjs` must pass.

## 7. Cross-references

- `docs/RELEASE_FREEZE.md` — freeze-boundary invariants and single-source-of-truth rules
- `scripts/release-check.mjs` — executable tarball-shape gate
- `cli/esbuild.config.mjs` — build configuration (workspace paths, alias map, externals)
- `.github/workflows/release.yml` — Release (OSS) workflow (super-admin, workflow_dispatch)
- `.github/workflows/pr-validate.yml` — branch-name, title, version-policy gates
- `.github/workflows/ci.yml` — verify job (all six gate scripts)

## 8. Quick reference — the six gate scripts

```bash
bash scripts/freeze-check.sh              # freeze boundary present
node scripts/check-version-sync.mjs       # cli + create-growthub-local versions aligned
node scripts/check-cli-package.mjs        # cli/package.json contracts
node scripts/check-worker-kits.mjs        # bundled kit manifests valid
node scripts/check-fork-sync.mjs          # Fork Sync Agent kernel packet structure
node scripts/release-check.mjs            # tarball shape, UI string invariants, runtime payload
```

All six must be green before Phase A merge and again before Phase C release.

---

## Appendix — Claude skill pointer template

Create at `.claude/skills/release-dist-rebuild/SKILL.md` in your clone (gitignored — `.gitignore` line 11 blocks `SKILL.md` globally). Claude Code discovers skills by scanning `.claude/skills/<name>/SKILL.md` in the project directory:

```markdown
---
name: release-dist-rebuild
description: End-to-end dev workflow for shipping a new @growthub/cli version. Use when bumping cli/package.json, rebuilding cli/dist/index.js, preparing the self-contained npm tarball, or triggering the Release (OSS) workflow. Covers the OSS-tree vs full-workspace split, the committed-dist pattern, and every gate between `pnpm install` and `npm publish`.
---

See `docs/RELEASE_DIST_REBUILD_WORKFLOW.md` for the canonical procedure.

Quick links:
- Phase A (source PR, OSS tree)         — any contributor
- Phase B (dist rebuild, full workspace) — super-admin only
- Phase C (Release OSS workflow_dispatch) — super-admin only
```
