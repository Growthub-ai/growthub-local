# Config vs. Server Files — governed extension matrix

This is the non-negotiable delineation between the **config plane** (portable,
PATCH-governed `growthub.config.json`) and the **server plane** (additive Next.js
routes, resolver/adapter files, and `.env.local` secrets). It is the same
contract for humans in the no-code UI and for agents driving the helper + curl.

The hard contract never changes: `PATCH /api/workspace` is permanently
restricted to `dashboards`, `widgetTypes`, `canvas`, `dataModel`. Sidecar
(`growthub.source-records.json`) and secrets (`.env.local`) are written only by
their own routes.

## Delineation matrix

| User intent | Config change (PATCH) | File / disk change | Route involved |
| --- | --- | --- | --- |
| Register an API | `api-registry` row in `dataModel.objects[]` | optional `lib/adapters/integrations/resolvers/<id>.js` | `register-resolver`, `test-api-record` |
| Save an API key | `integrations[]` entry (`endpointRef`, `hasSecret`) | `.env.local` value (server write) | `settings/apis-webhooks` |
| Create a workflow | `sandbox-environment` row + `orchestrationConfig` | none | `sandbox-run` |
| Run a workflow on a server | `runLocality: serverless`, `schedulerRegistryId` | deployed scheduler route | outbound POST → `sandbox-scheduler` |
| Add an agent host | row `adapter: local-agent-host`, `agentHost` | none (CLI owns its auth) | `sandbox-agent-auth/*` |
| New dashboard widget | `canvas.widgets[]` | none | `PATCH /api/workspace` |
| Delete a record | row removed from `dataModel` | optional sidecar prune | `PATCH /api/workspace` + `cleanup-sidecar` |

**Extension rule:** new capability = new adapter/resolver file + registry row
shape + an existing route dispatch — never a new PATCH field and never an
ad-hoc route per customer.

## Env Key Catalog — `GET /api/workspace/env-key-catalog`

Name-only projection of the env-key surface. Merges three sources and reports a
server-resolved `configured` boolean using the same `envKeyCandidates()`
expansion the execution routes use. **Never returns a value.**

```
{
  "kind": "growthub-env-key-catalog-v1",
  "entries": [
    { "slug": "leadshark", "source": "config",    "configured": true,  "kinds": ["api"], "inUse": true },
    { "slug": "stripe",    "source": "reference", "configured": false, "kinds": [],      "inUse": true },
    { "slug": "NANGO_SECRET_KEY", "source": "env", "configured": true, "kinds": [],      "inUse": false }
  ],
  "summary": { "total": 3, "configured": 2, "missing": 1 },
  "canWriteEnv": true
}
```

- `source: "config"` — declared in `integrations[]` (Settings → APIs & Webhooks).
- `source: "reference"` — used by an api-registry `authRef` or sandbox `envRefs` but undeclared.
- `source: "env"` — discovered directly in the runtime (e.g. a `.env.local` line), filtered against framework/system names.

The sandbox-environment drawer and the API Registry authRef picker both consume
this so local `.env.local` keys are no longer invisible. Set
`GROWTHUB_ENV_CATALOG_DISCOVER=false` to disable raw env discovery.

## Saving secrets to `.env.local`

`PATCH /api/settings/apis-webhooks` accepts an optional `secretValue` per ref.
In filesystem mode the value is written to `.env.local` (upsert, comments
preserved) and the config keeps only `hasSecret: true`. Read-only runtimes
return 409 with guidance — the same gate as `register-resolver`. The response
carries a name-only `envWrite: { written: [...], skipped: [...] }` receipt.

## Governed delete — impact preview + `POST /api/workspace/cleanup-sidecar`

Before a Data Model delete the UI derives the blast radius with the pure
`computeDeleteImpact(config, sourceRecords, target)`:

- api-registry → data-source `registryId` / sandbox `schedulerRegistryId` FKs
- sandbox-environment → `sandbox:<objectId>:<slug>` sidecar keys + nav shortcuts
- data-source → widget bindings + `sourceId` sidecar keys

The config PATCH is authoritative; orphaned sidecar buckets are then pruned with
`POST /api/workspace/cleanup-sidecar { sourceIds: [...] }`, which returns
`{ removed, skipped }` and 409s on read-only runtimes.

## Serverless scheduler — `POST /api/workspace/sandbox-scheduler`

The inbound counterpart to the `growthub-sandbox-run-v1` envelope `sandbox-run`
POSTs when `runLocality: serverless`. Point a serverless api-registry row's
`schedulerRegistryId` at the deployed workspace's own
`/api/workspace/sandbox-scheduler` and the loop closes — no route per workflow.

- Validates the envelope; rejects unknown kinds (400) and never echoes unknown fields.
- Returns the uniform `{ ok, stdout, stderr, exitCode, durationMs, adapterMeta }`
  shape, so local and serverless runs write identical `lastResponse` / sidecar traces.
- Missing env refs in the envelope produce an honest non-zero receipt.
- Optional shared-secret gate via `GROWTHUB_SCHEDULER_SECRET`
  (`x-growthub-scheduler-secret` or `authorization: Bearer <secret>`).
- `GET` returns a small contract descriptor for probes / discovery.

The serverless tier acknowledges runs deterministically; it does not spawn
processes in-core — a real executor wires behind a host adapter, keeping the
kit safe to deploy read-only.

## What not to do

- Do not widen the PATCH allowlist beyond the four fields.
- Do not store secret values in `growthub.config.json` (only `hasSecret`).
- Do not expose `process.env` values to the browser — slugs + booleans only.
- Do not generate Next.js routes from the no-code UI; do not bypass `sandbox-run`/`sandbox-scheduler` for execution.
