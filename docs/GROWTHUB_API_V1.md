# Growthub API v1

Growthub API v1 is the public, versioned surface that every Growthub
execution path — CLI, hosted app, external agents — now speaks.

## Canonical types

All types are shipped from a single workspace package:

- `@growthub/api-contract`                 — barrel export
- `@growthub/api-contract/capabilities`    — CMS capability node primitives
- `@growthub/api-contract/pipelines`       — pipeline DAG types
- `@growthub/api-contract/execute`         — hosted execution + streaming events
- `@growthub/api-contract/provider`        — provider adapter contract
- `@growthub/api-contract/manifest`        — capability manifest envelope
- `@growthub/api-contract/metrics`         — metrics, policy, fleet types
- `@growthub/api-contract/routes`          — canonical route names

The CLI and server both re-export from this package. There is no other
home for these types.

## Versioning

v1 is **additive-only**. Breaking changes ship as v2 in a new entry
point (`@growthub/api-contract/v2`). The `GROWTHUB_API_VERSION` constant
is bumped accordingly.

## Route surface (v1)

From `@growthub/api-contract/routes`:

| Key                | Path                                       |
| ------------------ | ------------------------------------------ |
| `cliSession`       | `/api/cli/session`                         |
| `cliProfile`       | `/api/cli/profile`                         |
| `cliCapabilities`  | `/api/cli/capabilities`                    |
| `executeWorkflow`  | `/api/execute-workflow`                    |
| `threadBind`       | `/api/projects/threads/bind`               |
| `providerReport`   | `/api/sandbox/provider-report`             |
| `providerProbe`    | `/api/providers/growthub-local/probe`      |

## Execution stream event union

`/api/execute-workflow` streams NDJSON. The event union is
`ExecuteWorkflowStreamEvent`:

- `node_start`    — a pipeline node started running
- `node_complete` — a pipeline node finished with output
- `node_error`    — a pipeline node failed
- `start`         — workflow execution began
- `complete`      — workflow execution finished (with executionLog)
- `error`         — workflow execution failed

The CLI's hosted-execution client and the `StreamingConsole` primitive
both consume this union. UI renderers and custom dashboards should too.

## Capability manifest envelope

`GET /api/cli/capabilities` returns a `CapabilityManifestEnvelope`. The
CLI caches it under `~/.paperclip/manifests/<host>.capabilities.json`
and re-hydrates the registry from it when offline.

See `docs/CMS_NODE_MANIFEST_REGISTRY.md` for the envelope shape and the
local-extension mechanism.

## Acceptance for downstream consumers

1. Import types from `@growthub/api-contract` — do not inline copies.
2. Use `GROWTHUB_API_ROUTES.<key>` rather than hard-coded path strings.
3. Treat the stream event union as exhaustive in switch statements.
4. Check `meta.cached` on registry responses before acting on state.
5. Compare `meta.registryHash` to detect drift between refreshes.
