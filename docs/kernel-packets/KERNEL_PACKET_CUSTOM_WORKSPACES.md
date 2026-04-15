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
- every path listed in `frozenAssetPaths`, `outputStandard.requiredPaths`, and `requiredFrozenAssets` physically exists on disk — if a path is listed and missing, the entire `listBundledKits()` call throws and **all kits disappear from discovery**
- `BUNDLED_KIT_CATALOG` includes the kit with `family: "studio"`
- discovery flow can list, inspect, and download the kit without runtime errors
- `QUICKSTART.md` is present and listed as a frozen asset
- `.env.example` is only listed in manifests if the file physically exists in the kit directory — omit it from all three manifest lists (`frozenAssetPaths`, `outputStandard.requiredPaths`, `requiredFrozenAssets`) if it is not present
- CI gates are green (`validate`, `smoke`, `verify`)
- `cli/dist/index.js` esbuild bundle is rebuilt from source and force-committed after any source change — the release workflow does not build; it publishes the committed bundle as-is
- `grep 'packageDirName' cli/dist/index.js | wc -l` matches the number of entries in `cli/src/kits/catalog.ts`

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
  - `QUICKSTART.md`
  - `validation-checklist.md`
  - `setup/check-deps.sh`
  - `setup/verify-env.mjs`
  - `.env.example` — only if the kit uses env vars at kit-bundle level; if included, it must physically exist on disk and be listed in `frozenAssetPaths`, `outputStandard.requiredPaths`, and `requiredFrozenAssets`; if not included, omit it from all three manifest lists entirely

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

- rebuild the esbuild bundle: `cd cli && node --input-type=module` using `esbuild.config.mjs` (see Release Bundle Contract above)
- verify `grep 'packageDirName' cli/dist/index.js | wc -l` equals the number of kits in `catalog.ts`
- force-commit the bundle: `git add -f cli/dist/index.js`
- merge PR after checks are green
- trigger release workflow: `gh workflow run release.yml --ref main --field dry_run=false`
- confirm npm remote: `npm view @growthub/cli version`
- confirm all kits in the remote package: fresh `npm install @growthub/cli@<version>` + `kit list --json`
- if a broken version was published, bump version, rebuild, and republish — npm will not overwrite

## Reuse Beyond Worker Kits

This packet is reusable for other CLI extension work by keeping the same shape:

- **contract primitive:** machine-readable source of truth
- **registration primitive:** one canonical discovery/index registration point
- **validation primitive:** deterministic scripts + focused Vitest suite
- **release primitive:** CI gates + release workflow + remote publish proof

Apply the same structure for Templates, Workflows, Local Intelligence, and future discovery lanes.

## Specializations

When a worker kit's external target is a hosted third-party SaaS REST API (no fork, no self-host, no new executor), use the narrower specialization that inherits every invariant of this packet and adds the thin-hosted-provider discipline:

- [Hosted SaaS Kit Kernel Packet](./KERNEL_PACKET_HOSTED_SAAS_KIT.md)

## Release Bundle Contract

This contract governs the relationship between source changes, the esbuild bundle, and what remote npm users actually receive. It is the most common source of silent drift and must be understood before any release.

### The bundle is what ships — not the TypeScript source

`cli/dist/index.js` is a single-file esbuild bundle generated from `cli/src/index.ts`. It is what `npm publish cli/` sends to the registry. The TypeScript source in `cli/src/` and the multi-file tsc output are **not** what remote users run.

**Critical:** `BUNDLED_KIT_CATALOG` from `cli/src/kits/catalog.ts` is baked into the bundle at build time. Adding a new kit to `catalog.ts` does not update the bundle. The bundle must be explicitly rebuilt and committed for the change to reach npm users.

### The release workflow does not build

`scripts/release.sh` and `.github/workflows/release.yml` do not run any build step. They verify `cli/dist/index.js` exists and publish it as-is. A stale bundle = stale package for all users.

### The bundle is gitignored and must be force-committed

`cli/dist/` is in `.gitignore`. After rebuilding, the bundle must be staged with `git add -f cli/dist/index.js` before committing.

### How to rebuild the bundle

From the repo root:

```bash
cd cli && node --input-type=module <<'SCRIPT'
import config from './esbuild.config.mjs';
const { build } = await import('/path/to/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/lib/main.js');
await build(config);
console.log('done');
SCRIPT
```

