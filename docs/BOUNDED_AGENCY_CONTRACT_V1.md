# Bounded Agency Contract V1

A formal specification of the agreement between an **agent** and the **governed
workspace** it operates inside. This is not a new architecture — it is the
*name* for the contract Growthub Local already enforces at runtime, written down
so harnesses, auditors, and downstream implementers can target it directly.

> **Status.** Reference-implementation specification. Every clause below cites
> the shipped code that enforces it. Where a clause is only *partially* enforced
> today, the gap is named explicitly in [§7 Honest gaps](#7-honest-gaps) and the
> sprint that closes it is named in [§6 The seven sprints](#6-the-seven-sprints).
> Nothing in this document describes unbuilt behaviour as if it were live.

Read with:

- [`AGENTS.md`](../AGENTS.md) — the agent contract this spec formalizes
- [`docs/AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md`](./AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md) — the operating model
- [`docs/ROADMAP_IMPACT_ITEMS_V1.md`](./ROADMAP_IMPACT_ITEMS_V1.md) — the derivation-layer roadmap this builds on
- [`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/skills/governed-workspace-mutation/SKILL.md`](../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/skills/governed-workspace-mutation/SKILL.md) — the runtime-verified request/response card

---

## 1. The thesis

An agent has **bounded agency** when three independent properties hold at once:

```text
bounded agency  =  Scope  ∧  Boundary  ∧  Evidence
                   (who)     (how)        (proof)
                                   ↓
                              Continuity
                        (the next agent inherits all three)
```

- **Scope** — the agent is handed a machine-readable *assignment*, not a vague
  prompt: a goal, the routes it may call, the objects it may touch, the actions
  it may not take, and the evidence it must produce.
- **Boundary** — every state change flows through a small, fixed set of mutation
  calls that are *runtime-enforced*, not advisory. Unknown keys, oversized rows,
  credential-shaped fields, and unproven live-workflow mutations are rejected
  before any write.
- **Evidence** — every accepted *and* rejected mutation emits a canonical,
  secret-redacted, tamper-evident receipt into one stream. The workspace's truth
  is the accumulated evidence, not the agent's claim.
- **Continuity** — because scope, boundary, and evidence are all
  workspace-resident artifacts (config + source records), the *next* agent or
  human resumes from the identical state with no hidden handoff.

The contract is **two-sided and symmetric**: the human activation panel and the
agent assignment packet read the *same* derived state. Neither side has a
private channel.

---

## 2. The four normative clauses

A workspace is **Bounded-Agency-Contract V1 conformant** when all four clauses
are enforced. Each clause names the shipped surface that enforces it.

### Clause 1 — Scope (the assignment packet)

An agent MUST be addressable by a typed assignment packet derived from live
workspace state. Two packet shapes ship today, sharing one grammar:

- **Workspace condition packet** — `GET /api/workspace/swarm-condition?lensId=…`
  returns `{ kind, version, lensId, goal, currentState, complete, nextAction,
  blockedStep, prerequisite, availableTools, expectedEvidence, warnings }`.
  Read-only; derived by `deriveSwarmConditionPacket()` over any registered lens.
  Source: `apps/workspace/app/api/workspace/swarm-condition/route.js`,
  `apps/workspace/lib/workspace-activation.js`.
- **App assignment packet** — `GET /api/workspace/apps` returns, per app,
  `buildAppAssignmentPacket(...)`: `{ goal, currentState, blockers, nextAction,
  objectRefs[], allowedRoutes[], operatorOnlyRoutes[], forbiddenActions[],
  expectedEvidence[] }`. Source:
  `apps/workspace/lib/workspace-app-registry.js`.

The app packet is **truthful by construction** (OpenClaw pattern): every route
in `allowedRoutes` enforces scope at runtime, and routes the agent may *not* use
are named in `operatorOnlyRoutes` rather than silently omitted.

### Clause 2 — Boundary (two calls, runtime-enforced)

A governed workspace has **exactly two** canonical mutation calls; a conformant
harness MUST route every change through one of them and MUST NOT invent a third:

1. `PATCH /api/workspace` — config mutation, permanently allowlisted to
   `dashboards`, `widgetTypes`, `canvas`, `dataModel`.
2. `POST /api/workspace/sandbox-run` — all sandbox / agent-swarm execution
   (including draft proofs via `useDraft: true`).

Enforcement is layered and live, not documentary:

- Unknown top-level keys → **400** + `allowed[]`.
- The mutation policy (`apps/workspace/lib/workspace-patch-policy.js`) rejects
  oversized rows/node-configs, history blobs, credential-shaped fields, and
  direct live-workflow mutations → **422** + structured `violations[]`, each
  carrying a `repairPlan[]` so the agent self-corrects instead of looping.
- Live workflow state is **publish-owned**: `POST /api/workspace/workflow/publish`
  is the only draft→live transition, and it verifies the saved draft's passing
  test against server-owned run history (`draftSha256` lineage) — never against
  PATCH-writable attestation fields.
- App scope is enforced per call via the `x-growthub-app-scope` header →
  structured `AppScopeViolation` with `repairPlan[]`.
- Dry-run any patch with `POST /api/workspace/patch/preflight`, which runs the
  write path's exact merge step, so preflight can never disagree with PATCH.

The mutation protocol is fixed: **read → preflight → prove → publish → confirm**.

### Clause 3 — Evidence (the outcome receipt stream)

Every mutation lane — direct PATCH, preflight rejections, sandbox runs, workflow
publishes, helper applies — MUST emit one canonical receipt into the
`workspace:agent-outcomes` source-record stream. Source:
`apps/workspace/lib/workspace-outcome-receipts.js`; reader:
`GET /api/workspace/agent-outcomes`.

The receipt is the contract's atomic unit:

```jsonc
{
  "receiptId": "aor_…",
  "seq": 42,                      // server-side monotonic sequence
  "prevReceiptSha256": "…",       // hash chain: mutate/remove one → break all later links
  "kind": "agent-outcome | workflow-publish | helper-apply | …",
  "lane": "untrusted-direct | execution-proof | server-authoritative | governed-proposal",
  "outcomeStatus": "failed | blocked | published | …",
  "intent": "…", "actor": "…",
  "objectRefs": [ { "objectId": "…", "rowName": "…", "objectType": "…" } ],
  "changedFields": [ "…" ],
  "policyVerdict": { "ok": false, "violationCodes": [ "…" ] },
  "schemaVerdict": { "ok": true, "errorCount": 0 },
  "runId": "…", "sourceId": "…",
  "draftSha256": "…", "publishedSha256": "…", "version": "…", "appId": "…",
  "nextActions": [ "…" ],
  "rollbackRef": { "objectId": "…", "rowName": "…", "previousVersion": "…" },
  "createdAt": "…"
}
```

Invariants enforced *in the writer*, not trusted from callers: every string
field is secret-redacted and truncated; receipts carry summaries and references,
never raw payloads; append failures are **never fatal** to the mutation (a
read-only runtime simply does not accumulate a stream).

**Lanes are classified, not bypassed.** Direct PATCH is `untrusted-direct`,
sandbox-run is `execution-proof`, workflow/publish is `server-authoritative`,
helper/apply is `governed-proposal` (privileged: human-reviewed, server-built
graphs). The receipt records *which trust class* produced each change.

### Clause 4 — Continuity (the next agent inherits everything)

A conformant workspace MUST let a fresh session reconstruct full operating
context from resident artifacts alone. The receipt stream's
`GET /api/workspace/agent-outcomes` returns the bounded stream **plus** an
always-recomputed governance summary: blocked attempts, publishes, drafts
awaiting test, drafts tested-not-published, live rows with a failed last run,
live rows with no proof, helper applies. New sessions read the stream first,
cite `receiptId`s, and continue from `nextActions` / `rollbackRef`.

---

## 3. Conformance checklist

A harness or fork is **BAC-V1 conformant** when:

- [ ] It only writes through `PATCH /api/workspace` and `POST /api/workspace/sandbox-run` (+ `workflow/publish` for drafts).
- [ ] It preflights before PATCH and reads `appScopeVerdict` when app-scoped.
- [ ] It sends `x-growthub-app-scope` on every call when operating from an app assignment packet.
- [ ] It reads the assignment packet (`swarm-condition` or `apps`) before acting, and treats `forbiddenActions` / `operatorOnlyRoutes` as hard.
- [ ] On a `422`/`AppScopeViolation`, it consumes `repairPlan[]` rather than retrying verbatim.
- [ ] It begins every session by reading `agent-outcomes` and resuming from `nextActions` / `rollbackRef`.
- [ ] It never writes `growthub.config.json` / `growthub.source-records.json` directly, and never puts secrets in rows, prompts, or PATCH bodies (env/auth *reference names* only).

---

## 4. Reference-implementation surface map

| Contract clause | Read surface | Write/enforce surface | Source |
| --- | --- | --- | --- |
| Scope | `GET /api/workspace/swarm-condition`, `GET /api/workspace/apps` | header `x-growthub-app-scope` | `workspace-activation.js`, `workspace-app-registry.js` |
| Boundary | `POST /api/workspace/patch/preflight` | `PATCH /api/workspace`, `POST /api/workspace/sandbox-run`, `POST /api/workspace/workflow/publish` | `workspace-patch-policy.js` |
| Evidence | `GET /api/workspace/agent-outcomes` | append on every lane | `workspace-outcome-receipts.js` |
| Continuity | `GET /api/workspace/agent-outcomes` (stream + summary) | — | `agent-outcomes/route.js` |

SDK contracts: `@growthub/api-contract/workspace-patch`,
`@growthub/api-contract/workspace-outcome`,
`@growthub/api-contract/workspace-apps`.

---

## 5. The flywheel

The seven sprints in §6 are not independent features; they compound on the same
four clauses:

```text
Scope packets make agents safe to deploy (Sprint 2)
        ↓
Evidence stream is a fitness function → workflows self-optimize (Sprint 1)
        ↓
Denial events are an immune signal → the fleet defends itself (Sprint 3)
        ↓
A verifier collapses "agent said done" into observed truth (Sprint 6)
        ↓
A certified marketplace lets safe agents be shared (Sprint 4)
        ↓
Cloning replicates the whole governed system per client (Sprint 5)
        ↓
The contract itself becomes the published standard (Sprint 7)
```

Every new workspace feeds the receipt stream, which makes the optimizer smarter,
the immune signal sharper, and the marketplace more valuable. Growth is
compounding, not linear.

---

## 6. The seven sprints

Each sprint is stated as: **shipped substrate → the gap → the delta → grounding
→ value.** No sprint is a rewrite; each registers behaviour on an existing
extension point.

### Sprint 1 — Workspace Optimizer (evolutionary loop over receipts)

- **Shipped substrate.** The receipt stream is already a fitness signal: every
  receipt records `outcomeStatus`, `policyVerdict`, `runId`, `rollbackRef`,
  and the governance summary already counts blocked attempts, failed live rows,
  and unproven rows.
- **The gap.** Nothing *reads the history to propose improvements.* The loop is
  observe-only.
- **The delta.** A read-only deriver that scores the receipt window on a
  composite fitness function (fewer `blocked`/`failed`, faster proof, shrinking
  blockers), emits workflow-improvement proposals via `helper/query`, and
  sandbox-tests each against historical inputs before surfacing it for human
  apply. Mutation (proposed graph change), crossover (patterns from distinct
  successful runs), selection (promote only if fitness improves) — Holland's
  genetic algorithm applied to governed traces.
- **Grounding.** `workspace-outcome-receipts.js` (signal), `helper/query`
  (propose-only), `sandbox-run` `useDraft:true` (sandbox test). All writes stay
  on the existing apply lane.
- **Value.** Each workspace becomes self-improving; the longer it runs, the more
  optimized its workflow DNA — a moat no prompt-only tool can copy.

### Sprint 2 — aRBAC profiles (the assignment packet as a sellable standard)

- **Shipped substrate.** `buildAppAssignmentPacket` already emits
  `allowedRoutes` / `operatorOnlyRoutes` / `forbiddenActions` / `objectRefs` /
  `expectedEvidence`, runtime-enforced via `x-growthub-app-scope` →
  `AppScopeViolation`. This *is* agentic role-based access control.
- **The gap.** Profiles are per-app and hand-rolled; there is no library of
  reusable enterprise role templates, no compliance mapping, no certification
  check.
- **The delta.** A library of profile templates ("Finance Agent", "Support
  Agent", "Data Analyst Agent") expressed as registry-row presets, mapped to
  compliance controls (SOC 2, NIST 800-53, GDPR data minimization), plus a
  certification check (`growthub … cert`) that drives an agent through a profile
  and asserts it cannot cross the boundary.
- **Grounding.** `workspace-app-registry.js` (packet + scope enforcement),
  immune-system framing (self/non-self discrimination), object-capability
  security (Miller, 2006).
- **Value.** Moves the sale from "AI project" to "compliance-enabling
  infrastructure" — answering procurement's "can this agent touch my customer
  data?" with an enforced, certifiable yes/no.

### Sprint 3 — Workspace immune system (anomaly detection over denials)

- **Shipped substrate.** The boundary already *produces denial events*: `400`
  `allowed[]`, `422` `violations[]`, `AppScopeViolation`, and `blocked`
  receipts. Route-shopping is already closed.
- **The gap.** Denials are recorded but not *correlated*; nothing reacts to an
  abnormal pattern.
- **The delta.** A read-only threat deriver over the receipt window that flags
  abnormal patterns (a spike in PATCH denials, repeated sandbox failures on one
  app, scope-escalation attempts) and proposes a temporary tightened packet
  (quarantine) for human apply, writing a threat receipt that can seed a shared
  vaccine signal across forks. Danger Theory from artificial immune systems
  (Aickelin et al., 2003).
- **Grounding.** `agent-outcomes` summary + `policyVerdict.violationCodes`;
  packet tightening flows through the normal PATCH/registry lane.
- **Value.** Turns passive governance into active defense — an "AI SOC" add-on
  with clear recurring-revenue ROI.

### Sprint 4 — Receipt-verified agent marketplace

- **Shipped substrate.** The contract can already *certify* that an agent
  operated within scope and produced verifiable evidence (Clauses 1–3). A
  governed skill already has a fixed shape (`SKILL.md`, packet acceptance,
  receipts).
- **The gap.** No onboarding kit verifies a third-party agent against the
  contract before import.
- **The delta.** A marketplace onboarding kit that asserts a candidate agent
  accepts a standard scoped packet and writes conformant receipts, then imports
  it with scope auto-bounded. Analogous to an integrations marketplace, but with
  governance certification rather than a model card.
- **Grounding.** Clauses 1–3 + the skill primitive in
  `docs/SKILLS_MCP_DISCOVERY.md`.
- **Value.** Becomes the App Store for enterprise agentic work — certified
  agents enterprises will actually allow inside their infrastructure.

### Sprint 5 — Workspace cloning with scoped inheritance

- **Shipped substrate.** The workspace is already a forkable governed artifact
  (`.growthub-fork/`, config, Data Model, source records), and app scope already
  restricts an agent to a subset of objects/routes.
- **The gap.** There is no first-class "fork with a *narrower* scope mask"
  command, and no parent↔child receipt rollup.
- **The delta.** A `growthub workspace fork` that copies the registry, data
  model, and config, applies a scope mask (restricting routes, objects, app
  surfaces), and reports the child's receipts back to the parent for fleet-wide
  optimization (Sprint 1). Cellular division: the daughter gets the DNA but
  expresses only role-allowed genes.
- **Grounding.** fork lifecycle + `resolveAppScopeObjectIds`
  (`workspace-app-registry.js`) as the scope-mask primitive.
- **Value.** "AI-powered client portals" — each client a governed sub-workspace,
  managed centrally. A SaaS product, not a service engagement.

### Sprint 6 — Classical verifier for agent claims

- **Shipped substrate.** Receipts already carry `policyVerdict` and
  `schemaVerdict`, and publish already verifies `draftSha256` lineage against
  server-owned run history. The hash chain already makes the stream
  tamper-evident.
- **The gap.** No verifier re-examines a *completed* receipt against current
  workspace state to confirm the claim ("changed data matches claimed intent").
- **The delta.** A post-write deterministic checker (JSON-schema / rules-engine
  / Z3-style) that re-reads state after each receipt; on mismatch it writes a
  conflict receipt and flags the agent for repair — collapsing "agent said done"
  into a single observed truth. Verification-of-outputs is central to AI safety
  (Amodei et al., "Concrete Problems").
- **Grounding.** `policyVerdict`/`schemaVerdict` fields + `prevReceiptSha256`
  chain in `workspace-outcome-receipts.js`.
- **Value.** "Trust but verify" as a sellable AI-audit add-on for internal audit
  departments.

### Sprint 7 — Publish the Bounded Agency Contract as a standard *(this document is step one)*

- **Shipped substrate.** Clauses 1–4 are enforced today; this spec names them.
- **The gap.** The contract is implicit in code and `AGENTS.md`; it is not a
  citable public specification with a conformance suite.
- **The delta.** Promote this doc to a versioned public specification, add a
  conformance suite (extend `scripts/e2e-workspace-patch-policy-probe.mjs` and
  the unit policy tests into a published BAC-conformance probe), and make
  Growthub the reference implementation. Grounded in AI-safety, multi-agent
  systems, and cybernetics literature.
- **Grounding.** This document + the enforcement tests
  (`scripts/unit-workspace-patch-policy.test.mjs`,
  `scripts/e2e-workspace-patch-policy-probe.mjs`).
- **Value.** Owning the standard for safe AI agency makes Growthub the default
  infrastructure layer — the way HTTP and Kubernetes won, RFPs start specifying
  "must support a Bounded Agency Contract."

---

## 7. Honest gaps

This spec describes a reference implementation, not a finished standard. Known
gaps, stated plainly so no reader over-trusts the current build:

- **Tamper evidence ≠ cryptographic non-repudiation.** The receipt hash chain is
  a server-side monotonic sequence + `sha256(previous receipt)`. There is **no
  signing key and no TEE** in this runtime, so a holder of write access to the
  sidecar could rewrite the entire chain consistently. A signed/anchored
  receipt is named future work, not a current guarantee.
- **Scope enforcement is opt-in per call.** `x-growthub-app-scope` is honored
  when sent; a harness that never sends the header operates unscoped (still
  inside the global boundary, but not inside an app profile). Sprint 2's
  certification check is what would make a profile *mandatory* for a given agent.
- **Sprints 1, 3, and 6 are derivers/checkers that do not yet exist.** Their
  substrate (the receipt stream, the verdict fields) ships today; the deriver
  code does not. Do not represent the optimizer, immune system, or post-write
  verifier as live.
- **The conformance suite (Sprint 7) is not yet published.** The enforcement
  *tests* exist; a packaged, externally-runnable BAC-conformance probe does not.

When any gap above closes, update this section in the same change — do not stack
a corrective note on top of stale text (per `AGENTS.md` contribution rules).
