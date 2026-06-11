# Agent Harness Pattern Synthesis V1

Cross-parallels between production frontier-agent harness design (Claude Code / Claude consumer harness, as observed from inside a live session) and the Growthub Local AWaC architecture, with extrapolation opportunities ranked by leverage.

## 1. Intent

Frontier agent harnesses solve the same problems AWaC solves — capability discovery, context economy, governed mutation, delegation, memory, and trust boundaries — but they solve them at the prompt/runtime layer rather than the workspace layer. This document distills the harness-side mechanisms, maps each to its existing Growthub analog, and identifies where the analog is already at parity, where it is ahead, and where a low-cost extrapolation closes a real gap.

The thesis: **Growthub Local already implements most frontier harness patterns as governed, on-disk artifacts.** The highest-leverage remaining work is not inventing new primitives — it is (a) closing the distillation flywheel that turns existing governed traces into local-model training signal, and (b) porting three or four harness micro-patterns (trigger grammar, behavioral schemas, typed delegation roles, event-driven wake) into contracts that already exist.

## 2. Scope and Method

Source material on the harness side: the Claude Fable 5 consumer system prompt (skills, MCP app suggestion flow, search/copyright layering, artifact storage) and the Claude Code remote-execution agent harness (deferred tool loading, typed subagents, plan/permission modes, PR event subscription, context compaction, hook system). Patterns are described at the mechanism level; no harness prompt text is reproduced here.

Source material on the AWaC side (source-of-truth order per `AGENTS.md`):

| Surface | Anchor |
| --- | --- |
| Agent contract + six primitives | `AGENTS.md`, `docs/SKILLS_MCP_DISCOVERY.md` |
| Layered cognition model (L1–L5) | `docs/AGENT_SKILLS_TOOLS_UNIFICATION.md` |
| Authority boundary | `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md` |
| Propose/apply engine | `docs/WORKSPACE_HELPER_CONTRACT_V1.md` |
| Typed SDK contract | `packages/api-contract/` (`docs/CMS_SDK_V1.md`) |
| Local intelligence + sandbox adapter | `docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` |
| Fork governance + attestations | `cli/src/kits/fork-authority.ts` |
| Swarm execution | `docs/SWARM_RUN_CONTRACT_V1.md`, `docs/GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md` |
| Memory lanes | `docs/MEMORY_KNOWLEDGE_PROFILE_GUIDE.md` |

## 3. Cross-Parallel Map

Each row: the harness mechanism, the existing Growthub analog, and the parity verdict. Sections 4–6 expand the rows where the verdict is "gap" or "partial".

