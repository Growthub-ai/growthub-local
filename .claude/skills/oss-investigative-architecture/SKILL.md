---
name: oss-investigative-architecture
description: Investigate the real architecture of a repository before proposing changes — map runtime topology, contracts, invariants, and extension points, then produce an additive, phased implementation plan grounded in source files rather than assumptions. Use when the user asks to analyze an OSS repo or SDK, plan an adapter/provider/integration extension, audit a workflow or agentic runtime, review a PR against architecture truth, or draft an implementation module for a monorepo.
triggers:
  - investigate this repo
  - analyze the architecture
  - source-of-truth analysis
  - what already exists in this codebase
  - plan an additive extension
  - draft an implementation module
  - adapter extension plan
  - audit the runtime topology
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Every architectural claim cites a file path that exists in the target tree.
    - Findings are categorised as Already Exists / Partially Exists / Missing / Proposed with no blurring between categories.
    - Proposed work extends an existing contract or extension point instead of introducing a parallel abstraction.
    - Output follows the eight-section format (Current State through Anti-Patterns).
    - No invented files, runtime systems, SDK exports, adapter modes, CI pipelines, or provider capabilities.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers:
  - path: helpers/map-surfaces.sh
    description: Read-only surface map of a target repo — top-level layout, package/monorepo boundaries, entry points, docs inventory, CI workflows.
  - path: helpers/find-contracts.sh
    description: Read-only contract and extension-point discovery — contract/interface/schema files, adapter/provider/registry/plugin patterns, env selectors, validation layers.
subSkills:
  - name: governed-workspace-mutation
    path: skills/governed-workspace-mutation/SKILL.md
mcpTools: []
---

# OSS Investigative Architecture — v1

Source-of-truth investigative analysis against repositories, SDK contracts, architecture docs, PRs, runtime topology, and implementation surfaces. Optimized for infrastructure-first systems, adapter architectures, workflow runtimes, governed execution systems, local model orchestration, agentic runtimes, and monorepos.

**Critical rule: never generate implementation modules from assumptions alone. Investigate the actual repo surfaces first.**

## Core operating principle

Before proposing architecture, implementation modules, or system changes:

1. Discover the existing source-of-truth.
2. Identify current runtime topology.
3. Identify actual contract boundaries.
4. Identify invariants already enforced.
5. Identify extension points already designed into the system.
6. Only then propose additive implementation.

Never invent parallel architectures when the repo already has adapter systems, provider abstractions, runtime contracts, orchestration layers, execution boundaries, event systems, pipeline contracts, SDK primitives, typed interfaces, or validation flows. The goal is extension, specialization, additive layering, composability, and contract preservation — never redundant systems, parallel abstractions, bypassed runtime authority, or broken invariants.

## Scope and target resolution

This skill operates on a **target tree** — any local clone the user names. Resolve it as:

```bash
TARGET_REPO="${TARGET_REPO:-$(pwd)}"
```

When the target is *this* repository (`growthub-local`), the source-of-truth order in [`AGENTS.md`](../../../AGENTS.md) §"Source Of Truth Order" overrides the generic order below — `README.md` → `AGENTS.md` → `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md` → focused `docs/` → starter workspace source → `scripts/runtime-control.sh` → `cli/src/**`.

## Canonical mutation boundary (governed Growthub workspaces)

