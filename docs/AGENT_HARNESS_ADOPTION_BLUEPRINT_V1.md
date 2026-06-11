# Agent Harness Adoption Blueprint V1

Third document in the harness-synthesis series. [`AGENT_HARNESS_PATTERN_SYNTHESIS_V1.md`](./AGENT_HARNESS_PATTERN_SYNTHESIS_V1.md) mapped fourteen patterns and ten opportunities (O1–O10); [`AGENT_HARNESS_RUNTIME_PROBE_V1.md`](./AGENT_HARNESS_RUNTIME_PROBE_V1.md) verified the mechanisms empirically. This document converges: it filters the ten opportunities down to the subset that is genuinely high-leverage, merges them into three kernels that compound with each other, and specifies the integration order. Everything not selected is explicitly dropped or deferred with a reason.

## 1. Selection Filter

An opportunity survives only if it passes all four tests:

1. **Substrate exists.** It builds on data or contracts already shipping (additive fields, no new write surfaces, PATCH allowlist untouched).
2. **It compounds.** Its output is another selected item's input — isolated wins are deferred no matter how attractive.
3. **It multiplies across consumers.** External harnesses, the native-intelligence layer, and human operators all benefit from the same artifact.
4. **It is grounded.** The mechanism was observed in a production harness (probe doc), not speculated.

Scorecard:

| Opportunity | Substrate | Compounds | Multiplies | Grounded | Verdict |
| --- | --- | --- | --- | --- | --- |
| O1 unified trace corpus | yes — receipts, traces, self-eval all ship | core of the loop | yes | partially (§10 of probe) | **Kernel 1** |
| O4 self-eval escalation | yes — `selfEval` + `trace.jsonl` | feeds K1 labels | yes | yes — Stop hook spec | **Kernel 1** |
| O6 wake envelopes + usage | yes — `ExecutionEvent` union | instruments K1 | yes | yes — task-notification shape | **Kernel 1** (instrumentation part) |
| O3 behavioral schemas | yes — manifests | feeds K1 via better plans; consumed by K2 evals | yes | yes — MCP instructions channel | **Kernel 2** |
| O2 trigger grammar + evals | yes — `SkillManifest` | eval results are K1 records | yes | yes — live trigger grammar observed | **Kernel 2** |
| O7 untrusted-import + monotonic policy | yes — import path, `policy.json` | consumes K1 events as taints | yes | yes — credential plane probes | **Kernel 3** |
| O10 measure tiers + taints | yes — sandbox rows, adapter contract | gated by K3, fed by K1 | yes | yes — `policy-limits` taint array | **Kernel 3** |
| O5 typed swarm roles | partial | depends on K3 allowlists | yes | yes | **Deferred** — adopt after K3 defines the allowlist vocabulary it would consume |
| O8 capability-resolution order | yes | no (standalone prose) | yes | yes | **Not a workstream** — single `AGENTS.md` paragraph; proposed text in §6 |
| O9 kit lifecycle hooks | yes | weak — no second consumer yet | partial | yes | **Partially merged** — the exit-code/evaluator contract moves into K1; declarative `kit.json` hooks wait for two concrete consumers, per the repo's additive-only discipline |

## 2. Kernel 1 — Decision Corpus (the flywheel)

**Thesis.** Every governed surface already emits structured decisions; none of them share a shape, so nothing downstream can learn from all of them. K1 is one normalized record plus two small event additions plus one exporter. It is listed first because K2 and K3 both write into it.

**2.1 The record.** A `governed-decision-record-v1` (JSONL, one per decision):

```jsonc
{
  "v": 1,
  "at": "<ISO-8601>",
  "surface": "helper | selfEval | pipeline | swarm | triggerEval",
  "context": { "forkId": "…", "runId": "…", "parentRef": "…" },
  "input": { "intent": "…", "digest": "…" },        // never raw credentials; digest for large payloads
  "decision": { "proposal": "…", "alternatives": 0 },
  "outcome": "applied | skipped | escalated | complete | error",
  "diagnosis": "…",                                  // present iff escalated/error
  "usage": { "tokens": 0, "toolUses": 0, "durationMs": 0 }   // optional, when the surface can measure
}
```

Source mapping — all four emitters exist today and need only a serializer:

| Emitter | Existing artifact | Label semantics |
| --- | --- | --- |
| Workspace helper | apply receipts (`applied[]` / `skipped[]`) | accept/reject preference pairs — DPO-shaped |
| Self-eval loop | `trace.jsonl::self_eval_recorded` | criteria-pass/fail supervision |
| Pipeline runs | stage-boundary traces (`PIPELINE_TRACE_CONVENTION_V1`) | intent → node-path supervision for the planner |
| Swarm agents | `swarm_agent_complete` events | per-agent cost + outcome (needs the usage stanza below) |

