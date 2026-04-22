# CMS SDK v1 — Surgical Implementation Module

**Status:** Phase 1 shipped — public contract package (`@growthub/api-contract`).

This is the product and implementation contract for CMS SDK v1 inside `growthub-local`.

---

## Intent

Formalize what `growthub-local` already treats as truth and expose it as one stable public SDK surface.

CMS SDK v1 = Capabilities, manifests, provider assembly, and execution events — one contract, many surfaces.

The SDK does **not** invent a second system. It freezes and publishes the contract the CLI already depends on:

- hosted capabilities
- node contracts
- provider assembly
- execution payloads
- execution event streams
- hosted profile / entitlements
- manifest registry behavior

It should become the stable public contract for:

- the CLI
- local runtimes
- hosted app surfaces
- harnesses
- chat / stream consoles
- future third-party adapters

…without forcing anyone to reverse-engineer CLI internals.

---

## Source of truth already in `main`

The following internal modules are the source material for the public contract surface:

| Internal module | Public surface |
| --- | --- |
| `cli/src/runtime/cms-capability-registry/` | `@growthub/api-contract/capabilities`, `@growthub/api-contract/manifests` |
| `cli/src/runtime/hosted-execution-client/` | `@growthub/api-contract/execution`, `@growthub/api-contract/providers`, `@growthub/api-contract/profile`, `@growthub/api-contract/events` |
| `cli/src/runtime/cms-node-contracts/` | `@growthub/api-contract/schemas` |

The public package freezes the shape. It does **not** own the runtime.

---

## Package shape

```
packages/api-contract/
  src/
    capabilities.ts
    execution.ts
    providers.ts
    profile.ts
    events.ts
    manifests.ts
    schemas.ts
    index.ts
  package.json
  tsconfig.json
  README.md
  CHANGELOG.md
```

Package name: `@growthub/api-contract`.
Version: starts at `1.0.0-alpha.1`; stabilizes to `1.0.0` once the CLI has migrated imports onto the contract package (Phase 1 completion).

---

## v1 exports

### Capabilities (`./capabilities`)

- `CapabilityFamily`, `CAPABILITY_FAMILIES`
- `CapabilityExecutionKind`, `CapabilityExecutionStrategy`
- `CapabilityExecutionBinding`, `CapabilityExecutionTokens`
- `CapabilityRecord` (wire-level subset)
- `CapabilityNode` (render-level superset)
- `CapabilityQuery`
- `CapabilityRegistrySource`, `CapabilityRegistryMeta`

### Execution (`./execution`)

- `ExecutionMode`
- `ExecuteNodePayload`
- `ExecuteWorkflowInput`, `ExecuteWorkflowResult`
- `WorkflowExecutionStatus`, `NodeExecutionStatus`
- `NodeResult`, `ExecutionArtifactRef`
- `WorkflowExecutionSummary`

### Provider assembly (`./providers`)

- `ProviderRecord`, `ProviderStatus`
- `ProviderAssemblyInput`, `ProviderAssemblyResult`, `ProviderAssemblyStatus`
- `ProviderAssemblyHints` (non-authoritative)

Provider assembly is a **first-class public primitive** and is deliberately separated from execution.

### Profile / entitlements (`./profile`)

- `Profile`, `PreferredExecutionMode`, `ExecutionDefaults`
- `Entitlement`, `GatedCapabilityRef`

### Event stream (`./events`)

Canonical NDJSON streaming contract for every Growthub execution surface.

```ts
type ExecutionEvent =
  | { type: "node_start"; nodeId: string; slug: string; at: string }
  | { type: "node_complete"; nodeId: string; slug: string; output?: unknown; at: string }
  | { type: "node_error"; nodeId: string; slug: string; error: string; at: string }
  | { type: "credit_warning"; availableCredits?: number; message?: string; at: string }
  | { type: "progress"; stage: string; message?: string; at: string }
  | { type: "complete"; executionId: string; summary?: unknown; at: string }
  | { type: "error"; message: string; at: string };
```

- `isExecutionEvent(value)` — type guard for safe NDJSON parsing.

### Manifests (`./manifests`)

