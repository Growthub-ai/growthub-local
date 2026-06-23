# Compounding Loop Value Map V1

High-value opportunity map for operating Growthub Local as a **governed causal
control plane** — built directly on the primitives that already ship, expressed
as one repeated Loop.

This document does not propose a new runtime, a new object model, or a new
mutation lane. Every opportunity below is a recombination of primitives that are
already real in the current line (`@growthub/cli@0.14.6`,
`@growthub/create-growthub-local@0.14.6`, `@growthub/api-contract@1.5.2` — read
manifests as the version source of truth per
[`docs/ARTIFACT_VERSIONS.md`](./ARTIFACT_VERSIONS.md)).

Read with:

- White paper: `docs/assets/Agent Workspace as Code v0.14.x_ A Governed Causal Control Plane for Production Agentic AI.pdf`
- [`docs/AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md`](./AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md)
- [`docs/WORKSPACE_NEW_REALITY_VALUE_MAP_V1.md`](./WORKSPACE_NEW_REALITY_VALUE_MAP_V1.md)
- [`docs/GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md`](./GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md)
- [`docs/WORKSPACE_CEO_PRIMITIVE_V1.md`](./WORKSPACE_CEO_PRIMITIVE_V1.md)
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md)
- [`docs/PROJECT_MANAGEMENT_WORKSPACE_TEMPLATE.md`](./PROJECT_MANAGEMENT_WORKSPACE_TEMPLATE.md)

---

## 1. The Loop is the product's native grammar

The Loop is not a new convention bolted on top of AWaC. It is the same lifecycle
the white paper formalizes as a causal control plane, the same rule the operating
framework states as `state → eligibility → guidance → action → evidence → next
state`, and the same shape the seeded `alignment-loop` swarm already runs
(`workspace-expert → executor-worker → critic-grader`).

| Loop stage | AWaC control-plane equivalent | Where it already lives |
| --- | --- | --- |
| **DISCOVER** | `state` + derived `eligibility` (`F(W_t)`) | Workspace Lens, `/ceo` bootstrap, `growthub workspace status --json`, `deriveCeoCockpit()` |
| **PLAN** | `guidance` → governed **proposal** | Helper `query` (propose-only), `/loop` `/swarm` `/register-api` `/create-object` slash commands |
| **EXECUTE** | reviewed **apply** + sandboxed **execution** | `POST /api/workspace/helper/apply`, `POST /api/workspace/sandbox-run`, workflow publish |
| **VERIFY** | **evidence** (receipts, source records, telemetry, browser proof) | `GET /api/workspace/agent-outcomes`, source-record refresh, truthful swarm telemetry, Growthub Browser DOM readback |
| **ITERATE** | **next state** `W_t+1` feeds the next derivation | Updated config + receipts re-derive Lens/CEO; promote-after-run self-improvement commands |

The loop commands in `helper-commands.js` are a keyboard front-end to this exact
chain. They are governed by construction:

- `/goal` — set a verifiable goal for the session (read-only, `mutates: false`).
- `/loop` — propose a governed recurring loop (`mutates: true`; seeds a proposal, never runs anything).
- `/swarm` — propose a governed `agent-swarm-v1` workflow row (review + apply before any run).
- `/workflows` — open Background Tasks (read-only).
- `/ceo` — open the CEO oversight cockpit (read-only fleet view).
- `/register-api`, `/create-object` — seed governed creation proposals.

**Invariant that makes every Loop below safe:** a mutating command only *seeds a
proposal request*. The mutation still travels the full chain
`helper query → review → helper/apply → receipt`. No command executes
`sandbox-run` directly and no command patches config directly
(`isGovernedHelperCommand` enforces this in the unit suite).

---

## 2. The highest-order primitives these opportunities compound on

These are the unique, mature, governed objects that every high-value loop reuses.
Naming them precisely is what keeps an opportunity additive instead of a side path.

