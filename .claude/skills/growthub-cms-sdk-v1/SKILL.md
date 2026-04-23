---
name: growthub-cms-sdk-v1
description: Use the public CMS SDK v1 contract (`@growthub/api-contract`) to type workflow payloads, parse NDJSON execution events, read capability manifests, and validate node schemas. Use when the user asks about the api-contract package, CMS SDK, ExecutionEvent streams, CapabilityManifestEnvelope, NodeInputSchema, or types for hosted execution.
triggers:
  - api-contract
  - cms sdk
  - CapabilityManifestEnvelope
  - ExecutionEvent
  - NodeInputSchema
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Types imported from @growthub/api-contract subpath exports, not private CLI paths.
    - isExecutionEvent used to narrow NDJSON streams.
    - Surfaces honour API_CONTRACT_VERSION = 1 sentinel.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers: []
subSkills: []
mcpTools: []
---

# Growthub CMS SDK v1 — Public Contract Usage

Package: `@growthub/api-contract` (v1.0.0-alpha.1 at time of writing; see `packages/api-contract/CHANGELOG.md`).

Scope: **Phase 1 — public contract package**. Type-only, additive-only, no runtime behavior. Freezes the shape the CLI already depends on so any surface (CLI, hosted web, harnesses, chat consoles, third-party adapters) can build against it without reading CLI internals.

Source in-repo: `packages/api-contract/src/` — compiled artifact at `packages/api-contract/dist/`.

Documentation: `docs/CMS_SDK_V1.md` (implementation contract), `docs/CMS_SDK_V1_USER_GUIDE.md` (user guide).

## Exports — subpath map

| Subpath | Purpose | Key symbols |
|---|---|---|
| root | Narrow re-exports + sentinel | `API_CONTRACT_VERSION` (literal `1`), `isExecutionEvent`, `CAPABILITY_FAMILIES` |
| `./capabilities` | Capability shape + registry meta | `CapabilityFamily`, `CapabilityRecord`, `CapabilityNode`, `CapabilityQuery`, `CapabilityRegistryMeta`, `CapabilityExecutionKind`, `CapabilityExecutionBinding`, `CapabilityExecutionTokens`, `CAPABILITY_FAMILIES` |
| `./execution` | Workflow / node payloads + results | `ExecutionMode`, `ExecuteWorkflowInput`, `ExecuteWorkflowResult`, `ExecuteNodePayload`, `NodeResult`, `ExecutionArtifactRef`, `WorkflowExecutionSummary`, `WorkflowExecutionStatus`, `NodeExecutionStatus` |
| `./providers` | Provider assembly (separate from execution) | `ProviderRecord`, `ProviderStatus`, `ProviderAssemblyInput`, `ProviderAssemblyResult`, `ProviderAssemblyHints` |
| `./profile` | Hosted profile + entitlements | `Profile`, `PreferredExecutionMode`, `ExecutionDefaults`, `Entitlement`, `GatedCapabilityRef` |
| `./events` | NDJSON streaming event union | `ExecutionEvent`, per-event shapes, `isExecutionEvent` type guard |
| `./manifests` | Capability manifest envelope + drift | `CapabilityManifestEnvelope`, `CapabilityManifest`, `ManifestProvenance`, `ManifestDriftReport`, `ManifestDriftMarker`, `CapabilityExecutionHints` |
| `./schemas` | Node input/output schemas | `NodeInputSchema`, `NodeOutputSchema`, `NodeInputField` union (10 field kinds), `NodeOutputField`, `NodeInputAttachment` |

Capability families: `video`, `image`, `slides`, `text`, `data`, `ops`, `research`, `vision`.

## Install

```bash
pnpm add @growthub/api-contract
```

Inside this monorepo, the package is already linked via `pnpm-workspace.yaml`; import by name.

## Usage patterns