| # | Harness mechanism | Growthub analog | Verdict |
| --- | --- | --- | --- |
| P1 | Deferred tool loading — tools exist as name + one-line trigger until a schema is fetched on demand (ToolSearch); MCP servers connect asynchronously without blocking the session | `CapabilityManifestEnvelope` + `NodeInputSchema` exist but are loaded eagerly per flow; `SKILL.md` frontmatter is the name+trigger layer | Partial — disclosure exists, on-demand schema resolution is not a first-class primitive |
| P2 | Skill trigger grammar — skill descriptions encode explicit TRIGGER / SKIP / precedence rules, and triggering accuracy is itself benchmarked | `SkillManifest.description` + optional `triggers[]`; catalog rules in `.claude/skills/README.md` | Gap — trigger rules are prose conventions, not a testable contract |
| P3 | Mandatory read-before-act — the harness makes reading the relevant skill an unconditional gate before producing output of that type | Agent read order in `docs/SKILLS_MCP_DISCOVERY.md` (`project.md` → `SKILL.md` → sub-skills) | Parity — AWaC's read order is the same gate, enforced by convention |
| P4 | Typed subagent delegation — named agent types with per-type tool allowlists (a read-only explore type, a plan type, a general type), optional git-worktree isolation, background execution with completion wake, continuation by ID | `agent-swarm-v1` orchestration graphs, sub-skill lanes, sandbox-environment rows, `growthub worktree:make` | Partial — swarm roles exist but per-role tool/helper allowlists are not contract-level |
| P5 | Propose/apply separation — connectors are suggested, never auto-selected; plans require explicit approval; permission modes graduate autonomy | Workspace Helper propose-only + explicit apply + receipts; PATCH allowlist hard ceiling; `policy.json::autoApprove` | Parity, partially ahead — receipts are an on-disk artifact the harness does not have |
| P6 | Layered authority — instruction sources are strictly ordered; platform reminders can never *reduce* restrictions; external content (webhooks, PR comments) arrives in untrusted envelopes and cannot redirect the task | Source Of Truth Order in `AGENTS.md`; hosted authority C-tier; browser never holds Bridge token | Partial — ordering exists, but imported third-party content (repos, skills, kits) has no untrusted-envelope treatment |
| P7 | Event-driven wake — agents subscribe to external event streams (PR activity) and are woken by events; polling/sleeping is prohibited; self-scheduled check-ins cover event gaps; loops have declared terminal states | `ExecutionEvent` NDJSON union with swarm lifecycle + terminal events; Background Tasks; `schedulerRegistryId` | Partial — streams exist, subscription/wake semantics for agents do not |
| P8 | Context compaction contract — when context overflows, a summary plus remaining context is handed to the next window; everything the user needs must live in the final artifact, not mid-stream narration | `.growthub-fork/project.md` append-only session memory, seeded from `templates/project.md`; `trace.jsonl` | Parity in storage; gap in contract — *what must be written before a context boundary* is unspecified |
| P9 | Bounded loops with escalation — retry loops are bounded AND have a no-progress escape: after several rounds without progress, the agent must surface a diagnosis instead of silently exhausting retries | `selfEval.criteria[]` + `maxRetries` + `self_eval_recorded` trace events | Partial — bounded, but exhaustion is silent; no escalation artifact |
| P10 | Behavioral tool schemas — tool definitions carry when-to-use / when-NOT-to-use rules, negative examples, and cross-tool orchestration rules (e.g. "always call X before Y"), not just type schemas | `NodeInputSchema` is type-only (Zod); orchestration knowledge lives in skills and docs | Gap — capability contracts validate shape, not usage |
| P11 | Registry-search-before-improvise — the harness checks its registry of connectors before falling back to browsing or ad-hoc work | Kit registry, `COMMUNITY_KIT_REGISTRY.md`, discovery hub lanes | Partial — registries exist; a canonical capability-resolution order is not written down |
| P12 | Model routing and measure tiers — per-subagent model overrides; the same underlying model ships in different capability tiers distinguished only by safety measures, not weights | Native intelligence canonical vs concrete model ids; candidate resolution chains; sandbox adapter `local-intelligence` (propose `toolIntents`, never execute) | Parity in structure — `localModel` resolution mirrors model override; tiering insight extrapolates to per-row toolIntent allowlists |
| P13 | Lifecycle hooks — deterministic automation (session-start hooks, settings-driven triggers) is executed by the harness, never by the model; memory/preference cannot substitute for a hook | `helpers/<verb>.{sh,mjs,py}`, `scripts/runtime-control.sh`, `scripts/guard.sh` | Partial — helper layer exists; kit lifecycle hooks (post-fork, pre-sync, post-apply) are not declared in `kit.json` |
| P14 | Distillation flywheel — structured interaction traces become training signal for smaller/local models | `growthub-local-intelligence-trace-v1` JSONL export; helper receipts; `trace.jsonl`; pipeline stage traces | Partial — export exists for one surface; the corpus is fragmented and unlabeled |

## 4. Where AWaC Is Already Ahead

Three things the workspace-layer approach does that the harness layer cannot, worth protecting as differentiators rather than diluting:

1. **Receipts as durable governance artifacts.** The harness's propose/apply (connector suggestion, plan approval) is ephemeral — approval lives in conversation history. Helper apply receipts (`GET /api/workspace/helper/receipts`) are append-only, on-disk, and replayable. This is strictly stronger and is the substrate for opportunity O1 below.
2. **The agent contract as a forkable artifact.** Harness behavior ships in a prompt the user cannot version; AWaC ships `AGENTS.md` + six primitives in every kit export, so governance travels with the fork. The pointer-stub pattern (`CLAUDE.md`, `.cursorrules` → `AGENTS.md`) already solves multi-harness convergence that prompt-layer systems solve per-vendor.
3. **Cryptographic authority.** Harness trust is positional (which prompt layer said it). Fork authority's ed25519 attestations (`cli/src/kits/fork-authority.ts`) make trust verifiable and transferable. No frontier harness exposes an equivalent.

