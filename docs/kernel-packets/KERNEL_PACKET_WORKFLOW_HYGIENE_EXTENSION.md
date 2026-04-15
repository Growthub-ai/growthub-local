# Workflow Hygiene Extension Kernel Packet

Version: `v1`

This packet freezes the reusable primitive for adding new labels, enrichment fields, or lifecycle actions to the workflow hygiene layer without breaking the saved workflow list or lifecycle controls.

Use it when you are:

- adding a new `WorkflowLabel` beyond `canonical`, `experimental`, `archived`
- adding new enrichment fields to `WorkflowHygieneRecord` (last executed, execution count, artifact family, credit cost, promotion history, save source)
- adding new lifecycle actions beyond archive/delete
- wiring execution events into hygiene store updates
- adding smarter label inference heuristics
- extending bridge lifecycle operations in `cli/src/auth/hosted-client.ts`

## Why This Packet Exists

Workflow hygiene (PR #61) shipped as a lightweight labeling layer on top of saved workflows. It does not require engine rewrite — it enriches the hosted workflow list with local labels, and bridges lifecycle actions (archive, delete) through the hosted client.

The hygiene store lives at `~/.paperclip/workflow-hygiene/labels.json`. The label inference is deterministic. The enrichment is pure. These properties make the layer safe to extend, but also mean a bad extension causes label drift across workspaces.

This packet captures the stable path for extending hygiene without breaking the saved workflow list, lifecycle actions, or consumer lanes like native intelligence.

## Kernel Invariants

Every workflow hygiene extension must satisfy these invariants before merge:

- existing `WorkflowLabel` values remain valid (`canonical`, `experimental`, `archived`)
- `WorkflowHygieneRecord` extensions are additive — no removal of existing fields
- `inferDefaultLabel(name, createdAt, versionCount)` still returns valid label for existing inputs
- `createWorkflowHygieneStore()` reads/writes `~/.paperclip/workflow-hygiene/labels.json` without corruption
- `enrichWorkflowSummaries(entries, store)` preserves all existing enriched fields
- `renderWorkflowLabel()` handles new labels with consistent color-coded output
- hosted bridge lifecycle operations (`archiveHostedWorkflow`, `deleteHostedWorkflow`) still succeed
- new lifecycle operations follow the same bridge pattern (POST to `/api/cli/profile?action=...`, typed payload/response, 404/501 → `HostedEndpointUnavailableError`)
- saved workflow picker in `cli/src/commands/workflow.ts` handles new labels and actions
- native intelligence consumers (`WorkflowSummaryForIntelligence.label`) accept new label values
- focused vitest coverage passes
- repo gates pass (`smoke`, `validate`, `verify`)

## Surface Area Contract

Use this contract shape for every hygiene extension:

1. **Label primitive**
   - extend `WorkflowLabel` union in `cli/src/runtime/workflow-hygiene/types.ts`
   - update `renderWorkflowLabel()` in `summaries.ts` with new color/style
   - update `inferDefaultLabel()` heuristic in `labels.ts` if the new label has automatic classification rules
2. **Record primitive**
   - extend `WorkflowHygieneRecord` with optional new fields
   - file shape at `~/.paperclip/workflow-hygiene/labels.json` remains backward-compatible JSON
   - `readStoreFile()` handles old records missing new fields gracefully
3. **Store primitive**
   - `WorkflowHygieneStore` interface can gain new methods (`setExecutionCount`, `setPrimaryArtifactFamily`, etc.)
   - existing `getLabel`, `setLabel`, `list` signatures preserved
4. **Enrichment primitive**
   - `enrichWorkflowSummaries<T>()` generic parameter accommodates new consumer fields
   - enriched object shape remains additive
5. **Bridge primitive (new lifecycle operations)**
   - new bridge functions in `cli/src/auth/hosted-client.ts` follow existing pattern:
     - typed payload + response interfaces
     - `toApiClient(session)` wrapper
     - `ignoreNotFound: true` option
     - `HostedEndpointUnavailableError` for 404/501
   - new API paths declared as `DEFAULT_WORKFLOW_<ACTION>_PATH` constants
6. **Post-execution hook (for execution history enrichment)**
   - after `executeHostedPipeline()` succeeds, call `store.setExecutionMetadata(workflowId, { lastExecutedAt, executionCount, primaryArtifactFamily, creditCost })`
   - failures in hygiene store do not block execution flow
7. **UX primitive**
   - saved workflow picker renders new labels and exposes new lifecycle actions
   - back-navigation respects existing pattern

## Packet Inputs

- extension id (for example `label:deprecated`, `field:last-executed-at`, `action:promote`)
- affected types under `cli/src/runtime/workflow-hygiene/types.ts`
- affected logic under `cli/src/runtime/workflow-hygiene/labels.ts` and `summaries.ts`
- bridge updates under `cli/src/auth/hosted-client.ts`
- command UX under `cli/src/commands/workflow.ts`
- focused tests under `cli/src/__tests__/workflow-hygiene.test.ts` and `workflow-discovery.test.ts`

## Packet Procedure

### P1. Type Extension

- extend `WorkflowLabel` union and/or `WorkflowHygieneRecord` in `types.ts`
- new fields optional for backward compatibility with existing `labels.json` files

### P2. Label Logic (if adding new label)

- update `inferDefaultLabel()` heuristic in `labels.ts`
- consider execution count, last executed at, failure rate, version count, age
- document the heuristic in the function comment

### P3. Enrichment Logic (if adding new field)

- extend `enrichWorkflowSummaries()` in `summaries.ts` to compute/surface new field
- preserve generic `T extends { workflowId, name, createdAt, versionCount? }` shape

### P4. Bridge Operation (if adding new lifecycle action)

- add `HostedWorkflow<Action>Payload` and `HostedWorkflow<Action>Response` types in `hosted-client.ts`
- add `DEFAULT_WORKFLOW_<ACTION>_PATH` constant
- implement `<action>HostedWorkflow(session, payload)` function following existing archive/delete pattern
- handle `HostedEndpointUnavailableError` gracefully

### P5. UX Integration

- surface new label with color in `renderWorkflowLabel()`
- add new lifecycle action to saved workflow picker in `cli/src/commands/workflow.ts`
- preserve back-navigation

### P6. Post-Execution Hook (if adding execution-driven enrichment)

- add hook point after `executeHostedPipeline()` in `cli/src/commands/pipeline.ts` or `workflow.ts`
- update hygiene store with execution metadata
- wrap in try/catch so hygiene failures never block execution

### P7. Deterministic Validation

Run:

```bash
cd cli && pnpm vitest src/__tests__/workflow-hygiene.test.ts src/__tests__/workflow-discovery.test.ts
bash scripts/pr-ready.sh
```

### P8. Consumer Lane Verification

- native intelligence `WorkflowSummaryForIntelligence.label` accepts new label
- workflow discovery list renders new label correctly
- saved workflow picker exposes new lifecycle action

### P9. Release + Ship Confirmation

- merge PR after checks are green
- run release workflow
- confirm npm remote versions match merged package versions

## Canonical Commands

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
cd cli && pnpm vitest src/__tests__/workflow-hygiene.test.ts src/__tests__/workflow-discovery.test.ts
bash scripts/pr-ready.sh
```

## Definition Of Done

A workflow hygiene extension is done only when:

- type extensions are additive and backward-compatible
- label inference heuristic updated (if adding new label)
- enrichment logic handles new field correctly
- bridge operations follow archive/delete pattern (if adding new lifecycle action)
- saved workflow picker surfaces new label and actions
- post-execution hook updates store (if applicable)
- focused vitest coverage passes
- consumer lanes verify without changes
- PR checks are green
- merge lands in `main`

## Related Packets

- [CMS Contract Extension Kernel Packet](./KERNEL_PACKET_CMS_CONTRACT_EXTENSION.md)
- [Native Intelligence Provider Kernel Packet](./KERNEL_PACKET_NATIVE_INTELLIGENCE_PROVIDER.md)
- [Discovery UX Kernel Packet](./KERNEL_PACKET_DISCOVERY_UX.md)