- `CapabilityManifestEnvelope` — portable, inspectable envelope with version `1`, host, `fetchedAt`, source, capabilities, optional provenance, optional drift report.
- `CapabilityManifest` — per-capability entry with node shape, input/output schemas, provider hints, execution hints, provenance.
- `ManifestProvenance` — `hosted | local-extension | derived-from-workflow`, with `sourceHost`, `sourceWorkflowId`, `sourceManifestId`, `localExtensionPath`.
- `ManifestDriftReport`, `ManifestDriftMarker` — drift between cached and fresh envelopes.
- `CapabilityExecutionHints` — non-authoritative execution hints.

### Schemas (`./schemas`)

Schema-driven public node contract. One renderer, one validator across every surface.

- `NodeInputSchema`, `NodeOutputSchema`
- `NodeInputField` union: `TextField`, `LongTextField`, `NumberField`, `BooleanField`, `SelectField`, `ArrayField`, `JsonField`, `UrlField`, `FileField`, `UrlOrFileField`
- Every field carries: `key`, `label`, `required`, `fieldType`, optional `description`, `uiHint`, `providerNeutralIntent`, `acceptedMediaTypes`, `defaultValue`, `executionModeHints`.
- `NodeOutputField` with `fieldType` taxonomy (`text`, `long-text`, `number`, `boolean`, `array`, `object`, `image`, `video`, `slides`, `audio`, `file`, `unknown`).
- `NodeInputAttachment` — lifted local file payload for `UrlOrFileField` resolution.

### Version sentinel

`API_CONTRACT_VERSION = 1` — consumers may read this to confirm they are bound against the v1 contract surface.

---

## Hard guardrails

Always:

- preserve additive-only posture
- treat current CLI truth as source material
- keep this package narrow and stable
- separate provider assembly from execution
- keep manifests portable and provenance-aware

Never:

- invent a second CMS abstraction
- bundle management / UI work into the v1 contract package
- force local extensions into imperative runtime hooks
- mix enterprise management concerns into this package
- widen hosted routes to fit the SDK

---

## Phased plan

### Phase 1 — public contract package ✅ (this ship)

- Publish `@growthub/api-contract` from existing CLI truth.
- Narrow public surface.
- No runtime behavior change.
- Success condition: CLI can swap imports onto the contract package without semantic change.

### Phase 2 — manifest registry contract

- Formalize the manifest envelope and the local extension model inside the CLI runtime.
- Expose provenance, cache semantics, drift detection.
- Success condition: capability discovery becomes manifest-first and inspectable.

### Phase 3 — schema-driven node contracts

- Turn today's hidden `input_template` / `output_mapping` metadata into formal `NodeInputSchema` / `NodeOutputSchema` payloads on the wire.
- Share one renderer between CLI and hosted surfaces.

### Phase 4 — stream contract adoption

- Freeze the event union across every surface (terminal, browser, agent).
- Document NDJSON behavior.
- Ship parsing helpers (CLI + future client SDKs).

Each phase ships independently. The contract package is Phase 1 only — it is deliberately narrow, so later phases can land without blurring the contract layer with UX or management surface.

---

## Explicitly out of scope for v1

- chat lane UX
- environment management lane
- enterprise dashboard surfaces
- streaming console UI
- broad discovery / menu expansions
- full policy / authority management layers inside the SDK
- any rewrite of hosted route topology

These may be valuable, but they are not the protected core slice.

---

## Relation to closed PR #114

Kept from #114:

- `@growthub/api-contract` package direction
- manifest-first capability registry direction
- local manifest extension loading direction
- schema-driven node configuration direction
- additive-only posture

De-scoped from v1:

- discovery menu expansions
- chat lane
- environment management lane
- enterprise display / projection verbs
- broader streaming console UX surfaces

---

## Validation checklist

Type-level:

- package exports are stable
- `tsc --noEmit` passes inside `packages/api-contract`
- no runtime circular imports

Contract-level:

- hosted capability records map cleanly into public capability + manifest shapes
- fallback derived records can still be represented (via `ManifestProvenance`) without special casing
- provider assembly and execution remain separate types

Ecosystem-level:

- a third-party builder can read `CapabilityManifestEnvelope` + `NodeInputSchema` without reading CLI internals
- a harness / web UI can render a node contract from SDK types alone

---

## One-line frozen summary

CMS SDK v1 freezes the existing CLI truth into one public contract package and one manifest-first registry model — capabilities, node schemas, provider assembly, execution payloads, and streaming events — additive, portable, and reusable across every Growthub surface.
