# Distillation Flywheel V1 — Mothership Proxy, Teacher Traces, Sparse-MoE Students

**Status:** design + implementation (stacked on PR #273's governed training runtime)
**Modules:** `lib/distillation-gateway.js`, `lib/distillation-student-plan.js`,
`lib/distillation-eval-harness.js`, `lib/distillation-fleet.js`
**Tests:** `scripts/unit-distillation-flywheel.test.mjs`, `scripts/e2e-distillation-flywheel-loop.mjs`

---

## 1. Design Read (the brief, restated as the thing we're building)

PR #273 shipped a real, governed, no-code local training pipeline with 16 proven
UI states. Its one remaining product gap is the **first mile on real machines**:
the journey completes only when the user's hardware can physically execute
QLoRA → GGUF → quantize → serve. On a weak machine, state 04 renders
"No local runtime configured" and the journey dead-ends. A non-technical user
never reaches *their* custom model.

The unlock is a reframe the existing data model already supports:

> **A custom model is a governed identity + a routing policy — not a weights
> file.** The weights are one (upgradeable) realization of it.

So the journey must complete on **every** machine tier, with honest semantics:

- **Tier can train** → the existing #273 pipeline runs, with the base model,
  quantization and LoRA config *sized to the machine* (Gemma-class students on
  weak hardware) instead of a fixed config that OOMs.
- **Tier can serve but not train** → the model identity goes live immediately,
  fronted by the **Mothership dynamic proxy**; training runs later, from
  harvested evidence, when the plan says the machine can carry it.
- **Tier can neither (yet)** → **harvest-only mode**: every invocation of the
  user's model routes through the proxy to the teacher (Kimi-class frontier
  model) or the local Llama/Ollama fallback, and every exchange is captured as
  a governed reasoning trace — hashed, counted, receipt-stamped. Training is
  *stored, not live*: the corpus compounds until a training-capable moment.

Either way the user gets a working end-to-end custom model pipeline on day one,
and the same flywheel makes the model progressively more *theirs*:

```
use model (proxy or student) → harvest traces → curate → distill student
        ↑                                                    │
        └------ router prefers the student as it wins ←------┘
```

### Design system read (taste discipline for the UI additions)

The existing surface is a quiet, evidence-first ops ledger: neutral palette,
pass/warn/fail chips, monospace identifiers, progress bars **only** from
receipt `pct`, one classified next action per issue. The additions must
disappear into that language:

- **Typography** — inherit the existing scale and `dm-*` classes; no new
  fonts; hashes and model tags in monospace, truncated with the full value on
  `title`; tabular counts.
- **Color** — zero new hues. Route modes and flywheel steps reuse the existing
  status token set; one accent maximum per view.
- **Layout** — the `/training` page's single 760px column rhythm; the flywheel
  is one horizontal evidence strip, not a dashboard of cards.
- **Motion** — none added. Determinate progress only when a receipt proves it
  (the #273 "no fabricated progress" invariant is a design rule here, not just
  a data rule).
- **Copy** — user-owned verbs and honest states: "Serving via teacher proxy —
  every reply is harvested for your model", "Training deferred: this machine
  fits up to a 4B student", never a fake "training…" shimmer.
- **Anti-slop pre-flight** — every visible claim maps to a deriver + governed
  row (the PROOF-INDEX posture); no decorative gradients, no emoji headers, no
  invented numbers.

---

## 2. How this maps onto the architecture diagram

