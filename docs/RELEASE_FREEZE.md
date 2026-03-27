# Release Freeze

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
