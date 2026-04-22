# Release — Growthub API v1

What this release ships and what stability guarantees come with it.

## Shipped

- `@growthub/api-contract@1.0.0` — canonical v1 type contract package
  - `capabilities`, `pipelines`, `execute`, `provider`, `manifest`,
    `metrics`, `routes`
- CLI:
  - `growthub environment` / `environment snapshot` / `environment refresh`
  - `growthub chat` (one-shot + interactive) + `StreamingConsole` primitive
  - `growthub capability refresh` / `register` / `diff` / `clear-cache`
    backed by the new manifest envelope, TTL cache, and local-extension loader
  - `growthub authority show` / `verify` / `issuers`
  - `growthub policy show` / `check <slug>` / `providers`
  - `growthub org show` / `entitlements` / `gated`
- Discovery hub additions:
  - 🧭 Environment Management lane
  - 💬 Chat lane
- Runtime primitives:
  - `cli/src/runtime/cms-capability-registry/{manifest,cache,local-extensions,schema}.ts`
  - `cli/src/runtime/environment-snapshot/{index,renderers,types}.ts`
  - `cli/src/runtime/streaming-console/{index,session-log,types}.ts`
- Docs:
  - `docs/GROWTHUB_API_V1.md`
  - `docs/CMS_NODE_MANIFEST_REGISTRY.md`
  - `docs/ENTERPRISE_MANAGEMENT.md`
  - `docs/RELEASE_GROWTHUB_API_V1.md` (this file)

## Stability

- v1 is **additive-only**. Breaking changes require v2.
- CLI-facing imports from `cli/src/runtime/cms-capability-registry/types.ts`,
  `cli/src/runtime/hosted-execution-client/types.ts`, and
  `cli/src/runtime/dynamic-registry-pipeline/types.ts` continue to resolve
  unchanged — each file re-exports from `@growthub/api-contract`.

## Unchanged

- The hosted route surface (six canonical endpoints) — v1 names existing
  routes, it does not rename them.
- The `KitForkPolicy` interface — v1 policy fields live under
  `policy.metadata.*` to avoid breaking existing fork policy files.
- The workflow picker, pipeline assembler, and harness hubs — unchanged.

## Known follow-ups

- Hosted server implementation of `/api/cli/capabilities` returning the
  envelope shape (CLI consumes whatever the hosted app emits; adapter
  exists).
- Hosted → local job dispatch (called out in the architecture report's
  Addendum; not part of v1).
- `@growthub/provider-sdk` — a dedicated publish of `ProviderOperationContract`
  so external adapters can depend on it without cloning the monorepo.

## Version bumps

- `cli/package.json` ships with the same version cadence; bump per the
  existing `release-check.mjs` rules before publishing.
- `packages/growthub-api-contract/package.json` starts at `1.0.0` and
  follows independent SemVer afterward.
