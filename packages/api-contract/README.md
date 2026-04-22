# @growthub/api-contract

CMS SDK v1 — **public contract surface** for the Growthub capability system.

This package freezes the existing `growthub-local` CLI truth into one stable, additive, type-only public contract. It is the single shared vocabulary for capabilities, manifests, provider assembly, execution payloads, streaming events, and hosted profile — across the CLI, local runtimes, hosted app surfaces, harnesses, chat/stream consoles, and future third-party adapters.

---

## Status

**Phase 1: public contract package (this package).**

v1 is narrowly scoped by design. See `docs/CMS_SDK_V1.md` in the repo root for the full surgical implementation plan.

- Type-only. No runtime behavior.
- Additive-only. Existing fields do not change.
- Reads directly from the shapes the CLI already ships today.

## Install

```bash
pnpm add @growthub/api-contract
```

The package exposes a narrow root export plus one stable subpath per contract module.

```ts
import type {
  CapabilityNode,
  ExecuteWorkflowInput,
  ExecutionEvent,
  CapabilityManifestEnvelope,
} from "@growthub/api-contract";

import { isExecutionEvent, CAPABILITY_FAMILIES, API_CONTRACT_VERSION } from "@growthub/api-contract";
```

Narrow imports are also supported:

```ts
import type { CapabilityNode } from "@growthub/api-contract/capabilities";
import type { ExecutionEvent } from "@growthub/api-contract/events";
import type { CapabilityManifestEnvelope } from "@growthub/api-contract/manifests";
```

## Modules

| Subpath | Purpose |
| --- | --- |
| `./capabilities` | `CapabilityFamily`, `CapabilityRecord`, `CapabilityNode`, `CapabilityQuery`, `CapabilityRegistryMeta`, `CAPABILITY_FAMILIES`. |
| `./execution` | `ExecuteWorkflowInput`, `ExecuteWorkflowResult`, `ExecuteNodePayload`, `NodeResult`, `ExecutionArtifactRef`. |
| `./providers` | `ProviderAssemblyInput`, `ProviderAssemblyResult`, `ProviderRecord`, `ProviderAssemblyHints`. |
| `./profile` | `Profile`, `ExecutionDefaults`, `Entitlement`, `GatedCapabilityRef`. |
| `./events` | `ExecutionEvent` union, per-event shapes, `isExecutionEvent` guard. |
| `./manifests` | `CapabilityManifestEnvelope`, `CapabilityManifest`, `ManifestProvenance`, `ManifestDriftReport`. |
| `./schemas` | `NodeInputSchema`, `NodeOutputSchema`, `NodeInputField` union, `NodeInputAttachment`. |

## Design rules

1. **One contract, many surfaces.** Any terminal, browser, agent, or third-party adapter can build against this package without reading CLI internals.
2. **Hosted first.** Hosted capability records remain the source of truth. Local extensions and derived records are represented via explicit `ManifestProvenance`.
3. **Execution ≠ provider assembly.** Provider readiness lives in `./providers` and never leaks into execution results.
4. **Streaming is a protocol.** `ExecutionEvent` is the one NDJSON event union for every runtime.
5. **Additive only.** New fields / new event types may be appended. Renames or removals require a new major contract version.

## Relationship to `growthub-local`

This package is the stable public shape of the internals in:

- `cli/src/runtime/cms-capability-registry/` (capabilities, families, query, registry meta)
- `cli/src/runtime/hosted-execution-client/` (execution payloads, results, provider assembly, profile)
- `cli/src/runtime/cms-node-contracts/` (node schemas — formalized here)

CLI imports can migrate onto `@growthub/api-contract` without any semantic change. See `docs/CMS_SDK_V1.md` for the migration plan.

## Versioning

- `API_CONTRACT_VERSION` is a literal `1`.
- Breaking changes require a new major contract version.
- Additive changes ship under the same `API_CONTRACT_VERSION`.
