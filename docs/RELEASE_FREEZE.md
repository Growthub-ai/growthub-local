# Release Freeze

## Repo Boundary

Growthub Local package publishing must happen from this repo boundary only.

## Package Owners

- `@growthub/cli`
- `create-growthub-local`

## Required Validation Before Publish

1. `pnpm build`
2. `npm pack --dry-run` in `cli/`
3. `npm pack --dry-run` in `packages/create-growthub-local/`
4. fresh DX install validation
5. fresh GTM install validation
6. hosted Growthub connection validation

## Validation Isolation

Always validate with explicit temp config and temp data dirs.

Do not validate using:

- shared `default` instance state
- stale repo-run ports
- npm-installed sessions from older builds

## Single Source Of Truth

If a change is validated but not reproducible from this repo boundary, it is not frozen.