| Diagram layer | Repo realization (all existing lanes, additively extended) |
| --- | --- |
| **Growthub Mothership** — control plane, model registry, governance, workspace configs, reasoning-traces JSON store, training receipts | The Data Model + API Registry rows + `model-training-run` receipts (#273). Traces get a sidecar namespace `distillation-traces:model-training:<slug>` exactly parallel to `training:` / `training-run:`; trace roots are hashed into receipts (`distillation.traceRootHash`). |
| **Dynamic Router Orchestration Engine** — parent layer, intelligent routing, expert affinity, load hints, OpenAI-compatible endpoint | `distillation-fleet.js`: the mothership proxy **policy row** in the API Registry (`metadata.mothershipProxy`), `deriveActiveRoute` (student → local base → teacher, evidence-gated), `deriveRouterSignals` (expert activations, KV-cache hints, cluster locality) derived from harvested traces. The AI-Agent node keeps calling the same thin OpenAI-compatible adapter it already uses — the row it points at is what gets smarter. |
| **Expert Fleet / Parallel Hosts** — sharded MoE experts, sparse fine-tune (deltas/nudges), LoRA | `distillation-student-plan.js`: MoE-Sieve salient-expert selection, DR-LoRA rank plans, sparsity metrics; `distillation-eval-harness.js`: promote-only-wins benchmarks + delta artifacts; shard registration proposals back into the registry. |
| **Sandbox Runs / only a few active per token** | The same `sandbox-run` lane and argv-only runner; two new runtime profiles (dense student, sparse-MoE student) with allowlisted bins and canonical progress stages. |

---

## 3. Sprint → module map

**Sprint 0 — Gateway + governed trace capture** (`distillation-gateway.js`)
- Thin, provider-agnostic teacher adapters: `kimi-k3` (remote,
  OpenAI-compatible, auth by **env-var name only** — no key material in any
  governed object), `ollama-local` (loopback fallback), and
  `openai-compatible-custom` (escape hatch). One resolution order, local-first.
- `growthub-distillation-trace-v1`: normalized reasoning traces (prompt,
  response, reasoning, cluster, token counts, optional expert activations /
  KV hints), content-hashed with a dependency-free `fnv1a64` and folded into an
  order-independent root hash stamped into receipts.
- A `trace-capture` receipt kind that — like `preinit-probe` — **never** enters
  the training-run lifecycle, so harvesting can't masquerade as training.
- Distillation **sub-stages** (`trace_capture → curation → synthetic_expansion
  → dense_student_training → sparse_calibration → sparse_student_training →
  delta_extraction → evaluation → fleet_registration`) that ride the canonical
  0–7 stage vocabulary via `subStageId` + monotonic `counter` — the 0–7 enum
  and `nextProgress` invariants are untouched.

**Sprint 1 — Machine-adaptive dense student + eval harness**
(`distillation-student-plan.js`, `distillation-eval-harness.js`)
- `resolveMachineTier` over the **existing** preflight probe evidence
  (RAM/disk/GPU) → a named tier; `buildAdaptiveStudentPlan` → a complete,
  honest plan: base model sized to the machine (Gemma-class first), quant
  level, batch/accum/rank, `mode: "train-local" | "harvest-only"`, with every
  downgrade recorded in `adjustments[]`. **This is the fix for "one-click
  fails per user machine config": the config adapts; the gate stops gating.**
- Eval harness normalizes task results (student vs baseline vs teacher),
  computes win rate + latency/cost deltas, and `promoted` only when wins
  clear the floor — only promoted students are eligible for routing priority.
- Delta extraction state: adapter-only artifacts with size-vs-full proof
  (a "delta" at ≥ full fine-tune size demotes honestly).

**Sprint 2 — Sparse-MoE path** (`distillation-student-plan.js`)
- MoE-Sieve: routing-frequency calibration → top-k salient experts per layer
  with coverage; DR-LoRA: adapter ranks grown by expert saliency, clamped to
  the machine tier.
- Sparsity metrics stamped into receipts: `activeExpertsPct`,
  `trainableParamsReductionPct`, `estimatedFlopsSavedPct`, plus the routing
  histogram hash so training-time and inference-time routing can be compared
  (operator-proof extension).

**Sprint 3 — Router & fleet + self-improvement** (`distillation-fleet.js`)
- The mothership proxy policy row + `deriveActiveRoute` (evidence-gated:
  a student must be tuned-tag **verified** to take priority; teacher requires
  configured auth env; local base requires a reachable runtime — no
  optimistic routing).
- `deriveRouterSignals` from traces: aggregated expert activations, per-cluster
  KV-cache reuse hints, locality affinity — the "intelligent routing" feed.
- `deriveFlywheelState`: the composed journey state (harvest → train →
  evaluate → route → re-harvest), counting **generations** so
  self-improvement is visible in receipt history, not vibes.

---

## 4. Governance invariants (unchanged, verified by tests)

1. **No parallel stores** — traces live in the source-record sidecar; policy
   lives in API Registry row metadata; everything else is `model-training-run`
   receipts. The Data Model stays the single source of truth.
2. **No schema/contract breaks** — every receipt extension is an optional
   `distillation` block; `TRAINING_PROGRESS_STAGES` (0–7) is untouched;
   `nextProgress` monotonicity is preserved and re-tested with sub-stages.
3. **No new mutation lane** — app modal + CLI sidecar remain the only writers;
   the proxy row goes through the existing PATCH allowlist.
4. **No secrets in governed objects** — teacher auth is an env-var *name*;
   rows and receipts are validated to carry no key material.
5. **Argv-only runner** — new profiles are `{bin, args[]}` with allowlisted
   bins; unsafe teacher tags / expert-k values flip `ready:false` exactly like
   the #273 command-safety gate (state 05 behavior extends, not changes).
6. **Honest states** — `harvest-only` is a first-class, receipt-proven mode,
   never a fake "training". Proxy-served replies are labeled as such in the UI.

## 5. The 16 states: preserved and extended

States 00–16 are untouched, and the additions are NOT a parallel system —
they read the exact same governed rows and derivers the 16 states prove:
- the flywheel strip on `/training` reports the model's evidence ladder
  verbatim from `deriveCustomModelsState` (the cockpit's own deriver, so the
  two surfaces can never disagree) and renders only once flywheel evidence
  exists — an empty workspace keeps the proven first-run journey untouched;
- "what serves right now" comes from `deriveProxyServingState`, which is
  `deriveEndpointVerification` over the api-registry row's stamped
  chat-completions `lastResponse` (state-12 semantics: the served tag must
  match the tuned tag; a base-model response demotes to `deployed` AND falls
  back to the local base — the model keeps answering, honestly labeled);
- the machine-tier plan derives from the run receipts' stamped preflight
  (state 04's evidence), replacing the hard "can't train here" dead end with
  a sized plan or harvest-only mode;
- the e2e probe (`e2e-distillation-flywheel-loop.mjs`) boots the SAME
  super-admin model-QA seed as the 16-state live capture and walks
  eligibility → configure → train → first invocation → deploy → proof loop →
  cockpit with real chat-completions bodies, asserting the flywheel rides
  the loop without disturbing it.

## 6. License + locality posture

Synthetic traces distilled from a frontier teacher and the students trained on
them are workspace-owned artifacts; provenance (teacher model, trace root hash,
generation) is stamped in every receipt so downstream license review is a
query, not an excavation. Local-first: the fallback route and all training run
on the user's machine; the teacher adapter is optional and disabled by default
until an env var is present.
