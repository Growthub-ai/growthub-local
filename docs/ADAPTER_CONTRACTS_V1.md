# Adapter Contracts — v1 (specialization)

This document explains the **generic adapter rule**. It is an *optional
specialization* of the Worker Kit contract
([`WORKER_KIT_CONTRACT_V1.md`](./WORKER_KIT_CONTRACT_V1.md)) — any kit
in any family may declare adapter contracts when it has provider
variability.

The SDK source of truth is
[`@growthub/api-contract/adapters`](../packages/api-contract/src/adapters.ts):

```ts
import type {
  AdapterContractRef,
  AdapterKind,
  AdapterMode,
  AdapterInputRef,
  AdapterOutputRef,
  NormalizedConnectionRef,
} from "@growthub/api-contract/adapters";
import { ADAPTER_CONTRACT_VERSION } from "@growthub/api-contract/adapters";
```

---

## The generic rule

```
adapter = env-or-config selector
        + provider-specific implementation
        + normalized output shape
```

Domain code (skills, helpers, app routes, pipeline stages) consumes
the **normalized output**. It MUST NOT branch on provider internals.

---

## Hard rules

1. **Selection is explicit.** Adapter mode is chosen by an env var or
   a value in `kit.json` / `pipeline.manifest.json`. Never by feature
   detection in domain code.
2. **Output is normalized.** Two adapter modes for the same boundary
   produce the same output shape on disk or in memory.
3. **Provider SDKs live behind the adapter.** A skill, helper, or
   route never imports a provider SDK directly when an adapter
   exists.
4. **Handoff artifacts are part of the boundary.** When a stage or
   skill delegates to an external repo, the artifact written at the
   boundary IS the adapter contract.
5. **SDK types are preferred where they exist.** When
   `@growthub/api-contract` defines a type for the input or event
   stream (`DynamicRegistryPipeline`, `ExecutionEvent`,
   `CapabilityManifestEnvelope`), the adapter uses that type rather
   than re-declaring its own.
6. **BYOK is first-class.** A `byo-api-key` adapter mode is never a
   second-tier code path; it must produce the same normalized output
   as a hosted-bridge mode.

---

## Adapter families

These families are the standard buckets. Each kit MAY declare any
combination; none is required.

### Persistence

Selects the database / KV / managed-storage layer.

| Mode | Required env | Runtime target |
|---|---|---|
| `postgres` | `DATABASE_URL` | Any Postgres-compatible database |
| `qstash-kv` | `QSTASH_KV_REST_URL`, `QSTASH_KV_REST_TOKEN` | Qstash / Vercel KV |
| `provider-managed` | provider-specific | Hosted DB managed outside the kit |

### Auth

Selects the identity provider for app surfaces.

| Mode | Required env |
|---|---|
| `oidc` | `AUTH_SECRET`, `AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` |
| `clerk` | Clerk env |
| `authjs` | Auth.js env |
| `provider-managed` | provider-specific |

### Payment

| Mode | Required env |
|---|---|
| `none` | none |
| `stripe` | `PAYMENT_SECRET_KEY`, optional `PAYMENT_WEBHOOK_SECRET` |
| `polar` | `PAYMENT_SECRET_KEY`, optional `PAYMENT_WEBHOOK_SECRET` |

### Integration

Selects how the kit resolves data sources and workspace integrations.

| Mode | Required env | Authority |
|---|---|---|
| `growthub-bridge` | `GROWTHUB_BRIDGE_BASE_URL`, `GROWTHUB_BRIDGE_ACCESS_TOKEN` | Hosted Growthub MCP bridge |
| `byo-api-key` | provider-specific or `<KIT>_BYO_CONNECTIONS_JSON` | Workspace-owned |
| `static` | none | Local catalog for dev / exported workspaces |

### Reporting

Optional reporting / data-source layer (e.g. Windsor AI, Google Sheets).

### Hosted-bridge

A specialization of the integration adapter for kits that consume the
Growthub bridge:

- input: `DynamicRegistryPipeline` from `@growthub/api-contract`
- events: NDJSON `ExecutionEvent` validated by `isExecutionEvent()`
- normalized output: a kit-specific manifest (typed by the kit itself)

### Generative

Selects the path used to call image / video / text generation models.

| Mode | Env selector pattern | Required env | Normalized output |
|---|---|---|---|
| `growthub-pipeline` | `<KIT>_GENERATIVE_ADAPTER=growthub-pipeline` | hosted bridge env + valid `growthub auth` session | kit-specific `manifest.json` (kitId, adapter, executionId, createdAt, artifacts[]) |
| `byo-api-key` | `<KIT>_GENERATIVE_ADAPTER=byo-api-key` | provider key + `<KIT>_MODEL_PROVIDER` | same `manifest.json` shape |

### External-repo handoff

When a stage or skill delegates to an external repo or fork, the
adapter is the **handoff artifact** itself.

| Field | Meaning |
|---|---|
| upstream artifact (interface) | The on-disk file the external repo reads. |
| handoff artifact | The on-disk file the external repo writes back. |
| env locator | The env var that points at the external repo. |
| declared in | `workspace.dependencies.json` (typed by `WorkspaceDependencyRef`). |

The kit MUST NOT inline external-repo logic. The artifact pair is
the entire contract.

---

## Reference adoption

| Kit | Family | Adapter families adopted |
|---|---|---|
| `growthub-agency-portal-starter-v1` | studio | persistence, auth, payment, reporting, integration |
| `growthub-creative-video-pipeline-v1` | studio | generative, external-repo handoff |

The repetition across two unrelated kit families is what justified
promoting `AdapterContractRef` into the SDK. Other kits in the catalog
are eligible to adopt this specialization when they grow provider
variability.

---

## Where this lives in source

- **Kit-local adapter docs** are the source of truth for each kit's
  concrete env names and provider list (e.g. agency-portal's
  `AGENCY_PORTAL_DATA_ADAPTER`).
- **This document** is the generic rule that every kit's adapter doc
  conforms to.
- **SDK types** in `@growthub/api-contract/adapters` give a typed
  shape for `AdapterContractRef`, `AdapterMode`, `AdapterInputRef`,
  `AdapterOutputRef`, `NormalizedConnectionRef`.

---

## What this specialization does NOT do

- It does **not** require every kit to expose every adapter family.
- It does **not** rename existing kit-local env vars.
- It does **not** privilege hosted Growthub over BYOK in any code
  path.
- It does **not** mandate runtime enforcement: today the SDK types
  describe the boundary; the kit owns the implementation behind it.

---

## Cross-references

- [`WORKER_KIT_CONTRACT_V1.md`](./WORKER_KIT_CONTRACT_V1.md) — foundation contract
- [`PIPELINE_KIT_CONTRACT_V1.md`](./PIPELINE_KIT_CONTRACT_V1.md) — pipeline kit specialization (uses adapters at stage boundaries)
- [`PIPELINE_TRACE_CONVENTION_V1.md`](./PIPELINE_TRACE_CONVENTION_V1.md) — trace events including `adapter-selected`
- [`packages/api-contract/src/adapters.ts`](../packages/api-contract/src/adapters.ts) — SDK types
- [`packages/api-contract/src/execution.ts`](../packages/api-contract/src/execution.ts) — `DynamicRegistryPipeline`
- [`packages/api-contract/src/events.ts`](../packages/api-contract/src/events.ts) — `ExecutionEvent`