When the target tree is a governed workspace (this repo's starter kit or any fork carrying `.growthub-fork/`), the investigation is not optional context — it protects a frozen invariant: **all workspace-config mutation goes through `PATCH /api/workspace` (allowlist: `dashboards`, `widgetTypes`, `canvas`, `dataModel`) and all sandbox execution goes through `POST /api/workspace/sandbox-run`.** No implementation module may add, bypass, or duplicate these two calls.

Before proposing or making any workspace-configuration call, load the sub-skill [`skills/governed-workspace-mutation/SKILL.md`](./skills/governed-workspace-mutation/SKILL.md) — a token-efficient contract card with the exact request/response shapes, the full error envelope, the read-modify-one-key recipe, and the boundary anti-patterns, each citing its route source.

## Source-of-truth priority order (generic)

When evidence conflicts, prioritize:

1. Actual source files
2. SDK contracts
3. Runtime implementation
4. Architecture docs
5. PR descriptions
6. README / docs
7. Discussions / issues
8. Benchmarks / external references

Tie-breakers: runtime implementation overrides docs; SDK contracts override assumptions; execution authority overrides conceptual language. Never present speculative future architecture as existing implementation truth.

## Required investigation pass

Run the helpers first — they are read-only and bound the search so you do not free-grep the tree:

```bash
bash helpers/map-surfaces.sh "$TARGET_REPO"     # Step 1 — surface map
bash helpers/find-contracts.sh "$TARGET_REPO"   # Steps 2 & 4 — contracts + extension points
```

(Helper paths are relative to this skill directory: `.claude/skills/oss-investigative-architecture/helpers/`.)

**Discover:** docs/, architecture docs, adapter docs, runtime topology, provider systems, SDK contracts, event contracts, execution contracts, CLI surfaces, orchestration layers, workflow runtime, validation systems, env gates, package boundaries, public APIs, source-record systems, trace/event conventions.

**Identify:** what already exists, what is partially implemented, what is only conceptual, what is frozen/stable, what is experimental, what is extensible, what is additive-safe, what is runtime-authoritative.

**Separate:** existing production truth vs. future proposals vs. optional ideas vs. conceptual aspirations.

## Repo analysis method

### Step 1 — Surface mapping

Map package structure, runtime entry points, CLI entry points, adapter registration, execution authority, API boundaries, UI/runtime split, event flow, storage boundaries, and orchestration topology. Build the mental model **before** implementation planning. `helpers/map-surfaces.sh` produces the raw inventory; read the files it surfaces.

### Step 2 — Contract discovery

Look for `contracts.ts`-style files, interfaces, SDK exports, public package types, normalized output structures, execution envelopes, event schemas, manifest formats, provider interfaces, and runtime surfaces. **The contracts define the real extension path. Do not bypass them.**

### Step 3 — Invariant discovery

Identify deterministic execution rules, authority boundaries, execution ownership, validation layers, CI expectations, runtime constraints, frozen boundaries, additive-only expectations, and source-of-truth ownership. Read CI workflow files and any agent contract (`AGENTS.md`, `CONTRIBUTING.md`) — these encode invariants directly. Implementation must preserve invariants.

### Step 4 — Existing extension points

Search for adapter-ready systems, open unions, plugin registration, provider abstractions, backend interfaces, transport boundaries, normalized outputs, runtime selectors, env selectors, and `providerType`-style patterns. Prefer extending these over inventing new architecture.

### Step 5 — Gap analysis

Classify every finding into exactly one category and never blur them:

- **Already Exists** — real runtime behavior, cite the file.
- **Partially Exists** — extension-ready but incomplete, cite what is there and what is not.
- **Missing** — actual implementation gap, state the evidence of absence (where you looked).
- **Proposed** — new additive architecture, clearly labelled as not-yet-existing.

## Implementation module rules

**Never start with code.** First provide architectural interpretation, current state, the missing extension, strategic layering, runtime implications, contract implications, CI implications, and migration implications. Then implementation phases.

### Phase design

Phases must compound logically, reduce entropy, preserve runtime stability, create usable value at each phase, avoid speculative over-expansion, and align with existing contracts. Organize phases around architectural stabilization → contract formalization → runtime extension → validation integration → operational usability. **Never** organize phases around arbitrary timelines.

### File-edit requirements

Every implementation module must include:

- **Exact file edits** — existing files to modify, new files to add, exports to extend, tests to add, docs to update.
- **Per-file purpose** — why this file changes, what layer it belongs to, what invariant it preserves.
- **Anti-pattern detection** — files that should NOT be modified, systems that should NOT be bypassed, duplicate-architecture risks.

## Additive architecture rules

Prefer: additive interfaces, open unions, optional fields, extension registries, adapter modes, provider abstractions, normalized outputs.

Avoid: breaking enum churn, hardcoded provider assumptions, runtime branching everywhere, duplicated transport logic, provider-specific domain code.

### Adapter system rules

If an adapter architecture exists: never bypass the adapter layer, never let domain code import provider SDKs, never create provider-specific domain logic. Always normalize outputs, preserve the env-selector pattern, preserve the provider abstraction, preserve runtime authority, preserve deterministic validation.

### Local model rules

Local models may reason, normalize, summarize, propose actions, and shape JSON. Local models must NOT own execution authority, directly execute tools, bypass contracts, access raw secrets, or mutate authoritative state directly. Execution authority remains deterministic.

### Tool-call safety rules

If introducing model tool usage, use **proposal → validation → dispatch**, not direct execution:

```
model proposes intent
  → policy validates
  → deterministic executor dispatches
  → normalized result returned
```

(This repo's workspace helper — propose-only query, explicit apply, receipt trail — is the reference implementation of this flow; see `docs/WORKSPACE_HELPER_CONTRACT_V1.md`.)

### Distillation / training rules

When discussing model distillation, distinguish runtime inference, trace collection, dataset export, offline fine-tuning, and runtime re-loading. Avoid training inside the core runtime, coupling CLI to ML infrastructure, or embedding training loops into the orchestration runtime. Prefer JSONL export, source-record lineage, auditable run traces, and offline QLoRA/fine-tuning pipelines.

## Required output format

Every analysis or implementation module delivered through this skill provides all eight sections:

1. **Current State** — what exists now, with file citations.
2. **Missing Extension** — the actual architectural gap.
3. **Strategic Direction** — why the proposed extension aligns with the runtime.
4. **Phased Implementation** — compounding phases.
5. **Exact File Edits** — precise modifications per file.
6. **Runtime Implications** — authority + execution effects.
7. **Validation Requirements** — tests, CI, typecheck, runtime checks.
8. **Anti-Patterns** — what must not happen.

## Hallucination prevention

Never invent files, runtime systems, SDK exports, adapter modes, CI pipelines, or provider capabilities. If uncertain: explicitly state the uncertainty, identify the missing repo evidence, and propose an investigation path. Do not present guesses as implementation truth.

## Self-evaluation loop

After producing each deliverable, check it against `selfEval.criteria` in this skill's frontmatter (≤ 3 retries). Inside a governed fork, record each attempt to `.growthub-fork/project.md` and `.growthub-fork/trace.jsonl` per the v1.2 primitive contract (`docs/SKILLS_MCP_DISCOVERY.md`).

## Success criteria

An investigation is correct when:

1. The helpers (or an equivalent bounded pass) ran before any architectural claim was made.
2. Every claim in "Current State" resolves to a real path in the target tree.
3. The gap analysis uses the four categories with no blending.
4. The proposal extends an existing contract or extension point, or explicitly justifies why none exists.
5. The eight-section output format is complete.

## Anti-patterns

- Generating implementation modules before reading the target tree.
- Citing docs as runtime truth when the implementation disagrees.
- Proposing a parallel abstraction next to an existing adapter/provider/registry system.
- Presenting "Proposed" work in the same voice as "Already Exists".
- Organizing phases around weeks/sprints instead of architectural dependency order.
- Free-form grepping the whole tree instead of the bounded helper pass.
- Writing to the target tree during investigation — this skill's discovery pass is read-only.

## Golden rule

The objective is not "generate lots of architecture." The objective is: **discover the real architecture, identify the safest extension point, and produce an additive implementation path aligned with runtime truth.**
