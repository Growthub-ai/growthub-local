# @growthub/api-contract

## 1.0.0-alpha.1

Initial CMS SDK v1 contract package (Phase 1).

Type-only public surface that freezes the existing `growthub-local` CLI truth into one stable public contract. No runtime behavior.

### Added

- `capabilities`: `CapabilityFamily`, `CapabilityExecutionKind`, `CapabilityNode`, `CapabilityRecord`, `CapabilityQuery`, `CapabilityRegistryMeta`, `CAPABILITY_FAMILIES`, execution binding + tokens.
- `execution`: `ExecuteWorkflowInput`, `ExecuteWorkflowResult`, `ExecuteNodePayload`, `NodeResult`, `ExecutionArtifactRef`, status unions, summary.
- `providers`: `ProviderAssemblyInput`, `ProviderAssemblyResult`, `ProviderRecord`, `ProviderAssemblyHints`.
- `profile`: `Profile`, `ExecutionDefaults`, `Entitlement`, `GatedCapabilityRef`.
- `events`: `ExecutionEvent` union, per-event shapes (`node_start`, `node_complete`, `node_error`, `credit_warning`, `progress`, `complete`, `error`), `isExecutionEvent` guard.
- `manifests`: `CapabilityManifestEnvelope`, `CapabilityManifest`, `ManifestProvenance`, `ManifestDriftReport`, `CapabilityExecutionHints`.
- `schemas`: `NodeInputSchema`, `NodeOutputSchema`, `NodeInputField` union (text, long-text, number, boolean, select, array, json, url, file, url-or-file), `NodeInputAttachment`.
- `API_CONTRACT_VERSION` literal `1` sentinel.
