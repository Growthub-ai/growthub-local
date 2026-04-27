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
| `cli/src/kits/contract.ts`, `cli/src/kits/service.ts` | `@growthub/api-contract/worker-kits` |
| `.claude/skills/`, kit `SKILL.md` parsers | `@growthub/api-contract/skills` |
| `cli/src/runtime/pipeline-kits/` | `@growthub/api-contract/pipeline-kits` |
| `cli/src/runtime/workspace-dependencies/` | `@growthub/api-contract/workspaces` |
| kit-local `docs/adapter-contracts.md` | `@growthub/api-contract/adapters` |
| `cli/src/runtime/kit-health/` | `@growthub/api-contract/health` |
| stage-boundary `trace.jsonl` writers | `@growthub/api-contract/pipeline-trace` |

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
    skills.ts
    worker-kits.ts        # universal kit.json contract (v1 + v2 union)
    pipeline-kits.ts      # multi-stage specialization
    workspaces.ts         # external-dependency specialization
    adapters.ts           # provider-boundary specialization
    pipeline-trace.ts     # additive stage-boundary trace events
    health.ts             # universal kit health + maturity
    index.ts
  package.json
  tsconfig.json
  README.md
  CHANGELOG.md
```

Package name: `@growthub/api-contract`. Versions:

- `1.0.0-alpha.1` — Phase 1 baseline (capabilities, execution, providers, profile, events, manifests, schemas).
- `1.2.0-alpha.1` — adds `skills` (SkillManifest + sub-skills + helpers + self-eval + session-memory).
- `1.3.0-alpha.1` — adds `worker-kits` (universal v1+v2 base), `pipeline-kits`, `workspaces`, `adapters`, `pipeline-trace`, `health`.

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

Experimental CMS rows are not a separate model class. They use the existing
`CapabilityNode.experimental` boolean. Default discovery should hide them;
callers that intentionally need Atlas/admin-hidden rows set
`CapabilityQuery.includeExperimental = true` or use:

```bash
growthub capability list --family video --include-experimental --json
growthub capability inspect atlas-video-generation --include-experimental --json
```

Machine consumers must read `experimental: true` from the JSON output and
decide whether to expose, warn, or hide the row. Do not add a parallel
`stability` field.

### Execution (`./execution`)

- `ExecutionMode`
- `ExecuteNodePayload`
- `ExecuteWorkflowInput`, `ExecuteWorkflowResult`
- `WorkflowExecutionStatus`, `NodeExecutionStatus`
- `NodeResult`, `ExecutionArtifactRef`
- `WorkflowExecutionSummary`

Execution results are the canonical artifact handoff. Media-producing nodes may
return direct fields such as:

```json
{
  "videoUrl": "https://...",
  "storagePath": "workflow_videos/{userId}/{threadId}/{videoId}.mp4",
  "bucket": "node_documents"
}
```

The secure SDK pattern is:

1. capture the execution JSON at run time;
2. read `nodeResults[*].output.storagePath` and `artifacts[*].storagePath`;
3. download through the Growthub session and `/api/secure-image`;
4. never download private workflow media by scraping Supabase keys from hosted
   JavaScript bundles.

Authenticated download URL:

```text
{hostedBaseUrl}/api/secure-image?bucket=node_documents&path={encodeURIComponent(storagePath)}
```

Required headers:

```http
Authorization: Bearer <growthub session access token>
```

The CLI exposes the same bridge primitive for agents and humans:

```bash
growthub bridge assets list --limit 20 --json
growthub bridge assets download --storage-path <storage_path> --out ./asset.bin --json
growthub bridge brand kits --include-assets --json
growthub bridge brand assets --brand-kit-id <brandKitId> --json
growthub bridge brand download --storage-path <storage_path> --out ./brand-asset.bin --json
growthub bridge knowledge list --json
growthub bridge knowledge write --title notes --content "# Notes" --json
growthub bridge knowledge download <knowledgeItemId> --out ./item.md --json
growthub bridge mcp accounts --json
```

SDK consumers should import the stable bridge contracts from
`@growthub/api-contract/bridge`: `BridgeAssetItem`,
`BridgeBrandKit`, `BridgeBrandAsset`, `BridgeKnowledgeItem`,
`BridgeKnowledgeSaveInput`, and `BridgeMcpAccount`. The local CLI
implementation uses the same bearer session as `growthub auth whoami`; it does
not use raw Supabase anon-key extraction.

Brand kits and brand assets are read/download bridge primitives. They expose
the user's existing remote `brand_kits` and `brand_assets` records, including
Shopify-CDN-backed CMS media URLs and secure `storage_path` values, so agents
can bind hosted brand context into local CMS executions. They do not introduce a
new arbitrary Asset Gallery upload path.

For brand-kit resources specifically, the CLI bridge resolves against the
existing hosted GH app routes:

```text
GET /api/brand-settings
GET /api/brand-settings/assets
```

Those routes are authenticated by the hosted Supabase session cookie shape that
the CLI derives from the active Growthub session, not by the undeployed
`/api/cli/profile?view=brand-kits` bridge view.

Representative JSON output:

```json
{
  "success": true,
  "userId": "20d81c2e-c440-4f93-afe2-1c45f39abd81",
  "brandKits": [
    {
      "id": "174299f8-5045-415a-99b2-a9e4b33aa4d1",
      "user_id": "20d81c2e-c440-4f93-afe2-1c45f39abd81",
      "brand_name": "Dr. Robert Whitfield",
      "visibility": "private",
      "colors": { "primary": "#000000" },
      "fonts": { "primary": "Inter" },
      "messaging": "...",
      "share_config": { "collaborators": [] }
    }
  ],
  "count": 21
}
```

```json
{
  "success": true,
  "userId": "20d81c2e-c440-4f93-afe2-1c45f39abd81",
  "brandKitId": "174299f8-5045-415a-99b2-a9e4b33aa4d1",
  "assets": [
    {
      "id": "6bbb47de-7aa4-4cfc-aaff-e3409800837d",
      "brand_kit_id": "174299f8-5045-415a-99b2-a9e4b33aa4d1",
      "asset_type": "product_photo",
      "asset_url": "https://...shopifycdn-or-storage-url...",
      "storage_path": "public/.../brand_assets/.../winner1.jpeg",
      "metadata": {
        "file_name": "winner1.jpeg",
        "file_size": 546061,
        "file_type": "image/jpeg"
      }
    }
  ],
  "count": 2
}
```

The gh-app route must enforce ownership for workflow media paths by comparing
the authenticated session user id with the `{userId}` segment in
`workflow_videos/{userId}/{threadId}/...` before service-role storage download.

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

### Worker Kits (`./worker-kits`)

The universal kit.json contract — v1 and v2 schemas as a discriminated
union. **Both are variations of the same Worker Kit primitive.**

- v1 = Worker Kit core primitive (baseline, localized, open-source agent environment, no UI surface).
- v2 = same primitive extended to package full applications (`kit.type: "ui"`) inside the governed workspace.

Exports: `WorkerKitManifest` (`= WorkerKitManifestV1 | WorkerKitManifestV2`), `WorkerKitBundleManifest`, `WorkerKitCapabilityType` (`worker / workflow / output / ui`), `WorkerKitExecutionMode` (`export / install / mount / run`), `WorkerKitFamily`, `WorkerKitCompatibility`, `WorkerKitInstallMetadata`, `WorkerKitUIMetadata`, `WorkerKitProvenance`, type guards `isWorkerKitManifestV1 / V2`, `isAppKit`, sentinels `WORKER_KIT_LATEST_SCHEMA_VERSION = 2`, `WORKER_KIT_FAMILIES`. See [`WORKER_KIT_CONTRACT_V1.md`](./WORKER_KIT_CONTRACT_V1.md).

### Pipeline Kits (`./pipeline-kits`)

OPTIONAL specialization for multi-stage worker kits. Declared in
`pipeline.manifest.json` alongside `kit.json`.

Exports: `PipelineKitManifest`, `PipelineStageRef`, `PipelineArtifactRef`, `PipelineAdapterModeRef`, `PipelineTraceExpectation`, `PipelineOutputTopology`, `PipelineTracePolicy`, `PipelineSessionMemoryPolicy`, `PipelineConventionEnvelope`, sentinel `PIPELINE_KIT_MANIFEST_VERSION = 1`. See [`PIPELINE_KIT_CONTRACT_V1.md`](./PIPELINE_KIT_CONTRACT_V1.md).

### Workspaces (`./workspaces`)

OPTIONAL specialization for kits that delegate to external repos / forks /
system binaries. Orthogonal to pipeline-kits — applies across any family.

Exports: `WorkspaceDependencyManifest`, `WorkspaceDependencyRef`, `WorkspaceDependencyKind` (open union: `git-fork / git-repo / npm-package / system-binary / external-service / …`), `WorkspaceSurfaceRef`, `WorkspaceOutputTopology`, sentinel `WORKSPACE_DEPENDENCY_MANIFEST_VERSION = 1`.

### Adapters (`./adapters`)

OPTIONAL specialization — generic provider-boundary contract. Orthogonal,
applies across any kit family. Standard families: `generative`, `persistence`, `auth`, `payment`, `integration`, `reporting`, `hosted-bridge`, `byo-api-key`, `external-repo-handoff`.

Exports: `AdapterContractRef`, `AdapterKind`, `AdapterMode`, `AdapterInputRef`, `AdapterOutputRef`, `NormalizedConnectionRef`, sentinel `ADAPTER_CONTRACT_VERSION = 1`. See [`ADAPTER_CONTRACTS_V1.md`](./ADAPTER_CONTRACTS_V1.md).

### Pipeline Trace (`./pipeline-trace`)

OPTIONAL additive trace events for multi-stage kits. Distinct from
`./events` (`ExecutionEvent` NDJSON for hosted CLI/SDK streams).

Exports: `PipelineTraceEvent` discriminated union (`pipeline_stage_started / completed / failed`, `pipeline_artifact_written`, `pipeline_handoff_created`), `isPipelineTraceEvent` guard, sentinel `PIPELINE_TRACE_VERSION = 1`. See [`PIPELINE_TRACE_CONVENTION_V1.md`](./PIPELINE_TRACE_CONVENTION_V1.md).

### Kit Health (`./health`)

UNIVERSAL — applies to every kit (not just pipeline kits). Standardizes
the readiness-report shape across CLI, agents, and hosted surfaces.

Exports: `KitHealthReport`, `KitHealthCheck`, `KitHealthSeverity` (`pass / info / warn / fail`), `KitMaturityScore`, `KitMaturityDimension`, sentinel `KIT_HEALTH_REPORT_VERSION = 1`. Consumed by `cli/src/runtime/kit-health/` and surfaced via `growthub kit health <kit-id-or-path> [--json]`.

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
- keep media download behind Growthub auth, not raw Supabase bundle keys

Never:

- invent a second CMS abstraction
- bundle management / UI work into the v1 contract package
- force local extensions into imperative runtime hooks
- mix enterprise management concerns into this package
- widen hosted routes to fit the SDK
- document raw Supabase anon-key extraction as an SDK download pattern

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