## 5. Extrapolation Opportunities (Ranked)

Ranked by leverage ÷ cost. O1–O4 are the low-hanging fruit: each builds on data or contracts that already ship.

### O1 — Close the distillation flywheel (P14, P5)

The single highest-leverage item. Every governed surface already emits structured decision data; none of it is unified or labeled for training:

- Helper receipts already encode preference pairs: proposals returned by `query` that were **applied** vs **skipped** at `apply` time are natural accept/reject labels (DPO-shaped) for the exact planning task the local intelligence planner performs.
- `trace.jsonl` `self_eval_recorded` events encode (attempt, criteria, outcome) tuples — supervision for the summarizer/normalizer.
- Pipeline stage-boundary traces (`docs/PIPELINE_TRACE_CONVENTION_V1.md`) encode (intent → node path) pairs — supervision for the planner and recommender.

Extrapolation: extend the existing `growthub-local-intelligence-trace-v1` JSONL exporter into a unified corpus export — `growthub trace export --corpus` — that normalizes receipts, self-eval events, and stage traces into one labeled record shape. Section 31.2 of `docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` already commits to the "no training in CLI, JSONL out to external QLoRA tooling" boundary; this only widens what feeds it. The result is a per-workspace fine-tuning corpus that improves the local planner on *that workspace's* grammar — something hosted frontier models structurally cannot offer.

### O2 — Trigger grammar + triggering evals for skills (P2)

The harness treats skill-description quality as a measurable property: descriptions carry explicit TRIGGER and SKIP clauses (including "run this cheap check first, and skip if it hits"), and triggering accuracy is benchmarked against task corpora.

Extrapolation: add optional `triggers.when[]` / `triggers.skipWhen[]` / `triggers.precheck` fields to `SkillManifest` (`packages/api-contract/src/skills.ts`, additive, version-sentinel-safe), and a `growthub skills eval-triggers` check that replays a small fixture set of task prompts against the catalog and reports routing accuracy. The marketing-operator skill (intent → kit dispatch) is the natural first consumer — its dispatch table is already a routing function waiting for a test harness.

### O3 — Behavioral capability schemas (P10)

Type-valid is not use-correct. The harness encodes orchestration rules directly in tool contracts ("call the SPEND insight before any other insight type"; "reference images bind via `refs[].dataUrl`, not URL fields"). Growthub has already paid the cost of *not* having this: the `growthub-video-generation` skill exists largely to correct a binding mistake (`referenceImages` URL-only vs typed `refs[].dataUrl`) that a behavioral schema would have prevented at the contract layer.

Extrapolation: add an optional `usageGuidance` block to `CapabilityNode` / manifest entries — `whenToUse`, `whenNotToUse`, `orchestrationRules[]`, `negativeExamples[]`. Additive to `@growthub/api-contract`, consumed by the native-intelligence planner (better plans), the discovery hub (better hints), and any external harness reading the manifest. This moves knowledge currently trapped in per-skill prose into the typed contract where every consumer gets it.

### O4 — Self-eval escalation (P9)

Bounded retries without an escalation path fail silently; the harness pattern is "after N rounds without progress, stop and surface a diagnosis." Extrapolation: define a `self_eval_escalated` trace event emitted when `maxRetries` exhausts (or when consecutive attempts show no criteria delta), carrying the failing criteria and last diagnosis, and require kit templates' `templates/self-eval.md` to include the escalation note in `project.md`. Small, additive, and it converts retry exhaustion from a dead end into a human-readable handoff — the same artifact O1 can later learn from.

### O5 — Typed swarm roles with capability allowlists (P4)