**2.2 Event additions** (additive to `@growthub/api-contract`, consumers ignore unknown fields per the existing NDJSON rule):

- `self_eval_escalated` — emitted when `maxRetries` exhausts or consecutive attempts show no criteria delta. Carries failing criteria and a diagnosis string. Ported design rules from the observed Stop hook: the evaluator is deterministic code outside the model; a recursion guard (`escalationActive` recorded in trace, mirroring `stop_hook_active`) bounds re-injection to one cycle; and the evaluator must verify its remediation is satisfiable before demanding it (the probe's "no remote → don't ask for a push" bail — the AWaC analog: never demand a hosted-authority action from a local-only fork).
- `usage` stanza on `swarm_agent_complete`: `{tokens?, toolUses?, durationMs?}` — directly copied from the observed subagent completion envelope. The probe's measured ~100:1 transcript-to-result ratio is why orchestrators get the stanza and the result, never the transcript.

**2.3 The exporter.** `growthub trace export --corpus` extends the shipping `growthub-local-intelligence-trace-v1` JSONL path: walk the four emitters, normalize to `governed-decision-record-v1`, write one corpus file. The CLI still trains nothing (invariant from `NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` §30 preserved): external QLoRA tooling consumes the corpus, weights come back via the existing `localModel` selection path.

**2.4 The loop, closed.** Better corpus → fine-tuned local planner → higher-quality proposals → higher applied-rate in receipts → richer accept-labels in the corpus. The applied-rate over time is itself the flywheel's health metric, readable from the receipts surface that already exists.

## 3. Kernel 2 — Behavioral Contracts (knowledge into the typed layer)

**Thesis.** Orchestration knowledge currently trapped in skill prose moves into the contracts every consumer reads. The production-harness precedent is load-bearing: MCP servers ship orchestration *instructions* at connection handshake, and the harness materially relies on them; tool contracts carry when-to-use/when-not-to-use, not just types.

**3.1 `SkillManifest` additions** (`packages/api-contract/src/skills.ts`, optional fields, version-sentinel safe):

```jsonc
"triggers": {
  "when": ["…"],          // positive trigger conditions
  "skipWhen": ["…"],      // explicit non-triggers
  "precheck": "…"          // optional cheap deterministic check (command or predicate)
}
```

The observed harness grammar includes the `precheck` move — "run this cheap check first; if it hits, skip" — which converts a fuzzy routing decision into a deterministic one wherever possible. The marketing-operator skill's intent-dispatch table is the first consumer.

**3.2 Manifest additions** (`CapabilityNode` / `CapabilityManifestEnvelope`):

```jsonc
"usageGuidance": {
  "whenToUse": "…",
  "whenNotToUse": "…",
  "orchestrationRules": ["…"],   // cross-node ordering, e.g. binding prerequisites
  "negativeExamples": ["…"]      // known-wrong shapes, e.g. the refs[].dataUrl pitfall
}
```

plus a registry-level `instructions` field on the envelope itself (the MCP connect-time channel, ported). Consumers: discovery hub hints, native-intelligence planner context, and any external harness reading the manifest — three consumers, one field.

**3.3 The eval.** `growthub skills eval-triggers`: replay a fixture set of task prompts against the catalog, score routing accuracy. Every eval run emits `surface: "triggerEval"` records into K1 — this is the compounding edge: K2's quality gate is K1's training data for the router the local planner becomes.

## 4. Kernel 3 — Graduated Trust (authority at OS depth)

**Thesis.** The probe demonstrated that production-grade agent trust is enforced below the agent, in a supervisor plane the agent cannot reach — and AWaC's authority boundary should adopt the same posture for imports and sandbox execution.

**4.1 Probed mechanisms to port** (all observed):

| Mechanism | Observation | AWaC port |
| --- | --- | --- |
| Credential-injecting loopback proxy | git remote at `127.0.0.1`, token never readable | sandbox rows resolve provider keys through a local resolver process, never into agent-readable env |
| Per-resource authorization at the proxy | out-of-scope repo → structured `repository not authorized` error | sandbox network policy returns typed deny reasons, so agents report policy instead of retrying |
| Secrets by file descriptor | fd-number env vars, values never in `env` | helper/adapter secret handoff via fd or socket, not env |
| Supervisor-plane signing | local commit objects are *unsigned* (`%G?` = N) yet verify as signed upstream — signing happens between container and host | fork-authority attestations are signed only in the CLI authority layer; agent-executable helpers can request but never hold signing capability |
| Policy taints | `compliance_taints[]` array in the layered policy stack | see 4.3 |

The supervisor-signing observation is the keystone: **the agent cannot self-attest**. Whatever an agent produces becomes trusted only when a deterministic layer above it signs off. AWaC already has the signing layer (ed25519 fork authority); K3's job is to make "the agent never holds the pen" an explicit invariant of the adapter contract.

**4.2 Import boundary** (O7): imported repos/skills/kits get `origin: "external"` markers in `fork.json`; harnesses rank externally-originated agent-facing files below the root contract; and a monotonicity invariant enforced at `growthub kit validate` / fork-register time: imported content can never widen `policy.json` (flip `autoApprove`, extend the PATCH allowlist, raise a tier). This is the supply-chain prompt-injection answer, enforced deterministically rather than by agent vigilance.

**4.3 Tiers and taints** (O10): the sandbox-environment row gains a trust tier that parameterizes its `toolIntents` allowlist — same local model, different measures per tier, mirroring the same-weights-different-measures tiering observed at the model-product level. Taints make the tier dynamic: K1 events accumulate into a per-row `taints[]` (e.g. `external-origin-read`, `self_eval_escalated` streak), and taints can only *downgrade* a tier within a run — never upgrade. Tier restoration is an explicit human action through the existing apply lane, which keeps the monotonicity invariant intact end-to-end.

## 5. Composition and Sequencing

```text
            K2 Behavioral Contracts
            (triggers, usageGuidance)
               │ eval records            ┌────────────────────────┐
               ▼                         │ external QLoRA tooling │
   K1 Decision Corpus ── export ───────► │ (outside the CLI)      │
   (records, escalation, usage)          └──────────┬─────────────┘
               │ taint events                       │ weights
               ▼                                    ▼
            K3 Graduated Trust            localModel selection
            (origin, monotonic            (existing path)
             policy, tiers)                         │
                                                    ▼
                                      better planner → better proposals
                                            → richer K1 receipts  ⟲
```

Build order is forced by the data dependencies, not preference:

1. **K1 first** — schema and exporter only; nothing else can compound until records exist. Touches: `packages/api-contract/src/events.ts` (two additions), a serializer in the trace exporter, `templates/self-eval.md` escalation note.
2. **K2 second** — contract fields plus the eval command; its eval immediately starts writing K1 records. Touches: `skills.ts`, `capabilities.ts`/manifest types, one CLI subcommand, `scripts/export-worker-kit.mjs --qa` gate extension.
3. **K3 third** — enforcement consumes K1's event stream for taints and K2's manifests for allowlist vocabulary. Touches: import path markers, `kit validate` monotonicity check, adapter contract tier field.

Each step is independently shippable and additive; no step blocks a release.

## 6. Dropped and Deferred (with reasons)

- **O5 typed swarm roles** — deferred, not dropped: the per-role allowlist vocabulary should be defined once, by K3, and then consumed by the swarm contract; building it first would invent a second vocabulary. The usage stanza (its instrumentation half) ships in K1.
- **O8 resolution order** — not a workstream. Proposed `AGENTS.md` paragraph, verbatim, for maintainer adoption: *"Before writing ad-hoc code, resolve capabilities in order: (1) skill catalog, (2) worker-kit registry, (3) kit helpers, (4) CMS capability manifest, (5) ad-hoc last. Do not report a capability as missing until the first four have been checked."*
- **O9 kit lifecycle hooks** — the valuable part (deterministic evaluator, exit-code contract, fail-open entry / enforcing exit, satisfiability check) ships inside K1's escalation design. Declarative `kit.json` hook arrays wait until at least two concrete consumers exist, matching how this repo already gates contract growth.
- **Per-task model/effort profiles** (P12 remainder) — a single optional `effort` field on the execution adapter row can ride along with K3's tier field; everything beyond that is premature until the K1 corpus shows where routing actually matters.

## 7. Invariants

Unchanged from the prior two documents, restated because all three kernels touch their edges: PATCH allowlist is the ceiling (K1–K3 add zero write surfaces); `@growthub/api-contract` changes are additive with unknown-field tolerance; the CLI never trains models; hosted authority stays C-tier — every kernel is a local-artifact extension; credentials never enter prompts, records, or the corpus (digests only).

## 8. Validation

Docs-only at this stage: `git diff --check` plus section readback. When K1 lands in code: corpus exporter gets a fixture-based round-trip test (emitters → records → parse); `self_eval_escalated` joins the deterministic vitest suites that already cover the self-eval loop; version bumps follow the `cli` + `create-growthub-local` pinning rule, semver read from the branch, never from memory.
