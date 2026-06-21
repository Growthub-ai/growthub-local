# Unified API Resolver Registry Release Snapshot V1

Canonical completed-work snapshot for the **Unified API Resolver Registry**
release.

This release turns an API Registry row into a governed, traceable, callable
resolver without making the user author resolver code or reconcile disconnected
tables. The completed path is:

`API Registry record -> server-side test -> response shape -> constructed
resolver -> generated registry artifacts -> dynamic resolver endpoint ->
workflow canvas API Registry node`.

Companion contract:

- [`docs/UNIFIED_API_RESOLVER_REGISTRY_CONTRACT_V1_5_1.md`](./UNIFIED_API_RESOLVER_REGISTRY_CONTRACT_V1_5_1.md)

## Source-of-truth summary

The `api-registry` row remains the governed source of truth. Resolver files,
the resolver registry index, the endpoint manifest, and the dynamic endpoint are
all projections of that row.

The release adds no new PATCH allowlist field, no new object model, no browser
secret storage, and no hand-edited generated resolver source. Resolver writes
stay inside the governed helper/server-file lane; workflow use stays inside the
existing workflow canvas and sandbox execution model.

## Release versions

- `@growthub/api-contract`: `1.5.1`
- `@growthub/cli`: `0.14.5`
- `@growthub/create-growthub-local`: `0.14.5`

Per [`docs/AGENT_DIST_REBUILD_GUIDE.md`](./AGENT_DIST_REBUILD_GUIDE.md), this
is Phase A source packaging. `cli/dist/**` is not committed in this PR; dist
rebuild remains a release-owner Phase B artifact.

## User-facing feature

### API Registry sidecar

The selected API Registry record now has a closed-loop activation path. The
sidecar derives state from the row, last test response, response profile,
resolver linkage, generated artifacts, and source-record evidence.

The user-facing result:

- The user registers and tests the API from the API Registry record.
- The workspace profiles the response shape from the real server-side test.
- The resolver action is generated from the tested shape instead of asking the
  user to fill `rootPath`, `idField`, or entity fields from scratch.
- The review surface explains detected record path, id field, entity type,
  pagination, confidence, and endpoint before apply.
- The row can open a real workflow canvas with the API Registry call already
  drafted into the graph.

### Workflow canvas handoff

The previous fake sandbox-tool draft panel is not the user journey. The release
path opens the actual workflow canvas with the drafted graph:

- human input trigger
- input step
- API Registry call node
- transform/filter step
- result node

That canvas path preserves the user mental model: the API they just registered
is the API they can call and test in workflow context.

## Agent-facing feature

Agents no longer have to infer resolver state from scattered files and rows.
The release adds a single resolver truth surface:

- `GET /api/workspace/resolvers` returns the additive `registry` index.
- `_registry.generated.json` mirrors the governed registry state for local file
  readback.
- `_endpoints.generated.json` mirrors exposed resolver endpoints.
- `/api/resolvers/<integrationId>` executes registered tested resolvers through
  the governed endpoint lane.
- `scripts/check-resolver-registry.mjs` fails CI on stale artifacts, orphan
  generated files, endpoint-manifest drift, and identity collisions.

Each registry entry carries the agent-operable facts: `recordRef`,
`integrationId`, `resolverId`, `connectorKind`, provenance, file path,
registered/tested state, shape, score, trust, endpoint, evidence, and next
action.

## Files changed by phase

### Phase 1 — Registry correlation and generated artifacts

- `.../apps/workspace/lib/unified-resolver-registry.js` — pure derivation of
  one resolver registry entry per governed `api-registry` row.
- `.../apps/workspace/lib/server-resolver-registry.js` — gated artifact writer
  for `_registry.generated.json` and `_endpoints.generated.json`.
- `.../apps/workspace/app/api/workspace/resolvers/route.js` — additive
  `registry`, `registryStatus`, artifact write reporting, and degraded-state
  reporting.
- `.../apps/workspace/lib/workspace-resolver-proposal.js` — generated resolver
  provenance banner and row linkage.

### Phase 2 — Constructed resolver, not blank form

- `.../apps/workspace/lib/resolver-constructor.js` — builds governed resolver
  proposals from tested response profile, recommendation, connector kind, and
  row metadata.
- `.../apps/workspace/app/data-model/components/DataModelShell.jsx` — API
  Registry sidecar action that constructs the resolver review from row state and
  opens workflow canvas for the drafted API Registry call.
- `.../apps/workspace/lib/api-registry-creation-flow.js` and
  `.../apps/workspace/lib/api-response-profile.js` — reused as the response
  profile and activation-state source; no separate resolver wizard state.

### Phase 3 — Governed resolver endpoint and drift guard

- `.../apps/workspace/app/api/resolvers/[integrationId]/route.js` — dynamic,
  app-scoped resolver endpoint.
- `scripts/check-resolver-registry.mjs` — CI drift guard for resolver registry
  artifacts and endpoint manifests.
- `scripts/unit-resolver-registry.test.mjs` — unit coverage for registry
  derivation, constructor behavior, trust/hints, collisions, drift, taxonomy,
  secret safety, and the no-code golden path.
- `packages/api-contract/src/resolver-registry.ts` — public 1.5.1 API contract
  types/constants/guard for resolver registry consumers.

## Runtime proof captured before release packaging

Verified in the exported temp workspace:

`/Users/antonio/growthub-worker-kit-exports/feature-work-2026-06-21T00-19-19-852Z/growthub-custom-workspace-starter-v1/apps/workspace`

against:

`http://127.0.0.1:3778`

Observed proof:

- `GET /api/workspace` showed writable filesystem persistence.
- `POST /api/workspace/patch/preflight` returned `200`, `ok: true`,
  `policyOk: true`, and `0` violations.
- `POST /api/workspace/sandbox-run` for
  `sandbox-probe / jsonplaceholder-users-workflow` returned `200`, `ok: true`,
  adapter `orchestration-graph`, runtime `node`, `exitCode: 0`, and persisted
  source `sandbox:sandbox-probe:jsonplaceholder-users-workflow`.
- `GET /api/resolvers/jsonplaceholder-users` returned `200`, `ok: true`,
  `recordCount: 10`, with first real record `Leanne Graham`.
- `GET /api/workspace/resolvers` showed `jsonplaceholder-users` as
  `registered: true`, `tested: true`, `score: 100`, `trust: endpoint-live`,
  `agentReady: true`, `agentCallable: true`, endpoint
  `/api/resolvers/jsonplaceholder-users`.
- `GET /api/workspace/agent-outcomes` contained execution-proof receipt
  `aor_mqn40v6u_ewgstk` for run `run_mqn40v32_lqlq1f`.
- Browser-visible workflow canvas opened on
  `/workflows?object=sandbox-probe&row=jsonplaceholder-users-workflow&field=orchestrationConfig`
  with the API Registry call path visible.

## Local release gates

Run before push:

- `node scripts/check-version-sync.mjs`
- `node scripts/check-cli-package.mjs`
- `node scripts/check-resolver-registry.mjs`
- `node --test scripts/unit-resolver-registry.test.mjs`
- `node scripts/check-fork-sync.mjs`
- `bash scripts/agent-dist-verify.sh pre-push`
- `git diff --check`

## CI gates

Remote PR checks on the pushed branch passed:

- `smoke`
- `validate`
- `verify`

## Explicit non-scope

This release does not ship no-code workflow scheduler provisioning, QStash
account authentication, Supabase Edge Function provisioning, or durable
serverless scheduler setup. Those experiments were removed from this PR.

Main's existing serverless reference path remains intact; this release is the
completed resolver registry work only.