### 1) Type an `ExecuteWorkflowInput`

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
      bindings: { prompt: "Simple abstract gradient sphere on white" },
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

  switch (value.type) {
    case "node_start":
    case "node_complete":
    case "node_error":
    case "credit_warning":
    case "progress":
    case "complete":
    case "error":
      return value;
  }
}
```

Event types (all carry `at: string`):

- `node_start` — `{ nodeId, slug }`
- `node_complete` — `{ nodeId, slug, output? }`
- `node_error` — `{ nodeId, slug, error }`
- `credit_warning` — `{ availableCredits?, message? }`
- `progress` — `{ stage, message? }`
- `complete` — `{ executionId, summary? }`
- `error` — `{ message }`

### 3) Read a manifest envelope + per-capability schema

```ts
import type { CapabilityManifestEnvelope } from "@growthub/api-contract/manifests";
import type { NodeInputSchema } from "@growthub/api-contract/schemas";

function requiredInputKeys(env: CapabilityManifestEnvelope, slug: string): string[] {
  const cap = env.capabilities.find((c) => c.slug === slug);
  const schema: NodeInputSchema | undefined = cap?.inputSchema;
  return schema?.fields.filter((f) => f.required).map((f) => f.key) ?? [];
}
```

### 4) Version guard

```ts
import { API_CONTRACT_VERSION } from "@growthub/api-contract";

if (API_CONTRACT_VERSION !== 1) {
  throw new Error("Unsupported Growthub API contract version");
}
```

### 5) Provider assembly — keep separate from execution

```ts
import type { ProviderAssemblyResult } from "@growthub/api-contract/providers";
import type { NodeResult } from "@growthub/api-contract/execution";
// Never mix provider readiness into NodeResult. Provider assembly is its own primitive.
```

## Design rules (hard guardrails)

1. **One contract, many surfaces.** Any consumer can build against this package without reading CLI internals.
2. **Hosted first.** Hosted capability records remain the source of truth. Local extensions and derived records are represented via explicit `ManifestProvenance`.
3. **Execution ≠ provider assembly.** Provider readiness lives in `./providers` and never leaks into execution results.
4. **Streaming is a protocol.** `ExecutionEvent` is the one NDJSON event union for every runtime.
5. **Additive only.** New fields / new event types may be appended. Renames or removals require a new major contract version.

## Field taxonomy — `NodeInputField` union

`text`, `long-text`, `number`, `boolean`, `select`, `array`, `json`, `url`, `file`, `url-or-file`.

Every field carries: `key`, `label`, `required`, `fieldType`, optional `description`, `uiHint`, `providerNeutralIntent`, `acceptedMediaTypes`, `defaultValue`, `executionModeHints`.

`NodeOutputField.fieldType` taxonomy: `text`, `long-text`, `number`, `boolean`, `array`, `object`, `image`, `video`, `slides`, `audio`, `file`, `unknown`.

`NodeInputAttachment` — lifted local file payload for `url-or-file` resolution.

## Release validation (per `CMS_SDK_V1_USER_GUIDE.md`)

Validated release requires all of:

- image run `succeeded`
- video run `succeeded`
- text run `succeeded`
- at least one invalid input failed clearly per primitive family
- rerun with corrected input `succeeded`
- sync checks pass after execution (`growthub profile pull` / `push`, `growthub kit fork-sync list`)

Do not call a release validated if only one primitive was tested.

## Typecheck / build

```bash
pnpm --filter @growthub/api-contract exec tsc --noEmit
pnpm --filter @growthub/api-contract build
```

Contract-package work cannot be held up by CLI TS errors — the api-contract package has its own `tsconfig.json` and compiles independently.

## Anti-patterns

- Do not widen hosted routes to fit the SDK.
- Do not invent a second CMS abstraction.
- Do not bundle management / UI concerns into the v1 contract package.
- Do not force local extensions into imperative runtime hooks — represent them with `ManifestProvenance: "local-extension"`.
- Do not mix provider readiness into execution results.

## Out of scope for v1

Chat lane UX, environment-management lane, enterprise dashboards, streaming console UI, broad discovery/menu expansions, full policy/authority management in the SDK, any rewrite of hosted route topology.