Extrapolation: extend `SWARM_RUN_CONTRACT_V1` agent nodes with a `role` and per-role allowlists over helpers, CMS node families, and write surfaces — including a read-only `explore` role (the harness's most-used delegation type) that can read workspace state and traces but holds no write path. The sandbox-environment row already carries the execution adapter and network policy; the allowlist completes the cell membrane. Worktree isolation (`growthub worktree:make`) becomes a declarable property of a role rather than an operator habit.

### O6 — ExecutionEvent subscription and wake (P7)

The event union already includes terminal states (`complete`, `error`, `swarm_run_complete`). What's missing is the consumer-side primitive: `growthub workflow watch <run-id>` (or a sandbox-row binding) that blocks-or-wakes on terminal events, plus a self-check-in fallback for gaps — mirroring the harness rule that webhook coverage is never complete, so long-running supervision re-arms a scheduled check rather than polling. This is what makes "babysit this pipeline until green" a governed, scriptable task instead of an agent improvising sleep loops.

### O7 — Untrusted-import envelope and monotonic policy (P6)

The harness wraps all externally-authored content in untrusted envelopes and instructs the model that such content can never escalate its own access. AWaC imports entire repos and skills (`growthub starter import-repo`, `import-skill`) whose `AGENTS.md`/`SKILL.md` content becomes agent-readable instruction. Extrapolation: two rules in the import path — (1) imported agent-facing files are recorded in `fork.json` with an `origin: external` marker so harnesses can rank them below the root contract; (2) a monotonicity invariant: nothing in imported content may widen `policy.json` (e.g. flip `autoApprove`, extend the PATCH allowlist). Enforce at `growthub kit validate` / fork-register time. This is the AWaC-native answer to prompt injection via supply chain.

### O8 — Canonical capability-resolution order (P11)

One paragraph in `AGENTS.md`: before writing ad-hoc code, agents resolve capabilities in order — (1) skill catalog, (2) worker-kit registry, (3) kit helpers, (4) CMS capability manifest, (5) ad-hoc last. The harness equivalent ("search the registry before reaching for the browser") measurably reduces improvised side paths. Zero code; pure contract.

### O9 — Kit lifecycle hooks (P13)

Declare `hooks.{postFork,preSync,postApply}[]` in `kit.json` (schemaVersion 2 is already a union; this is additive), executed deterministically by the CLI — never by the agent. Mirrors the harness rule that automation belongs to the harness, not to model memory. First consumers: env-var validation post-fork, drift check pre-sync.

### O10 — Measure tiers for sandbox rows (P12)

The Fable/Mythos tiering insight — same weights, different measures — extrapolates cleanly: trust tier becomes a property of the sandbox-environment row, not the model. A `local-intelligence` adapter row at tier A may only propose `toolIntents` from a narrow allowlist; tier B widens it; weights never change. The adapter contract (§31.1 of the native-intelligence doc) already enforces propose-only; tiering just parameterizes the allowlist per row.

## 6. Mapping to the L1–L5 Model

Placement of the opportunities in the existing layered model from `docs/AGENT_SKILLS_TOOLS_UNIFICATION.md`:

| Layer | Opportunities |
| --- | --- |
| L1 INPUT (token validation) | O7 untrusted-import envelope |
| L2 PARSING (data aggregation) | O3 behavioral schemas, O2 trigger grammar |
| L3 HEURISTICS (strategy selection) | O8 resolution order, O5 typed roles, O10 measure tiers |
| L4 EXECUTION (atom persistence) | O4 escalation events, O6 event wake, O9 lifecycle hooks |
| L5 PRESENTATION (snapshot emission) | O1 corpus export (the snapshot of decisions, emitted for training) |

The key equation `S[k+1] = Freeze(Emit(Exec(Heur(Parse(Tokens[k+1] + deltas)))))` gains a feedback term under O1: emitted snapshots feed the local model that runs Heur, so each frozen state improves the heuristics applied to the next token stream.

## 7. Invariants This Document Must Not Violate

- Local-first authority stands: nothing here centers hosted authority; O1–O10 are all local-artifact extensions. Hosted execution remains C-tier per `AGENTS.md`.
- `@growthub/api-contract` changes are additive only (new optional fields, new event types); consumers must ignore unknown fields, matching the existing NDJSON additivity rule.
- The PATCH allowlist remains the hard ceiling; no opportunity above adds a write surface.
- The CLI never trains models (`docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` §30); O1 exports corpora, nothing more.

## 8. Validation

- Docs-only change: `git diff --check` plus readback of changed sections (per `AGENTS.md` checks table).
- Before implementing any O-item that touches `packages/api-contract`, re-read `docs/ARTIFACT_VERSIONS.md` and the package versions on the working branch; never cite semver from memory.
- O2/O3/O4 land as `SkillManifest` / manifest field additions → gate behind the existing `growthub skills validate` and `scripts/export-worker-kit.mjs --qa` parity checks.