Or locate esbuild in the pnpm store:

```bash
find node_modules/.pnpm/esbuild@* -name "esbuild" -type f | head -1
# then run: <esbuild-binary> src/index.ts --bundle ... (see esbuild.config.mjs for full flags)
```

After rebuilding, verify the bundle contains all catalog entries:

```bash
grep 'packageDirName' cli/dist/index.js | wc -l
# must equal the number of kits in cli/src/kits/catalog.ts
```

### Full release sequence — required every time source changes ship

```bash
# 1. Rebuild the bundle from source
cd cli && node --input-type=module <<'SCRIPT'
import config from './esbuild.config.mjs';
const { build } = await import('<esbuild-path>');
await build(config); console.log('done');
SCRIPT

# 2. Verify bundle has all kits
grep 'packageDirName' dist/index.js | wc -l   # must match catalog.ts entry count

# 3. Force-add the gitignored bundle and commit
cd ..
git add -f cli/dist/index.js
git commit -m "chore(dist): rebuild esbuild bundle for <version>"

# 4. Push to main (or PR if branch protection requires it)

# 5. Trigger the release workflow
gh workflow run release.yml --ref main --field dry_run=false

# 6. Confirm remote npm version and kit list
npm view @growthub/cli version
node node_modules/@growthub/cli/dist/index.js kit list --json | grep '"id"'
```

### npm will not overwrite a published version

If the release workflow ran with a stale bundle and published the wrong package at version `X`, that version is permanently broken on npm. The only fix is to bump to `X+1`, rebuild the bundle correctly, and republish. Always verify the remote package with a fresh `npm install` before treating a release as done.

### PR body must use plain text

The `pr-validate.yml` CI check inlines `${{ github.event.pull_request.body }}` directly into a bash script. PR body text containing backticks, parentheses, or markdown code spans will be interpreted as shell commands and fail the check. Use plain prose with no markdown code formatting in PR descriptions.

## Discovery Parity Contract

This contract governs the required parity between the demo CLI preview and the npm-published `growthub discover` command. They must be identical at all times.

### Why they are the same

Both surfaces call the same function:

- `scripts/demo-cli.sh cli discover` → `runCli(["discover"])` → `runDiscoveryHub` → `runInteractivePicker`
- `growthub discover` (npm install) → `runDiscoveryHub` → `runInteractivePicker`
- `scripts/demo-cli.sh interactive` → `runSourceKitPicker` → `runInteractivePicker`

`runInteractivePicker` calls `listBundledKits()` which reads from `BUNDLED_KIT_CATALOG` and validates every kit's assets at runtime. The catalog and assets ship inside `cli/assets/` which is in `"files": ["dist", "assets"]` in `cli/package.json`.

### Failure mode: one broken kit kills all kits

`listBundledKits()` maps over the entire catalog. If any single kit fails validation (missing file listed in a manifest), the function throws and **zero kits appear in discovery** for all users — demo and npm alike. This is not a partial failure.

**Rule:** before any merge, run `node scripts/check-worker-kits.mjs` and confirm all kits load with zero errors.

### Version pin rule

The `.version()` call in `cli/src/index.ts` must always match `cli/package.json`. Drift here means npm users see a stale version string.

**Rule:** when bumping `cli/package.json` version, update `.version()` in `index.ts` in the same commit.

### Help text surface rule

The `growthub kit download` examples in `index.ts` help text and the `studio` family example in `kit.ts` `families` command must include at least one representative kit from each active studio sub-category (fork-based studios, Hosted SaaS studios). A help text that only names `higgsfield` while postiz and zernio are live is discoverable drift.

**Rule:** when a new studio kit ships, add its fuzzy slug to the download examples in `index.ts` and update the studio family example list in `kit.ts`.

### Verification checklist before every merge

```bash
# 1. All kits load — zero errors
node scripts/check-worker-kits.mjs

# 2. Version parity
node -e "const p=require('./cli/package.json');const s=require('fs').readFileSync('cli/src/index.ts','utf8');const m=s.match(/\.version\(\"([^\"]+)\"\)/);console.log('package.json:',p.version,'index.ts:',m?m[1]:'NOT FOUND',p.version===m?.[1]?'✓ MATCH':'✗ DRIFT')"

# 3. Discovery round-trip
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
```

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
