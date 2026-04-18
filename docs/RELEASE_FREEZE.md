# Release Freeze

> For the end-to-end dev → rebuild → publish workflow (OSS tree vs full workspace, Phases A / B / C), see `docs/RELEASE_DIST_REBUILD_WORKFLOW.md`. This doc covers the freeze-boundary invariants that workflow must not violate.

## Repo Boundary

Growthub Local package publishing must happen from this repo boundary only.

## Package Owners

- `@growthub/cli`
- `create-growthub-local`

## Required Validation Before Publish

1. `pnpm build`
2. `pnpm release:check`
3. `npm pack --dry-run` in `cli/`
4. `npm pack --dry-run` in `packages/create-growthub-local/`
5. fresh DX install validation
6. fresh GTM install validation
7. hosted Growthub connection validation

## Release Gate

`pnpm release:check` must fail if any of these drift:

- package version alignment between `@growthub/cli` and `create-growthub-local`
- package metadata still points at the monorepo instead of `growthub-local`
- the local source no longer contains:
  - `Growthub Connection`
  - `Open Configuration`
  - `Pulse`
  - `Disconnect`
  - hosted `/integrations` launch
  - local `/auth/callback`
- the CLI tarball no longer contains the bundled runtime payload

## Validation Isolation

Always validate with explicit temp config and temp data dirs.

Do not validate using:

- shared `default` instance state
- stale repo-run ports
- npm-installed sessions from older builds

## Single Source Of Truth

If a change is validated but not reproducible from this repo boundary, it is not frozen.

## GTM Knowledge Base Freeze

The current GTM Knowledge Base runtime fix is frozen as a source change first, not as a
`gtm-fresh` runtime patch.

Canonical source files:

- `server/src/app.ts`
- `server/src/routes/knowledge-base.ts`

What changed:

- mount the GTM knowledge-base route under `/api/gtm/knowledge-base`
- normalize `db.execute(...)` result handling so the live embedded Postgres runtime works

Do not treat these as source of truth:

- `gtm-fresh/growthub-local/server/dist/**`
- `gtm-fresh/growthub-local/server/ui-dist/**`
- `gtm-fresh/growthub-local/cli/dist/runtime/**`

Those files may be patched or rebuilt for validation, but they are derived artifacts only.

## Promotion Rule For This Fix

1. Preserve the source fix in `growthub-local`.
2. Mirror the same source fix into the full monorepo build environment when needed.
3. Rebuild `server/ui-dist` and `cli/dist/runtime/server/ui-dist` from the full build environment.
4. Rebuild the bundled server runtime used by `@growthub/cli`.
5. Run `node scripts/release-check.mjs`.
6. If the behavior ships to npm users, bump `@growthub/cli` and `create-growthub-local` patch versions together.

## PR Size Rule

If a source fix is correct but the rebuilt dist payload is too large or noisy for the feature PR,
keep the feature PR focused on source and package metadata first, then generate the bundled dist in
the release step or dedicated release commit required by the publish flow.
