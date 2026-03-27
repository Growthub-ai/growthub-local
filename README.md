# Growthub Local

Dedicated repository boundary for the local Growthub product.

This repo is intended to own only the local machine runtime:

- DX surface
- GTM surface
- local CLI/runtime packaging
- local server routes
- local UI
- local config schema
- local installer packages
- the hosted Growthub bridge contract

This repo must not absorb private hosted control-plane code.

## Source Boundary

Initial extraction source from the monorepo:

- `cli/`
- `server/`
- `ui/`
- `packages/shared/`
- `packages/create-growthub-local/`

## Private Exclusions

Do not extract or publish:

- hosted `gh-app`
- private Growthub account logic
- token minting internals
- Supabase/RLS implementation details
- super-admin and internal-only hosted routes
- internal deployment automation

## Freeze Rules

1. Validate local behavior from this repo only.
2. Validate DX and GTM against explicit temp config/data dirs.
3. Publish `@growthub/cli` and `create-growthub-local` only from this repo.
4. Keep the hosted integration contract documented and versioned.

## Current Extraction Status

This skeleton is the freeze point for separating Growthub Local from the monorepo.
Use `scripts/sync-from-monorepo.sh` to copy the allowed source tree into this repo boundary.
