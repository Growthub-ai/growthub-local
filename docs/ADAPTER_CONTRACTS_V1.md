# Adapter Contracts — v1 (convention)

This document **freezes the generic adapter rule** that has been validated
across at least two shipped worker kits. It does not introduce SDK types or
runtime gates.

**Reference implementations:**

- `cli/assets/worker-kits/growthub-creative-video-pipeline-v1/docs/adapter-contracts.md`
  — generative + external-repo handoff
- `cli/assets/worker-kits/growthub-agency-portal-starter-v1/docs/adapter-contracts.md`
  — persistence, auth, payment, reporting, integration

---

## The generic rule

```
adapter = env-or-config selector
        + provider-specific implementation
        + normalized output shape
```

Domain code (skills, helpers, app routes, pipeline stages) consumes the
**normalized output**. It MUST NOT branch on provider internals.

---

## Hard rules

1. **Selection is explicit.** Adapter mode is chosen by an env var or a
   value in `kit.json` / `pipeline.manifest.json`. Never by feature
   detection in domain code.
2. **Output is normalized.** Two adapter modes for the same stage produce
   the same output shape on disk (e.g. `manifest.json` from both
   `growthub-pipeline` and `byo-api-key` paths in creative-video-pipeline).
3. **Provider SDKs live behind the adapter.** A skill, helper, or route
   never imports a provider SDK directly when an adapter exists.
4. **Handoff artifacts are part of the boundary.** When a stage delegates
   to an external repo, the artifact written at the boundary
   (`edit-plan.md`, `manifest.json`, `final.mp4`) IS the adapter contract.
5. **SDK types are preferred where they exist.** When
   `@growthub/api-contract` defines a type for the input or event stream
   (`DynamicRegistryPipeline`, `ExecutionEvent`,
   `CapabilityManifestEnvelope`), the adapter uses that type rather than
   re-declaring its own.
6. **BYOK is first-class.** A `byo-api-key` adapter mode is never a
   second-tier code path; it must produce the same normalized output as
   the hosted-bridge mode.

---

## Adapter families

Different surfaces formalize different kinds of adapters. The generic rule
is the same; the env-var prefix is namespaced per kit.

### Generative adapter

Selects the path used to call image / video / text generation models.

| Mode | Env selector | Required env | Normalized output |
|---|---|---|---|
| `growthub-pipeline` | `<KIT>_GENERATIVE_ADAPTER=growthub-pipeline` | `GROWTHUB_BRIDGE_ACCESS_TOKEN`, `GROWTHUB_BRIDGE_BASE_URL`, valid `growthub auth` session | `manifest.json` with `kitId`, `adapter`, `executionId`, `createdAt`, `artifacts[]` |
| `byo-api-key` | `<KIT>_GENERATIVE_ADAPTER=byo-api-key` | provider key (e.g. `GOOGLE_AI_API_KEY`, `FAL_API_KEY`, `RUNWAY_API_KEY`) + `<KIT>_MODEL_PROVIDER` | same `manifest.json` shape |

Reference: creative-video-pipeline kit's `docs/adapter-contracts.md`.

### Persistence adapter

Selects the database / KV / managed-storage layer.

| Mode | Required env |
|---|---|
| `postgres` | `DATABASE_URL` |
| `qstash-kv` | `QSTASH_KV_REST_URL`, `QSTASH_KV_REST_TOKEN` |
| `provider-managed` | provider-specific |

Reference: agency-portal kit's `docs/adapter-contracts.md`.

### Auth adapter

Selects the identity provider for app surfaces.

| Mode | Required env |
|---|---|
| `oidc` | `AUTH_SECRET`, `AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` |
| `clerk` | Clerk env |
| `authjs` | Auth.js env |
| `provider-managed` | provider-specific |

### Payment adapter

| Mode | Required env |
|---|---|
| `none` | none |
| `stripe` | `PAYMENT_SECRET_KEY`, optional `PAYMENT_WEBHOOK_SECRET` |
| `polar` | `PAYMENT_SECRET_KEY`, optional `PAYMENT_WEBHOOK_SECRET` |

### Integration adapter

Selects how the kit resolves data sources and workspace integrations.

| Mode | Required env | Authority |
|---|---|---|
| `growthub-bridge` | `GROWTHUB_BRIDGE_BASE_URL`, `GROWTHUB_BRIDGE_ACCESS_TOKEN` | Hosted Growthub MCP bridge |
| `byo-api-key` | provider-specific or `<KIT>_BYO_CONNECTIONS_JSON` | Workspace-owned |
| `static` | none | Local catalog for dev / exported workspaces |

### Hosted-bridge adapter

A specialization of the integration adapter for kits that consume the
Growthub bridge:

- input: `DynamicRegistryPipeline` from `@growthub/api-contract`
- events: NDJSON `ExecutionEvent` validated by `isExecutionEvent()`
- normalized output: per-stage manifest (e.g. `generative/manifest.json`)

### External-repo handoff adapter

When a stage delegates to an external repo or fork, the adapter is the
**handoff artifact** itself.

| Field | Example (creative-video-pipeline / video-use) |
|---|---|
| upstream stage output (interface artifact) | `output/<client>/<project>/generative/manifest.json` |
| handoff artifact written by external repo | `output/<client>/<project>/final/final.mp4` |
| env locator | `VIDEO_USE_HOME` |
| declared in | `workspace.dependencies.json` |

The kit MUST NOT inline external-repo logic. The artifact pair is the
entire contract.

---

## Where this lives in source

- **Kit-local adapter docs** are the source of truth for each kit's
  concrete env names and provider list (e.g. agency-portal's
  `AGENCY_PORTAL_DATA_ADAPTER`).
- **This document** is the generic rule that every kit's adapter doc
  conforms to.
- **SDK types** in `@growthub/api-contract` are preferred for any shape
  that already exists there (e.g. `DynamicRegistryPipeline`,
  `ExecutionEvent`).

---

## What this convention does NOT do

- It does **not** require every kit to expose every adapter family.
- It does **not** introduce SDK types for adapter selection.
- It does **not** rename existing kit-local env vars.
- It does **not** privilege hosted Growthub over BYOK in any code path.

---

## Cross-references

- [`PIPELINE_KIT_CONTRACT_V1.md`](./PIPELINE_KIT_CONTRACT_V1.md) — pipeline
  kit convention (uses adapters at stage boundaries)
- [`PIPELINE_TRACE_CONVENTION_V1.md`](./PIPELINE_TRACE_CONVENTION_V1.md) —
  stage trace events including `adapter-selected`
- [`packages/api-contract/src/execution.ts`](../packages/api-contract/src/execution.ts)
  — `DynamicRegistryPipeline`, `ExecutionEvent`