| Primitive | Role in the Loop | Source of truth |
| --- | --- | --- |
| **Workspace artifact** | The owned, forkable, deployable unit (`growthub.config.json` + `apps/workspace` + `.growthub-fork/` + receipts + trace) | AWaC operating framework |
| **Data Model rows** | Causal seeds — durable business/execution state | `dataModel.objects[]`, `PATCH /api/workspace` allowlist |
| **`sandbox-environment` rows** | Execution boundary: `runLocality`, `adapter`, `agentHost`, `browserAccess`, `networkAllow`, `schedulerRegistryId` | Topology V1, Governed Sandbox Browser Access V1 |
| **`orchestrationConfig` / `orchestrationGraph`** | The decision graph; `agent-swarm-v1` execution mode | Swarm Cockpit Value Map V1 |
| **API Registry → resolver → Data Source → source record** | Capability causality chain (test → profile → resolve → bind → refresh) | New Reality Value Map V1 |
| **Source records** | The evidence layer that hydrates live-backed objects read-only | Workspace Config Contract V1 |
| **Helper (propose → review → apply → receipt)** | The mutation firewall — planning is probabilistic, mutation is bounded | Workspace Helper V1, helper apply route |
| **Workspace Lens / `/ceo` cockpit** | Readiness + executive oversight read-models (not a second runtime) | Workspace CEO Primitive V1 |
| **`alignment-loop` swarm + distillation helpers** | Built-in planner→executor→critic loop and the harvest→grade→upload→export training pipeline | `templates/seeded-configs/alignment-loop.config.json`, `helpers/*.mjs` |
| **Self-healing forks + worker kits/templates** | Compounding & variation: drift detection, additive heals, and templates as boot surfaces | README features, kernel packets |

