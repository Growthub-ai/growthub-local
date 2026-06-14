# Governed Cockpit Entry-Point Pattern V1

The agent swarm cockpit (`0.14.1`) is not just a feature — it is the **highest-order
worked proof** of a repeatable canonical entry path: the path by which a new
product reality is uncovered, proposed, hardened, executed, and made
agent-operable **without adding a single new API, widening the PATCH allowlist,
or introducing a new schema**.

This document extracts that path from the shipped corpus and freezes it as the
canonical pattern every future feature branch follows. It is the operational
continuation of [`CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`](./CAUSATION_ITT_ELIGIBILITY_DRIVERS.md)
and the structural sibling of [`SWARM_RUN_CONTRACT_V1.md`](./SWARM_RUN_CONTRACT_V1.md).

The product-taste claim is concrete: **a new capability is allowed to exist only
as a projection of state that already exists in the contract.** Compute happens
once, on write, behind a named lane; everything a user or agent reads afterward
is a pure derivation. That is where the latency, token, and compute-decomposition
wins come from — they are not optimizations bolted on later, they are the shape.

---

## 0. The empirical corpus (what already shipped)

Two frozen contracts are the entire substrate. No new feature may add a third.

### 0.1 The four lanes

Every mutation in the workspace is classified into exactly one named lane — none
is an unlabelled bypass (`packages/api-contract/src/workspace-outcome.ts:56-61`,
restated in `AGENTS.md:165`):

| Lane | Route | Trust class |
| --- | --- | --- |
| `untrusted-direct` | `PATCH /api/workspace` (+ preflight) | Full policy firewall |
| `execution-proof` | `POST /api/workspace/sandbox-run` | Produces run lineage |
| `server-authoritative` | `POST /api/workspace/workflow/publish` | Owns draft → live |
| `governed-proposal` | `POST /api/workspace/helper/apply` | Human-reviewed, server-built payloads |

### 0.2 The one receipt

Every lane emits the **same** canonical receipt into the single source-record
stream `workspace:agent-outcomes` — no new persistence backend
(`packages/api-contract/src/workspace-outcome.ts:75-136`, runtime
`lib/workspace-outcome-receipts.js`, read endpoint
`app/api/workspace/agent-outcomes/route.js`):

```ts
{ receiptId, kind, lane, intent?, actor?, objectRefs?, changedFields?,
  policyVerdict?, schemaVerdict?, runId?, sourceId?, draftSha256?,
  publishedSha256?, version?, outcomeStatus, summary, nextActions?,
  rollbackRef?, appId?, seq?, prevReceiptSha256?, createdAt }
```

The stream is hash-chained (`prevReceiptSha256`) and capped at a rolling window
(200). `GET /api/workspace/agent-outcomes` returns the stream **plus** an
always-recomputable `WorkspaceGovernanceSummary` — the cockpit data model.

**These two artifacts are the empirical corpus.** Everything below is leverage
over them.

---

## 1. The canonical entry-point spine

The swarm feature followed this exact spine (`SWARM_RUN_CONTRACT_V1.md:11-19`).
Generalized, it is the path every new capability takes:

```
1. helper proposal        POST /api/workspace/helper/query   (propose-only, never mutates)
2. reviewed apply         POST /api/workspace/helper/apply    (special lane routed inside apply)
3. governed row           well-known object in dataModel      (re-seeded, no new schema)
4. execution-proof        POST /api/workspace/sandbox-run     (the ONLY executor)
5. receipt                workspace:agent-outcomes stream     (the ONLY persistence)
6. pure projection        deriveX(record|stream) → view-model (no React/fetch/writes)
7. cockpit                a view INSIDE the helper sidecar     (no new route/modal/grammar)
```

The two non-obvious moves are what keep the surface frozen:

- **Stage 2 — special lanes route *inside* `helper/apply`, not as new PATCH
  fields.** The apply route already partitions proposals into three independent
  lanes — `resolver.create` (→ `server-file`), swarm proposals (→ existing
  `dataModel`), and plain config — so the allowlist
  (`dashboards | widgetTypes | canvas | dataModel`) never widens
  (`app/api/workspace/helper/apply/route.js:259-311`). This is the
  **`resolver.create` precedent**. A new capability adds a new proposal *type*,
  never a new PATCH *field*.

