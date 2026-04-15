# Growthub CLI Ecosystem — Frozen Snapshot + Refactored Roadmap

This document is the source of truth for the Growthub CLI ecosystem state after the rapid expansion window of PRs #60, #61, #64, #65, #71, #75, #76, #77, #78, and the prioritized roadmap for extension.

Read this before starting work on any ecosystem, orchestration, harness, or kit extension.

---

## Frozen Production State

### Release

- Published: `@growthub/cli@0.3.56`, `@growthub/create-growthub-local@0.1.58`
- Installer pin aligned: `@growthub/cli: 0.3.56`
- Main head: `a631ebe` (PR #78 merge)

### Frozen Architecture Statement

The Growthub CLI is no longer a workflow discovery tool. It is the **unified operator shell** over seven platform lanes: hosted workflow substrate, local native intelligence, worker kit ecosystem, custom workspace formalization, multi-harness agent surface, secure local auth, and ecosystem onboarding. All seven lanes share the same contract discipline and auth bridge.

---

## The Seven Platform Lanes (Merged)

### Lane 1: Hosted Workflow Substrate (PR #60, #61)

CMS node contract pipeline, workflow lifecycle controls, auth-gated discovery.

| Module | Purpose |
|--------|---------|
| `cli/src/runtime/cms-node-contracts/` | Introspect, normalize, validate, compile, present CMS nodes |
| `cli/src/runtime/cms-capability-registry/` | Hosted-truth registry with workflow-derived fallback |
| `cli/src/runtime/dynamic-registry-pipeline/` | DAG builder with upstream dataflow and cycle detection |
| `cli/src/runtime/workflow-hygiene/` | Lifecycle labels (canonical/experimental/archived) |
| `cli/src/runtime/hosted-execution-client/` | Typed hosted execution bridge |
| `cli/src/runtime/machine-capability-resolver/` | 5-gate machine/user/org scoping |
| `cli/src/runtime/artifact-contracts/` | Standardized output manifests |
| `cli/src/auth/hosted-client.ts` | `archiveHostedWorkflow`, `deleteHostedWorkflow` + profile/workflow bridge |

### Lane 2: Local Native Intelligence (PR #64)

Assistive reasoning layer over workflows, contracts, runtime context. Not a tool-runner — a shaper/recommender/summarizer.

| Module | Purpose |
|--------|---------|
| `cli/src/runtime/native-intelligence/contract.ts` | Planner, normalizer, recommender, summarizer interface |
| `cli/src/runtime/native-intelligence/planner.ts` | Workflow planning from user intent + available contracts |
| `cli/src/runtime/native-intelligence/normalizer.ts` | Model-assisted binding normalization |
| `cli/src/runtime/native-intelligence/recommender.ts` | Strategy: reuse-existing / start-from-template / synthesize-new |
| `cli/src/runtime/native-intelligence/summarizer.ts` | Pre/post-execution explanation |
| `cli/src/runtime/native-intelligence/provider.ts` | Gemma (gemma3, gemma3n, codegemma) backend adapter |

Guardrail: **model layer does not run tools**. Shapes only. Compile/save/execute still flows through contract pipeline. Hosted runtime remains canonical.

### Lane 3: Worker Kit Ecosystem (PR #65, #71, #75)

Eight shipped kits under `cli/assets/worker-kits/`:

| Kit | Family |
|-----|--------|
| `creative-strategist-v1` | workflow |
| `growthub-ai-website-cloner-v1` | studio |
| `growthub-email-marketing-v1` | operator |
| `growthub-geo-seo-v1` | studio |
| `growthub-open-higgsfield-studio-v1` | studio |
| `growthub-open-montage-studio-v1` | studio |
| `growthub-postiz-social-v1` | studio (custom workspace) |
| `growthub-twenty-crm-v1` | studio |

Each is a complete self-contained environment: manifest, bundle, entrypoint, agent contract, brand templates, frozen assets, setup scripts, env examples.

### Lane 4: Custom Workspace Formalization (PR #76)

| Artifact | Purpose |
|----------|---------|
| `docs/kernel-packets/KERNEL_PACKET_CUSTOM_WORKSPACES.md` | Reusable contract for shipping worker kits end-to-end |
| `scripts/check-custom-workspace-kernel.sh` | Deterministic validation guard |
| `node scripts/check-worker-kits.mjs` | Asset/manifest validation |

Invariants frozen: `kit.json` schema, `frozenAssetPaths`, `BUNDLED_KIT_CATALOG` registration, `family: "studio"` for custom workspaces, required setup assets.

### Lane 5: Agent Harness Surface (PR #77)

CLI is now a multi-harness operator shell. Two harnesses shipped:

| Harness | Module | Integration |
|---------|--------|-------------|
| Open Agents | `cli/src/runtime/open-agents/` | Vercel-style durable agent workflow, sandbox isolation, GitHub integration |
| Qwen Code | `cli/src/runtime/qwen-code/` | Local terminal AI coding agent via binary spawn |

Each harness has: `contract.ts` (types), `provider.ts` (backend adapter), `index.ts` (public API), command surface (`cli/src/commands/open-agents.ts`, `qwen-code.ts`). Harness discovery restructured with filter-by-type in the top-level hub.

### Lane 6: Secure Local Auth Primitive (PR #77)

| Artifact | Purpose |
|----------|---------|
| `cli/src/runtime/agent-harness/auth-store.ts` | Secure harness credential storage |
| `docs/AGENT_HARNESS_AUTH_PRIMITIVE.md` | Contract frozen for all harnesses |
| `docs/kernel-packets/KERNEL_PACKET_AGENT_HARNESS.md` | Reusable kernel for new harness additions |

Contract:
- Public config lane: `~/.paperclip/<harness-id>/config.json` (non-secret only)
- Secure auth lane: `~/.paperclip/harness-auth/<harness-id>.json` (secrets, 0700/0600)
- Secret masking rules in all UX output
- `scripts/check-agent-harness-kernel.sh` validation script

### Lane 7: Ecosystem Onboarding Polish (PR #77, #78)

| Artifact | Purpose |
|----------|---------|
| `README.md` | Collapsed accordions, ecosystem map, discovery ordering |
| `cli/README.md` | Hierarchy cleanup, upstream refs |
| Mermaid ecosystem map | Renders cleanly, readable at scale |

Once the CLI covers seven lanes, onboarding IS substrate.

---

## Refactored Roadmap

The old roadmap focused on kit capability declarations and workflow template sharing. That scope is too narrow now. With native intelligence, multi-harness, and custom workspace formalization shipped, the highest-leverage work now spans all seven lanes.

### Tier 1 — Cross-Lane Integration (Highest Leverage)

These unlock compound effects by connecting lanes that ship independently today.

#### 1. Native Intelligence × CMS Contract Pipeline Integration

Native intelligence already has `planWorkflow(userIntent, availableContracts)`. The contract pipeline already has `introspectNodeContract()` producing `NodeContractSummary`. Wiring them end-to-end: user types intent in dynamic pipeline assembler -> planner proposes node sequence -> `normalizeNodeBindings()` applies model-suggested bindings -> `buildPreExecutionSummary()` validates -> `renderPreExecutionSummary()` shows what will run. The user confirms or edits. This is the first closed loop between the intelligence layer and the execution substrate.

**Uses:** `NativeIntelligenceProvider.planWorkflow()`, `introspectNodeContract()`, `normalizeNodeBindings()`, `buildPreExecutionSummary()`

**Work:** Optional `--plan "<intent>"` flag in `pipeline assemble`, or an "AI-assisted assembly" path in the interactive flow.

#### 2. Kit Capability Declarations

Add `capabilitySlugs: string[]` to `KitManifestV2`. Each of 8 shipped kits declares which CMS capability slugs its agent operates. Creative-strategist: `["llm-text-generation", "image-generation", "slides-generation"]`. Higgsfield studio: `["video-generation"]`. AI website cloner: `["image-analysis", "llm-text-generation"]`. An orchestrator reads `growthub kit list --json` and matches workspace capabilities against pipeline node requirements.

**Uses:** `KitManifestV2` schema, `listBundledKits()`, `inspectBundledKit()`, all 8 kit manifests

**Work:** One schema field, populate in 8 kit manifests, validate in `check-worker-kits.mjs`.

#### 3. Harness × CMS Contract Pipeline

Open Agents and Qwen Code are currently standalone harnesses. Extending them so they can submit assembled pipelines back through the hosted execution bridge turns them into first-class pipeline consumers. An Open Agents session plans and executes a pipeline. A Qwen Code session composes a pipeline and hands it off for execution. The harness adapter becomes a pipeline producer.

**Uses:** `compileToHostedWorkflowConfig()`, `executeHostedPipeline()`, harness command surfaces

**Work:** `pipeline execute --from-harness <harness-id>` path, harness-to-pipeline bridge.

#### 4. Native Intelligence × Workflow Hygiene

The summarizer already has `ExecutionSummaryInput` with pipeline context. After execution, summarizer can propose label transitions — "this workflow just had its 3rd successful run, promoting to canonical" or "this workflow has 5 failed runs, recommend archive." Hygiene labels become dynamically intelligent rather than purely time/count heuristics.

**Uses:** `NativeIntelligenceProvider.summarizeExecution()`, `WorkflowHygieneStore`, `inferDefaultLabel()`

**Work:** Post-execution hook that invokes summarizer, applies or suggests label updates.

---

### Tier 2 — Lane Depth Extensions

These strengthen individual lanes with merged foundation.

#### 5. Pipeline Template Sharing via Canonical Labels

Surface `canonical`-labeled workflows as browsable templates in the `Templates` discovery path. Every mature pipeline becomes a reusable template.

**Uses:** `compileToHostedWorkflowConfig()`, `saveHostedWorkflow()`, `enrichWorkflowSummaries()`, workflow hygiene store

#### 6. Pre-Execution Summary as Agent-Readable JSON

Expose `buildPreExecutionSummary()` output as JSON via `--json` flag or standalone `growthub pipeline validate --json`. Machine-readable contract validation.

**Uses:** `buildPreExecutionSummary()`, `PreExecutionSummary` type

#### 7. Artifact Provenance Filtering by Connection

Add `connectionId` to `ArtifactQuery`, expose as `--connection <id>` flag. Cross-workspace artifact discovery.

**Uses:** `ArtifactQuery`, `GrowthubArtifactManifest.createdByConnectionId`

#### 8. Headless Pipeline API

`growthub pipeline execute --file pipeline.json --yes --json`. Reads `SerializedPipeline`, runs contract pipeline, submits to hosted execution, returns JSON. No TTY.

**Uses:** `deserializePipeline()`, contract pipeline primitives, hosted execution client

#### 9. Contract Diffing Between Node Versions

`diffNodeContracts(before, after)` comparing two `NodeContractSummary` objects. Agents see what changed when CMS nodes evolve.

**Uses:** `introspectNodeContract()`, `NodeContractSummary`

#### 10. Third Harness Addition (Pattern Validation)

Add a third harness using the frozen kernel packet (`KERNEL_PACKET_AGENT_HARNESS.md`). Candidates: Claude Code, Cursor CLI, Codex CLI, Continue. Validates the kernel packet is reusable.

**Uses:** `KERNEL_PACKET_AGENT_HARNESS.md`, auth primitive, harness contract pattern

#### 11. Workflow Hygiene Execution History

Extend `WorkflowHygieneRecord` with `lastExecutedAt`, `executionCount`, `primaryArtifactFamily`, `lastCreditCost`. Operational intelligence in workflow list.

**Uses:** `WorkflowHygieneStore`, post-execution hook

---

### Tier 3 — Ecosystem Compound

These unlock the self-reinforcing growth loop.

#### 12. Template-to-Pipeline Binding

Add `sourcePipeline` field to `TemplateArtifact`. Every template becomes a reproducible recipe with node sequence metadata.

#### 13. Agents Freeze Artifacts as Templates

`growthub template freeze <artifact-id>`. Execution-proven artifacts flow back into the template catalog.

**Depends on:** Items 7, 12

#### 14. Agents Serialize Workspaces as Kits

`growthub kit export`. Working workspace configurations become distributable kits via the frozen custom workspace kernel.

**Depends on:** Items 2, custom workspace kernel packet

#### 15. Native Intelligence × Harness Orchestration

Planner proposes which harness should handle which task based on harness capability declarations. Open Agents gets durable multi-step work. Qwen Code gets local coding tasks. The intelligence layer becomes a harness router.

**Depends on:** Items 1, 3, harness capability declarations

#### 16. Shared Knowledge Layer Across Workspaces

`growthub knowledge` CLI surface. Knowledge tables shared across spawned worktrees through the growthub_local connector.

**Depends on:** Items 2, 7

#### 17. Cross-Workspace Pipeline Routing

`targetWorkspace` on pipeline nodes. Orchestrator routes segments across worktrees based on kit capability declarations.

**Depends on:** Items 2, 8

---

### Tier 4 — Open Ecosystem

#### 18. Kit Composition (Multi-Workspace Bundles)

Composed kits bundle multiple kits with pre-wired cross-workspace pipelines.

**Depends on:** Items 2, 8, 17

#### 19. Harness Interoperability via Contracts

Paperclip and other third-party harnesses speak the same `CmsCapabilityNode`, `DynamicRegistryPipeline`, kit schema, template contract, and harness auth primitive. The kernel packets are the interoperability spec.

**Depends on:** Items 8, 13, 14

#### 20. Community Kit + Template + Harness Marketplace

Shared registry with `visibility: public | authenticated | admin`. Kits, templates, pipeline patterns, harness adapters discoverable across harnesses.

**Depends on:** Items 13, 14, 19

---

## Dependency Graph

```
Tier 1 — Cross-Lane Integration
  1. Native Intelligence × CMS contracts
  2. Kit capability declarations
  3. Harness × CMS contract pipeline
  4. Native Intelligence × workflow hygiene
     │
Tier 2 — Lane Depth
  5.  Canonical workflows as templates
  6.  Pre-execution summary JSON
  7.  Artifact provenance filtering
  8.  Headless pipeline API
  9.  Contract diffing
  10. Third harness addition
  11. Workflow hygiene history
     │
Tier 3 — Ecosystem Compound
  12. Template-to-pipeline binding
  13. Artifact → template freeze        ← 7, 12
  14. Workspace → kit export            ← 2
  15. Intelligence × harness routing    ← 1, 3
  16. Knowledge layer                   ← 2, 7
  17. Cross-workspace routing           ← 2, 8
     │
Tier 4 — Open Ecosystem
  18. Kit composition                   ← 2, 8, 17
  19. Harness interop via contracts     ← 8, 13, 14
  20. Community marketplace             ← 13, 14, 19
```

---

## Guardrails (Frozen by Design)

- No rebuild of hosted orchestrator/router/executor
- No node-family-specific special framework
- CLI layer focuses on introspection, shaping, presentation, lifecycle control, harness orchestration
- Hosted runtime remains canonical truth for execution behavior
- Native intelligence shapes only; does not execute tools directly
- Harnesses run as external processes; no in-process SDK import
- Secure auth lane separation is mandatory for new harnesses
- Runtime control remains `scripts/runtime-control.sh`
- Kernel packet validation runs before merge: `check-custom-workspace-kernel.sh`, `check-agent-harness-kernel.sh`
- Run `bash scripts/pr-ready.sh` before pushing

---

## Canonical Files by Lane

| Lane | Files |
|------|-------|
| Hosted Workflow Substrate | `cli/src/runtime/cms-node-contracts/*`, `cms-capability-registry/*`, `dynamic-registry-pipeline/*`, `workflow-hygiene/*`, `hosted-execution-client/*`, `artifact-contracts/*`, `auth/hosted-client.ts` |
| Native Intelligence | `cli/src/runtime/native-intelligence/*`, `docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` |
| Worker Kits | `cli/assets/worker-kits/*`, `cli/src/kits/*`, `cli/src/commands/kit.ts` |
| Custom Workspace Kernel | `docs/kernel-packets/KERNEL_PACKET_CUSTOM_WORKSPACES.md`, `scripts/check-custom-workspace-kernel.sh`, `scripts/check-worker-kits.mjs` |
| Agent Harness | `cli/src/runtime/agent-harness/*`, `cli/src/runtime/open-agents/*`, `cli/src/runtime/qwen-code/*`, `cli/src/commands/open-agents.ts`, `qwen-code.ts` |
| Harness Auth Primitive | `cli/src/runtime/agent-harness/auth-store.ts`, `docs/AGENT_HARNESS_AUTH_PRIMITIVE.md`, `docs/kernel-packets/KERNEL_PACKET_AGENT_HARNESS.md` |
| Ecosystem Onboarding | `README.md`, `cli/README.md`, `docs/kernel-packets/README.md` |

---

## Canonical Commands

```bash
# Discovery entry
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover

# Kernel validation
node scripts/check-worker-kits.mjs
bash scripts/check-custom-workspace-kernel.sh
bash scripts/check-agent-harness-kernel.sh

# Pre-push gate
bash scripts/pr-ready.sh
```
