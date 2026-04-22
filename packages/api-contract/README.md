# @growthub/api-contract

Stable public contract for the Growthub CMS SDK v1.

This package freezes the substrate the CLI already treats as truth and
publishes it as one narrow, types-only surface. It does not ship runtime
behavior; it ships the shapes that CLI, hosted, and third-party surfaces can
build against without reading `cli/src/runtime/*` internals.

## What's inside

| Module | Exports |
| --- | --- |
| `capabilities` | `CapabilityFamily`, `CapabilityExecutionKind`, `CapabilityRecord`, `CapabilityNode`, `CapabilityConnectorNode`, `CapabilityQuery`, `CapabilityRegistryMeta`, `CAPABILITY_FAMILIES` |
| `execution` | `ExecuteWorkflowInput`, `ExecuteWorkflowResult`, `ExecuteNodePayload`, `NodeResult`, `ExecutionArtifactRef`, `ExecutionSummary`, `ExecutionMode`, `ExecutionStatus`, `NodeExecutionStatus` |
| `providers` | `ProviderAssemblyInput`, `ProviderAssemblyResult`, `ProviderRecord`, `ProviderAssemblyHints`, `ProviderStatus`, `ProviderAssemblyStatus` |
| `profile` | `Profile`, `ExecutionDefaults`, `Entitlement`, `GatedCapabilityRef`, `PreferredExecutionMode` |
| `events` | `ExecutionEvent` union (`node_start`, `node_complete`, `node_error`, `credit_warning`, `progress`, `complete`, `error`) |
| `schemas` | `NodeInputSchema`, `NodeOutputSchema`, `NodeInputField` union (`text`, `long_text`, `number`, `boolean`, `select`, `array`, `json`, `url`, `file`, `url_or_file`) |
| `manifests` | `CapabilityManifestEnvelope`, `CapabilityManifest`, `ManifestProvenance`, `ManifestDriftReport`, `ManifestSource`, `ManifestOriginType`, `ExecutionHints` |

## Usage

```ts
import type {
  CapabilityNode,
  ExecuteWorkflowInput,
  ExecutionEvent,
  CapabilityManifestEnvelope,
} from "@growthub/api-contract";
```

Sub-path imports are also supported:

```ts
import type { CapabilityNode } from "@growthub/api-contract/capabilities";
import type { ExecutionEvent } from "@growthub/api-contract/events";
```

## Scope

This is Phase 1 of CMS SDK v1: the **public contract package**. It is
types-only and additive. Runtime behavior in the CLI is not changed by
shipping this package.

Follow-up phases (tracked separately):

1. Swap CLI internal `type` imports to `@growthub/api-contract`.
2. Formalize the manifest registry contract (envelope, drift, provenance).
3. Populate `NodeInputSchema` / `NodeOutputSchema` from existing CMS metadata.
4. Adopt the `ExecutionEvent` union across execution surfaces.

## Non-goals for v1

- No chat lane, environment management, or enterprise dashboard surfaces.
- No imperative plugin hooks for local extensions; extensions remain
  additive and manifest-driven.
- No rewrite of hosted route topology.