- **Stage 6 — the only seam between state and UI is a pure deriver.** `deriveSwarmRunProjection`
  (`lib/orchestration-run-console.js`) and `deriveWorkspaceActivationState`
  (`lib/workspace-activation.js`) take config + source records and emit a
  low-entropy view-model with no side effects. This is Causation ITT: *state
  becomes eligibility, eligibility becomes guidance, guidance becomes action,
  action becomes evidence.*

---

## 2. The four limited surfaces

A new capability enters through **exactly these four surfaces and no others.**
Each one already has a proven host in the swarm feature; the new feature mirrors
the same primitive at the same altitude.

### 2.1 A lens button (below the open-widget helper)

The "Ask helper" pill lives in the rail tabbar
(`app/workspace-rail.jsx:1813`, class `workspace-rail-helper-pill`). A new
capability adds **one sibling pill below it** — same pill grammar, an `aria-label`,
a lucide icon at 13px, `onClick` that opens the sidecar on the new view. No new
container, no new layout. Lens-body actions reuse `dm-btn-ghost`.

### 2.2 A slash command

The command registry is a single array `HELPER_COMMANDS`
(`app/data-model/components/helper-commands.js:18`). Each entry declares
`{ name, label, description, scope, mutates, promptTemplate?, view?, intent? }`.
A new capability appends **one row**:

- read-only surface → `mutates: false` + `view: "<new-view>"` (switches the sidecar, writes nothing);
- proposal surface → `mutates: true` + `intent: "<new-intent>"` (seeds a governed proposal that still requires explicit review + apply).

Slash commands **never** PATCH config and **never** call `sandbox-run` directly
(`SWARM_RUN_CONTRACT_V1.md:228-230`).

### 2.3 A sidecar config (a new `activeView`)

The cockpit is not a route — it is an `activeView` value inside `HelperSidecar`
(`"chat" | "swarm-list" | "swarm-detail" | "tool-output"`,
`HelperSidecar.jsx:379`). A new capability adds **one new `activeView`
string** and mounts its cockpit component in the same body switch the swarm
cockpit uses (`HelperSidecar.jsx:1072-1087`). The "sidecar config" is the
per-view wiring — title, back behavior, expand frame — reusing
`SidecarExpandView`. No second sidecar framework.

### 2.4 An eligibility / pure-causation-driver cockpit

The cockpit component mirrors `SwarmRunCockpit.jsx` exactly: it reads
config + the receipt stream, runs a **pure deriver**, and composes only the
existing CSS primitives (`globals.css`):

- `dm-helper-toolcall*` — the accordion card grammar
- `dm-run-console__tree-dot[data-variant=ok|fail|active|pending|canceled]` — the status dots
- `dm-btn-ghost` — actions
- `dm-field-label` / `dm-field-hint` / `dm-run-console__hint` — labels
- `dm-swarm-cockpit` / `dm-swarm-card` — the cockpit shell

Receipts route to the cockpit through the existing `ToolCallCard` "Open" button
and `resolveArtifactTarget` (`HelperSidecar.jsx:201`), which already keys on
`artifact.surface`. A new surface value reuses this routing verbatim.

Eligibility is a deterministic function over evidence, never a hidden UI flag —
the precedent is `deriveSwarmWorkflowExecutionEligibility`
(`lib/workspace-swarm-proposal.js:194-228`), which returns
`{ ready, status, missing, guidance }` and blocks unrunnable rows *before* a
failed execution.

---

## 3. Worked example — the Governance Causation Cockpit

This is the next capability the pattern unlocks, and it is the proof that the
pattern adds **zero new API and zero new schema**: every byte it needs is already
in the receipt stream.

### 3.1 The gap (honestly classified)

