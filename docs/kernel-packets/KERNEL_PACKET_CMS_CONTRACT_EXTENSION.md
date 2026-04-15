# CMS Contract Extension Kernel Packet

Version: `v1`

This packet freezes the reusable primitive for extending the CMS node contract pipeline end to end without breaking the introspect/normalize/compile path.

Use it when you are:

- adding a new capability family (e.g. beyond the 8 shipped: video, image, slides, text, data, ops, research, vision)
- adding a new execution strategy beyond `direct`, `sequential-with-persistence`, `async_operation`
- adding a new contract facet (provider badges, runtime policy flags, cost/latency hints)
- extending `NodeContractSummary` with new input/output field metadata
- adding a new `CmsNodeType` beyond `tool_execution` and `cms_workflow`

## Why This Packet Exists

The merged CMS node contract pipeline (PR #61) established a four-stage path: `introspect -> normalize -> compile -> present`. Every CMS node shipped by the hosted CMS flows through this path. The contract pipeline is the single choke point that keeps the CLI generic and the hosted runtime canonical.

Adding new node families, strategies, or facets is high-leverage work because every extension propagates to discovery, validation, pre-execution summaries, pipeline compilation, and workflow hygiene. But the same propagation means a bad extension silently breaks every lane that consumes contracts.

This packet captures the stable path for extending contracts without breaking consumers.

## Kernel Invariants

Every CMS contract extension must satisfy these invariants before merge:

- extended types remain backward-compatible with `CmsCapabilityNode`, `NodeContractSummary`, and `CmsExecutionBinding`
- `introspectNodeContract()` produces a valid summary for the new shape
- `normalizeNodeBindings()` sanitizes placeholders and coerces types correctly for new fields
- `validateNodeBindings()` catches missing required inputs and bindings for the new shape
- `compileToHostedWorkflowConfig()` produces valid hosted graph format with new fields preserved
- `buildPreExecutionSummary()` handles new fields without throwing
- hosted capability endpoint (or `deriveCapabilitiesFromHostedWorkflows()` fallback) still returns usable records
- native intelligence `NodeContractSummary` consumers still resolve (planner, normalizer, summarizer)
- workflow hygiene enrichment still succeeds against the extended shape
- focused vitest coverage passes
- repo gates pass (`smoke`, `validate`, `verify`)

## Surface Area Contract

Use this contract shape for every CMS contract extension:

1. **Type primitive**
   - extensions land in `cli/src/runtime/cms-capability-registry/types.ts` or `cli/src/runtime/cms-node-contracts/types.ts`
   - new union members use discriminated patterns so existing consumers narrow safely
   - optional fields preferred over required fields for backward compatibility
2. **Introspection primitive**
   - `introspectNodeContract()` in `cli/src/runtime/cms-node-contracts/introspect.ts` handles the new shape
   - `humanizeFieldKey()` still produces readable labels for new keys
3. **Normalization primitive**
   - `normalizeNodeBindings()` + `validateNodeBindings()` in `cli/src/runtime/cms-node-contracts/normalize.ts` handle the new shape
   - `sanitizeValue()` handles new placeholder shapes
   - `coerceValue()` handles new template value shapes
4. **Compile primitive**
   - `compileToHostedWorkflowConfig()` in `cli/src/runtime/cms-node-contracts/compile.ts` produces valid hosted format
   - start/end node injection still works
   - edge generation respects upstream references
5. **Presenter primitive**
   - `renderContractCard()`, `buildPreExecutionSummary()`, `renderPreExecutionSummary()`, `renderPreSaveReview()` in `cli/src/runtime/cms-node-contracts/presenter.ts` render new shapes
   - warnings surface correctly for missing required bindings on new facets
6. **Registry primitive**
   - `toCapabilityNode()` in `cli/src/runtime/cms-capability-registry/index.ts` maps hosted records to extended shape
   - `inferFamilyFromSlug()` handles new slugs
   - query filters in `matchesQuery()` still resolve

## Packet Inputs

- extension id (for example `execution-strategy:retryable`, `facet:cost-hint`, `family:audio`)
- affected type files under `cli/src/runtime/cms-capability-registry/types.ts` or `cli/src/runtime/cms-node-contracts/types.ts`
- introspection/normalization/compile/presenter changes under `cli/src/runtime/cms-node-contracts/*`
- registry changes under `cli/src/runtime/cms-capability-registry/index.ts`
- test fixtures under `cli/src/__tests__/cms-node-contracts-*.test.ts`

## Packet Procedure

### P1. Type Contract Extension

- extend the relevant type in `types.ts`
- prefer optional fields over required fields
- if adding a union member, add discriminant literal to keep existing narrowing paths safe
- if adding a new enum value (family, strategy, visibility), add to both `CAPABILITY_FAMILIES` literal array and the exported type

### P2. Pipeline Stage Updates

Update in order:

1. `introspect.ts` — surface new fields in `NodeContractSummary`
2. `normalize.ts` — handle new field types in `sanitizeValue`/`coerceValue`
3. `compile.ts` — pass new fields through to hosted config
4. `presenter.ts` — render new fields in cards and summaries

### P3. Registry Mapping

- update `toCapabilityNode()` to extract new fields from hosted metadata
- update `inferFamilyFromSlug()` if adding a new family
- verify `deriveCapabilitiesFromHostedWorkflows()` fallback still works

### P4. Deterministic Validation

Run:

```bash
bash scripts/check-cms-contract-extension.sh
```

When that script doesn't exist yet for a new extension shape, run focused coverage:

```bash
cd cli && pnpm vitest src/__tests__/cms-node-contracts-*.test.ts
```

Plus `bash scripts/pr-ready.sh`.

### P5. Consumer Lane Verification

A contract extension affects multiple lanes. Verify:

- native intelligence planner still accepts `NodeContractSummary[]`
- workflow hygiene enrichment still processes workflow lists that reference the extended shape
- discovery UX still renders new fields in `growthub workflow` and `growthub capability` flows
- pre-execution summary still shows correct warnings and ready/missing status

### P6. Release + Ship Confirmation

- merge PR after checks are green
- run release workflow
- confirm npm remote versions match merged package versions

## Canonical Commands

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
cd cli && pnpm vitest src/__tests__/cms-node-contracts-*.test.ts
bash scripts/pr-ready.sh
```

## Definition Of Done

A CMS contract extension is done only when:

- all four pipeline stages handle the new shape
- focused vitest coverage passes
- consumer lanes (native intelligence, hygiene, discovery) verify without changes
- PR checks are green
- merge lands in `main`

## Related Packets

- [Native Intelligence Provider Kernel Packet](./KERNEL_PACKET_NATIVE_INTELLIGENCE_PROVIDER.md)
- [Workflow Hygiene Extension Kernel Packet](./KERNEL_PACKET_WORKFLOW_HYGIENE_EXTENSION.md)
- [Discovery UX Kernel Packet](./KERNEL_PACKET_DISCOVERY_UX.md)
