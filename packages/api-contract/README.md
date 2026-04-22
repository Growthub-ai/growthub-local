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

**Phase 2 + Phase 3 adoption (CLI runtime):**

- Phase 2 — Manifest Registry (discovery spine): `docs/CMS_SDK_V1_MANIFEST_REGISTRY.md`
- Phase 3 — Schema-Driven Node Contracts on the Wire: `docs/CMS_SDK_V1_SCHEMA_CONTRACTS.md`

The contract package itself remains narrow and stable — Phase 2 and Phase 3
consume `CapabilityManifestEnvelope`, `NodeInputSchema`, and
`NodeOutputSchema` without widening the v1 surface.

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

## How to use the SDK

Use this package to type your workflow payloads and safely parse execution streams.

### 1) Type a workflow execute payload

```ts
import type { ExecuteWorkflowInput } from "@growthub/api-contract";

const payload: ExecuteWorkflowInput = {
  pipelineId: "my-pipeline",
  workflowId: "my-workflow",
  executionMode: "hosted",
  nodes: [
    {
      nodeId: "img-1",
      slug: "image-generation",
      bindings: {
        prompt: "Simple abstract gradient sphere on white background",
      },
    },
  ],
};
```

### 2) Parse NDJSON execution events safely

```ts
import { isExecutionEvent } from "@growthub/api-contract";

function onStreamLine(line: string) {
  const value = JSON.parse(line);
  if (!isExecutionEvent(value)) return;

  if (value.type === "node_error") {
    console.error("Node failed:", value.nodeId, value.error);
  }
}
```

### 3) Type capability manifests and node schemas

```ts
import type { CapabilityManifestEnvelope } from "@growthub/api-contract/manifests";
import type { NodeInputSchema } from "@growthub/api-contract/schemas";

function readManifest(env: CapabilityManifestEnvelope) {
  return env.capabilities.map((c) => c.slug);
}

function readInputs(schema: NodeInputSchema) {
  return schema.fields.filter((f) => f.required).map((f) => f.key);
}
```

### 4) Use narrow imports when needed

```ts
import type { ExecutionEvent } from "@growthub/api-contract/events";
import type { ProviderAssemblyResult } from "@growthub/api-contract/providers";
```

### 5) Version guard

```ts
import { API_CONTRACT_VERSION } from "@growthub/api-contract";

if (API_CONTRACT_VERSION !== 1) {
  throw new Error("Unsupported Growthub API contract version");
}
```