- **Already exists — enforcement.** Route-shopping is *closed at the gate*: the
  app-scope check in `sandbox-run/route.js:815` and `workflow/publish/route.js:111`
  prevents an app from escaping its scope by hopping routes ("route-shopping
  closed").
- **Already exists — counting.** The governance summary counts `blockedAttempts`
  (`agent-outcomes/route.js`).
- **Missing — detection / observability.** Nothing correlates a *blocked
  `untrusted-direct` receipt* with a *subsequent `execution-proof` attempt by the
  same `actor`*. The shipped definition of route-shopping —
  **"a blocked untrusted-direct receipt followed by an execution-proof attempt by
  the same actor"** — is directly detectable from the stream, because every
  receipt already carries `lane`, `actor`, `outcomeStatus`, and `createdAt`. No
  detector and no cockpit surface exist for it.

### 3.2 The extension (pattern-conformant)

| Spine stage | This feature |
| --- | --- |
| 1 proposal | none — read-only governance surface |
| 6 pure deriver | **new** `lib/governance-causation-console.js → deriveRouteShoppingSignals(receipts)` — pure, no React/fetch/writes; mirrors `orchestration-run-console.js` |
| 7 cockpit | **new** `GovernanceCausationCockpit.jsx` — mirrors `SwarmRunCockpit.jsx`, composes the same `dm-*` primitives |

The deriver scans the newest-first stream the route already returns, groups by
`actor`, and emits a signal when a `lane: "untrusted-direct"` /
`outcomeStatus: "blocked"` receipt is followed (within the actor's timeline) by a
`lane: "execution-proof"` attempt:

```text
routeShopSignals: [{
  actor,
  blockedReceiptId,            // the untrusted-direct rejection
  followOnReceiptId,           // the execution-proof attempt by same actor
  objectRefs,                  // what they were reaching for
  elapsedMs,                   // blocked.createdAt → follow-on.createdAt
  policyVerdict,               // why the direct lane refused
  severity                     // derived from proximity + repeat count
}]
```

The four surfaces from §2:

1. **Lens button** — a "Governance" pill below "Ask helper" in `workspace-rail.jsx`.
2. **Slash command** — `/governance` appended to `HELPER_COMMANDS`,
   `mutates: false`, `view: "governance"`.
3. **Sidecar config** — a new `activeView: "governance"` in `HelperSidecar.jsx`,
   mounting the cockpit in the same body switch.
4. **Cockpit** — `GovernanceCausationCockpit.jsx`, rendering the signals as
   `dm-helper-toolcall` cards with `dm-run-console__tree-dot[data-variant=fail]`
   for confirmed route-shop pairs, each card "Open"-routing to the two receipts.

**What it does not add:** no new route (the data is `GET /api/workspace/agent-outcomes`,
unchanged), no new schema (`WorkspaceGovernanceSummary` *may* gain an additive,
optional `routeShopSignals?` field under the existing version-`1` additive rule
at `workspace-outcome.ts:206`, or stay UI-only), no new PATCH field, no new
storage. The contract version literal stays `1`.

This is the template. The next feature after this one — a cost-decomposition
cockpit over per-receipt `runId` token telemetry, a drift cockpit over
`draftSha256` vs `publishedSha256` — is the *same four surfaces over the same
stream with a different pure deriver.*

---

## 4. The repeatable background-agent prompt

This is the canonical entry prompt. A background agent given this prompt, plus a
one-line capability description, produces a pattern-conformant feature branch.
Paste verbatim; fill only the bracketed line.

```text
ROLE: You are extending the Growthub governed workspace through the canonical
Governed Cockpit Entry-Point Pattern (docs/GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md).

CAPABILITY: [one sentence — the new product reality, as a projection of existing state]

HARD INVARIANTS (a violation fails review):
- No new API route. No new PATCH allowlist field (dashboards|widgetTypes|canvas|dataModel).
- No new schema or storage backend. No new persistence beyond workspace:agent-outcomes
  and growthub.source-records.json.
- The api-contract version literals stay at their current value; only additive,
  optional fields are allowed, and only if a UI-only derivation cannot do the job.
- No secrets in proposals, rows, prompts, source records, or browser state — env-ref slugs only.
- No fake telemetry: unreported metrics render "—"/null, never 0 or an estimate.

METHOD (in order):
1. Identify the SOURCE STATE this capability is a projection of. If it is not
   already in the config or the receipt stream, stop and report — the capability
   is not yet pattern-eligible.
2. Write the PURE DERIVER first (lib/<name>-console.js): a function over
   {config, source records / receipt stream} returning a view-model. No React,
   no fetch, no writes, no localStorage, no CSS. Add unit tests for the deriver.
3. If the capability mutates, add ONE proposal type routed inside helper/apply
   (the resolver.create / swarm.run.propose precedent) targeting an EXISTING
   patch field or the server-file lane. Reuse a well-known re-seeded object id;
   do not invent an object type.
4. Add the FOUR surfaces only: (a) one sibling pill below the Ask-helper pill in
   workspace-rail.jsx; (b) one HELPER_COMMANDS row; (c) one HelperSidecar
   activeView mounting the cockpit; (d) one cockpit component mirroring
   SwarmRunCockpit.jsx, composing only existing dm-* primitives from globals.css.
5. Gate the surface on a pure eligibility driver (deriveSwarmWorkflowExecutionEligibility
   precedent): show the next eligible action, never a hidden flag.

OUTPUT: the eight-section investigative format (Current State with file:line
citations → Missing Extension → Strategic Direction → Phased Implementation →
Exact File Edits → Runtime Implications → Validation Requirements → Anti-Patterns),
then the diff. Cite a real file:line for every "already exists" claim.

DEFINITION OF DONE: helper query (if any) returns the proposal without mutating;
the deriver is pure and unit-tested; the cockpit renders from real state with
truthful telemetry; the four surfaces wire to the same view; no invariant above
is touched; typecheck + lint + tests green.
```

---

## 5. Why this is the efficiency story (first principles)

The pattern *is* the latency / token / compute-decomposition win — these are
properties of the shape, not later optimizations:

- **Compute decomposition.** Work happens once, on write, behind one named lane,
  and is stamped into one receipt. Reads are pure derivations with no I/O. The
  cockpit cost is `O(window)` over a 200-cap stream, recomputed locally — never a
  new query, never a new table scan.
- **Latency.** No new route means no new round trip; cockpits read the one
  endpoint that already exists. A new capability ships as a deriver + a view, not
  a backend.
- **Token efficiency.** Agents continue from `nextActions` / `rollbackRef` /
  `repairPlan[]` on a receipt instead of re-deriving context from logs
  (`AGENTS.md:165`). The receipt stream is the shared memory; the next agent
  reads it and cites `receiptId` rather than re-reasoning. Route-shopping
  detection turns *retrying variations* (the expensive failure mode) into a
  single observable signal.
- **Agent effectiveness.** Four named lanes collapse routing ambiguity: an agent
  that is blocked on `untrusted-direct` reads the verdict and follows the
  `governed-proposal` lane instead of shopping — and if it shops anyway, the
  causation cockpit makes it visible. Eligibility drivers collapse "what can I do
  next" to a deterministic answer.

---

## 6. Invariants (what must never happen)

- No new API route; no new top-level PATCH allowlist field.
- No new schema, object type, persistence backend, or runtime layer.
- No second sidecar framework, second source picker, or second data runtime.
- No new visual grammar — only the `dm-*` primitives in `globals.css`.
- No execution outside `POST /api/workspace/sandbox-run`; no mutation outside
  `helper/apply` → `writeWorkspaceConfig` (gated by `validateWorkspaceConfig`).
- No estimated or fabricated telemetry; unreported = `—`/null.
- No claims of completion without a persisted receipt.
- The deriver is pure; the cockpit's only writes go through existing governed
  surfaces.

---

## 7. Source anchors

| Concern | Source |
| --- | --- |
| Four lanes | `packages/api-contract/src/workspace-outcome.ts:56-61`; `AGENTS.md:165` |
| Receipt shape | `packages/api-contract/src/workspace-outcome.ts:75-136` |
| Receipt runtime / stream | `apps/workspace/lib/workspace-outcome-receipts.js` |
| Governance summary / read endpoint | `apps/workspace/app/api/workspace/agent-outcomes/route.js` |
| Route-shopping closed (enforcement) | `sandbox-run/route.js:815`; `workflow/publish/route.js:111` |
| Apply lane partition (resolver/swarm/config) | `apps/workspace/app/api/workspace/helper/apply/route.js:259-311` |
| Swarm spine | `docs/SWARM_RUN_CONTRACT_V1.md:11-19` |
| Pure run projection | `apps/workspace/lib/orchestration-run-console.js` |
| Eligibility driver precedent | `apps/workspace/lib/workspace-swarm-proposal.js:194-228` |
| Activation / lens derivers | `apps/workspace/lib/workspace-activation.js` |
| Slash registry | `apps/workspace/app/data-model/components/helper-commands.js:18` |
| Sidecar views | `apps/workspace/app/data-model/components/HelperSidecar.jsx:379,1072-1087` |
| Swarm cockpit (mirror target) | `apps/workspace/app/data-model/components/SwarmRunCockpit.jsx` |
| Lens helper pill (button anchor) | `apps/workspace/app/workspace-rail.jsx:1813` |
| CSS primitives | `apps/workspace/app/globals.css` (`dm-helper-toolcall*`, `dm-run-console__tree-dot`, `dm-btn-ghost`, `dm-field-label/-hint`, `dm-swarm-cockpit/-card`) |
| Causation ITT theory | `docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md` |

## Release Rule

This document describes a pattern. It adds no runtime layer, no API, no schema,
and no competing workflow. Any feature claiming this pattern must preserve every
invariant in §6 and cite a real source anchor for every "already exists" claim.