**Compounding rule (the white paper's hypothesis, applied):** operational
intelligence rises with `causal density × resonance × evidence completeness ×
capability trust × governance strength`. Every opportunity below is designed to
move at least one of those variables *without* changing the underlying model —
the workspace gets smarter because its structure gets richer.

---

## 3. Production-ready standard vs. current reality

The user-facing pitch is "a ready-to-go workspace you can run locally or deploy
remotely, fully governed in its own runtime." The honest gap, read against the
README "current shipped reality" and the white paper's source-grounded review:

| Capability | Production-ready standard | Current shipped reality | Gap to close in-loop |
| --- | --- | --- | --- |
| Local-first workspace | Run/clone/deploy with zero hosted dependency | **Real** — Next.js app, Vercel-ready checks, filesystem persistence opt-in | Keep deploy checks green per fork |
| Governed creation cockpit | API → test → profile → resolver → Data Source → refresh, evidence-gated | **Real** (0.14.0) | Broaden resolver trust scoring (white paper §appendix `ResolverTrust`) |
| Governed swarms | Proposal → apply → `sandbox-run` → truthful telemetry → source-record history | **Real** (0.14.1), telemetry truthful-only | Repeatability metrics, audit completeness |
| Sandbox browser authority | Row-governed `browserAccess`, inherited by graph nodes | **Real** (0.14.2) | Containment evidence (0 unauthorized executions) |
| CEO oversight | `/ceo` cockpit, Agent Teams blueprints, linked canvas | **Real** (0.14.4) | Fleet-across-many-workspaces console is **direction, not a shipped product claim** |
| Widget data bindings | Live bridge-backed widgets from governed sources | **Partial** — V1 ships static `manual`/`json`/`csv`; bridge-backed tracked in [`BRIDGE_BACKED_WIDGETS_V1_PLAN.md`](./BRIDGE_BACKED_WIDGETS_V1_PLAN.md) | Promote source-record → widget binding |
| Workflow persistence | Local draft → scheduled durable execution | **Partial** — cockpit exposes readiness; durable scheduling per [`NO_CODE_WORKFLOW_PERSISTENCE_ROADMAP_V1.md`](./NO_CODE_WORKFLOW_PERSISTENCE_ROADMAP_V1.md) | Wire `schedulerRegistryId` end-to-end |
| Distillation / fine-tune loop | Harvest → grade → upload → export Unsloth JSONL, merge-signal boosted | **Real as helper scripts** (`helpers/*.mjs`), not yet a one-click cockpit | Surface the pipeline as a governed loop in `/ceo` |

The discipline for every opportunity: **strengthen the artifact, never bypass
it.** New data paths become governed objects or source records; new helper
capability stays propose-first; new workflow capability preserves
draft/test/publish; new readiness UI derives from evidence.

---

## 4. High-value compounding opportunities (each is one Loop)

Each opportunity is written as the same five-stage Loop, names the exact
primitives/endpoints it rides, and states the **local-now** and **deploy-remote**
posture so a user gets a ready-to-go workspace either way.

### A. Compounding the workspace itself (the self-improving flywheel)

The workspace that builds the workspace. This is the highest-leverage loop
because every other loop deposits evidence that makes this one stronger.

- **DISCOVER** — `/ceo` + Workspace Lens derive what is incomplete/blocked from config + receipts (`deriveCeoBootstrapState()`, `deriveCeoCockpit()`).
- **PLAN** — helper `query` proposes the next object/dashboard/workflow; `/loop` proposes a recurring improvement cadence.
- **EXECUTE** — `helper/apply` writes the accepted proposal; self-improvement "promote capability after run" commands lift proven patterns into reusable kit/template state.
- **VERIFY** — receipts in `agent-outcomes`; self-healing fork drift detection confirms the change is additive and upstream-safe.
- **ITERATE** — updated config re-derives Lens; the improvement becomes a seed for the next cycle.
- **Local-now / deploy-remote:** runs fully local; export commits the compounded artifact (config + receipts + trace) so a clone reproduces the same readiness.
- **Moves:** causal density ↑, evidence completeness ↑.

### B. Frontier-lab AI research in a loop

Use the governed swarm as a research harness where every claim is receipt-backed
— the white paper's "self-evidencing execution" applied to research.

- **DISCOVER** — `/goal` sets the verifiable research question; create `Sources`, `Findings`, `Evidence`, `Reports` objects.
- **PLAN** — `/swarm` proposes a research `agent-swarm-v1` graph (e.g. searcher → synthesizer → critic), reviewed before any run.
- **EXECUTE** — apply once; run via `POST /api/workspace/sandbox-run`; API Registry rows give agents governed search/data endpoints; `browserAccess` grants live-source reads only where the row allows.
- **VERIFY** — truthful token/tool telemetry + source-record run history are the evidence trail; the `critic` lane grades findings; Growthub Browser DOM readback corroborates any web claim.
- **ITERATE** — graded findings feed the next swarm; the report object accumulates traceable evidence instead of unstructured notes.
- **Local-now / deploy-remote:** local intelligence (Ollama) for cheap iteration; promote to serverless `sandbox-run` (via `schedulerRegistryId`) for scale.
- **Moves:** evidence completeness ↑, resonance ↑.

### C. Distillation & fine-tuning in a loop (already seeded)

This is **the most under-surfaced shipped asset.** The `alignment-loop` swarm and
the four distillation helpers already implement a full training-data flywheel.

- **DISCOVER** — `harvest-cursor-traces.mjs` (Phase 1) pairs prompts with executed work; the highest-signal heuristic is `mergedToMain` (squash-merged PRs = maintainer-accepted reality).
- **PLAN** — route raw pairs through the `critic-grader` sandbox row.
- **EXECUTE** — `grade-raw-pairs.mjs` (Phase 2) scores each pair via `sandbox-run` (gemma3:4b), with a quality floor for merge-boosted pairs.
- **VERIFY** — `upload-graded-traces.mjs` (Phase 2.5) appends `qualityScore ≥ threshold` rows into the `training-traces` Data Model object (append-only, receipt-backed).
- **ITERATE** — `export-training-traces.mjs` (Phase 3) emits an **Unsloth-ready QLoRA JSONL** of `{instruction, input, output}` and flips `exported: true`, so each run only takes new evidence. The fine-tuned model becomes the next `localModel` on the swarm rows — the loop literally trains the worker that runs the loop.
- **Local-now / deploy-remote:** harvest/grade/export all run local against `http://localhost:3000`; the resulting adapter can back local intelligence or a hosted execution lane.
- **Moves:** capability trust ↑, and (by white paper §"emergent operational intelligence") shifts the model's job from reconstruction to bounded planning over a better world model.
- **Highest-value next step (closes a real gap):** surface this 4-phase pipeline as a governed loop inside `/ceo` so distillation is a one-review cockpit action, not a manual script chain.

### D. Use-case dashboards / interfaces / workflow-APIs as "work packages"

Treat every deliverable (a dashboard, an interface, a workflow API) as a **work
package** under the *same* mental model the Project Management template already
ships — objects + sandbox row + workflow + dashboard, governed end to end.

- **DISCOVER** — pick the use case; `/create-object` proposes the business objects (the PM template's `Project Task Source` pattern generalizes to any domain).
- **PLAN** — helper `build_dashboard` / `create_widget` proposes layout + bindings; `/register-api` proposes the API Registry row that feeds it.
- **EXECUTE** — `helper/apply` writes objects + dashboard; API cockpit runs test → profile → Data Source → source-record refresh; the workflow row's `orchestrationConfig` is the bridge between Data Model and the real workflow canvas.
- **VERIFY** — dashboard widgets reconcile against source records (UI-vs-evidence mismatch report); workflow draft → test → publish only after the exact draft passes.
- **ITERATE** — the work package is a reusable, inspectable infrastructure object; clone it for the next use case.
- **Local-now / deploy-remote:** the same `apps/workspace` runs the dashboard locally and exports as a deployable Next.js app.
- **Moves:** causal density ↑, governance strength ↑.

### E. Variations of the workspace itself (templated forks → fleet)

The workspace is forkable and self-healing, so variation is cheap and upgrade-safe
— the path toward the white paper's "fleet generalization" direction.

- **DISCOVER** — pick a base (starter, repo import, skill import, kit, or one of the five dashboard templates).
- **PLAN** — `growthub discover` / `kit download` selects the boot surface; helper proposes the domain delta.
- **EXECUTE** — fork registration + governed customization (`PATCH /api/workspace` allowlist); per-client/per-engagement workspace artifacts.
- **VERIFY** — drift detection + dry-run heal plans keep each variant upgradeable without losing customization; deploy checks per fork.
- **ITERATE** — proven variants graduate into new templates/kits; one starter family → many adjacent workspaces "by recombination."
- **Local-now / deploy-remote:** each variant is independently runnable and deployable in its own governed runtime.
- **Moves:** capability trust ↑ (shared resolver set), governance strength ↑.

### F / G / H. Marketing, Engineering, and Sales loops (same grammar, different objects)

These are *not* new architecture — they are the operating framework's applied
use cases run as Loops. Each ships ready-to-go locally and deploys remotely.

| Loop | DISCOVER objects | PLAN | EXECUTE | VERIFY | ITERATE |
| --- | --- | --- | --- | --- | --- |
| **Marketing** | `Campaigns`, `Assets`, `Reviews`, `Publishing Calendar` | `/swarm` content/review swarm; `build_dashboard` for performance | API Registry for ad/analytics endpoints → Data Source refresh; review-routing workflow | source-record-backed performance widgets; approval receipts | promote winning creatives/segments into reusable blueprints |
| **Engineering** | `Tasks`, `Incidents`, `Runbooks`, `Releases` | `/swarm` planner→executor→critic (the seeded `alignment-loop`) | `sandbox-run` against governed repos; `browserAccess` for QA proof | Growthub Browser DOM readback + truthful telemetry; draft/test/publish | merged-to-main signal feeds the distillation loop (C) |
| **Sales / RevOps** | `Accounts`, `Contacts`, `Opportunities`, `Activities` | `build_dashboard` pipeline view; `/register-api` for CRM/enrichment | CRM API → Data Source → source-record refresh; follow-up/enrichment workflow | pipeline dashboard reconciles to source records | enriched records + outcomes compound the next quarter's model |

All three reuse the identical chain: objects (causal seeds) → governed
proposal → apply/sandbox-run → evidence → next state. The domain changes; the
governance grammar does not.

---

## 5. Cross-cutting invariants every Loop must respect

Lifted from the topology contract, the helper contract, and the swarm/CEO
invariants — these are the "mutation firewall" that keeps all eight loops
production-grade:

- `PATCH /api/workspace` is allowlisted (`dashboards`, `widgetTypes`, `canvas`, `dataModel`); it rejects full-config bodies, sidecar writes, credential-shaped fields, and **direct live-workflow mutation**.
- Draft → live workflow state happens **only** through `POST /api/workspace/workflow/publish`, verified against `sandbox-run` lineage.
- Helper is **propose-first, apply-second**; credentials are stripped server-side; every accepted apply appends a receipt to source records.
- Telemetry is **truthful-only** — no estimated token/tool counts, no fake run records, no synthetic checklist completion.
- Secrets are `authRef` references; they never enter prompts, proposals, source records, browser state, or docs.
- Browser authority is a **row capability** (`browserAccess`), inherited through graph policy — never a prompt instruction or session flag.

---

## 6. Success definition

These loops are working when the workspace can answer — from evidence, not chat —
*what is configured, what has real evidence, what the helper may safely do, what
is ready, what is blocked, and what happens next.*

Measure the system, not just the model (white paper Table 2): receipt coverage
(≥99% of state-changing actions), resolver trust coverage (≥95%), publish safety
rate (≥99%), drift exposure window (<24h in CI), and continuation quality
(>90% correct agent continuation above 90% receipt coverage).

The durable claim:

```text
Growthub Local lets a team run one governed Loop — DISCOVER, PLAN, EXECUTE,
VERIFY, ITERATE — over an owned workspace artifact, so that building the
workspace, researching, distilling models, shipping dashboards and workflows,
and running marketing, engineering, and sales all compound on the same
evidence-backed causal control plane, locally or deployed.
```
