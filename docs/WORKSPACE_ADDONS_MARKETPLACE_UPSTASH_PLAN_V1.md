# Workspace Add-ons Marketplace + Upstash Provider — Completion Plan (V1)

> **Status: production-shaped, offline-verified; live external smoke is the
> remaining merge gate.** The full loop is built — provider probe → deterministic
> per-workflow schedule install → serverless thin-adapter endpoint → signed
> callback sync to the owning row → canvas capability gate — with schedule state
> owned by the workflow row and the orchestration trigger node synced in the same
> atomic write. Kit `next build` + the unit suite are green. The loop is **not**
> considered fully closed until a live one-minute QStash run is captured (see
> **§9 Live smoke — merge gate**). Foundation originally from PR
> [#257](https://github.com/Growthub-ai/growthub-local/pull/257)
> (`codex/workspace-marketplace-upstash`).
> **Scope:** `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`
> **Principle (non-negotiable):** Add-ons are **governed capability installation inside the existing
> workspace universe** — no separate plugin DB, marketplace runtime, workflow engine, scheduler
> abstraction, or install state. Everything lands as API Registry rows, sandbox/workflow rows,
> workspace config, and outcome receipts.

---

## 1. Where #257 actually stands (verified against the head commit)

The PR is correctly self-described as a **foundation checkpoint (~60%)**. Reading the head
(`58ce2d3`) against `main`, the foundation is real and the universe-shape is right. To avoid
re-doing work, this plan is calibrated to what is **already present** vs. what is **genuinely
missing**.

### Already present (do NOT rebuild)

| Capability | Evidence in head |
|---|---|
| Provider/product catalog + region model | `lib/workspace-add-ons.js` → `MARKETPLACE_PROVIDERS`, `UPSTASH_PRODUCTS`, `UPSTASH_REGION_OPTIONS` |
| API Registry row normalization for add-ons | `apiRegistryColumns()`, `makeUpstashProductRow()`, `withUpstashProductRegistry()` |
| **Real product credential probe** (not inferred) | `app/api/workspace/add-ons/upstash/sync/route.js` and `.../providers/[providerId]/products/sync/route.js` already run a server-side `probeJsonPaths()` (read-only `GET` with `Authorization: Bearer <token>`) against `/v2/schedules`, `/ping`, `/info`, `/stats` and only write `syncStatus=verified` on HTTP-OK |
| Receipt-oriented install | every sync route calls `appendOutcomeReceipt({ lane:"server-authoritative", ... })` on both blocked and published paths |
| Canvas reads installed add-ons | `WorkflowSurface.jsx` → `deriveWorkspaceAddOnsState()`, `WorkflowAddOnChooser`, `useInstalledQstashWorkflowAddOn()` gated on `addOnsState.qstashWorkflow` |
| Verified-only gating helper | `findInstalledWorkspaceAddOns()` requires `syncStatus==="verified" && syncProof && syncCheckedAt` |

So review-comment §2 ("prove credentials, not infer readiness") is **already largely satisfied at
the product level**. The remaining work is the *live execution loop*, not the readiness probe.

### Genuinely missing (this plan's targets)

1. **Provider-level "verified" is written without a live probe.** `app/api/workspace/add-ons/upstash/provider/sync/route.js` marks the provider row `syncStatus=verified` purely from env *presence* (`configuredProviderProducts()` = env vars set). No Upstash Developer API call is made. → over-claims verification.
2. **Settings prop mismatch — real bug.** `app/settings/add-ons/page.jsx` passes `envSignals.upstashProducts`, but `app/settings/add-ons/add-ons-client.jsx` normalizes `envSignals.providerProductReadiness`. The client always reads `{}`, so per-product readiness never drives install state. (Flagged in review §2.)
3. **No QStash *schedule* creation.** Only a read probe of `/v2/schedules` exists. There is no deterministic `Upstash-Schedule-Id` create/update — i.e. no actual scheduler capability installed.
4. **No serverless workflow endpoint.** No `@upstash/workflow` `serve()` adapter; nothing executes the existing orchestration-config loop in a serverless lane.
5. **No callback / failure-callback routes.** Nothing receives QStash's response and writes it back. `lastResponse` is a hard-coded placeholder string in `makeUpstashProductRow()` (lines ~275–277).
6. **Canvas binds on read-probe, not schedule-capability proof.** `useInstalledQstashWorkflowAddOn()` sets `runLocality=serverless` + `schedulerRegistryId` once the row is "verified" by a *read* probe — but a verified read probe ≠ an installed schedule. (Review §6 wants a schedule capability proof.)
7. **No dependencies.** `@upstash/qstash` / `@upstash/workflow` are not in the kit `package.json`.
8. **No tests, no green build output.** All six PR checkboxes around QA/build are open.

---

## 2. Target end-to-end loop (the "closed loop")

```txt
provider account/env refs
  → product readiness PROOF (live probe)            [present for products; add for provider]
  → API Registry capability row (governed)          [present]
  → deterministic QStash schedule create/update      [NEW — §4.2]
  → workflow row bound to verified scheduler row      [tighten gate — §4.5]
  → serverless workflow endpoint runs existing
    orchestration-config loop as durable steps        [NEW — §4.3]
  → QStash callback / failure callback (signed)       [NEW — §4.4]
  → last response synchronized into workspace config  [NEW — §4.4]
  → outcome receipt (lane=server-authoritative)       [extend — §4.4]
  → MCP / lens / readiness can inspect it             [free, once rows carry proof]
```

Closure point = **§4.4**. Without the callback writing real proof into workspace config, QStash can
run but the workspace never learns the result.

---

## 3. Two auth lanes (must stay separate — review §1)

| Lane | Purpose | Auth | Representation |
|---|---|---|---|
| **Provider/account management** | Upstash account/resource management (Developer API) | HTTP Basic `EMAIL:API_KEY`; *native Upstash accounts only* | Provider row = "verified account *path*" only. Does **not** imply products installed. |
| **Runtime product** | QStash / Redis / Vector / Search runtime calls | Per-product URL + bearer token env refs | Each product = its own API Registry row + its own live readiness proof. |

**Rule:** a verified provider row never auto-verifies products; each product still proves itself.
This is already the catalog's intent (`UPSTASH_PRODUCTS[].requiredEnv`, per-product `probe`) — §4.1
just makes the provider route honest about it.

**Secrets rule (applies everywhere below):** never write `QSTASH_TOKEN`, signing keys, REST tokens,
or any secret value into workspace config, API Registry rows, receipts, or HTTP responses. Persist
only non-secret evidence: `status`, `syncStatus`, `syncProof`, `lastTested`, `missingEnv`,
`scheduleId`, timestamps, body *previews*. Reuse the existing `redactSecrets()` path that
`appendOutcomeReceipt()` already applies.

---

## 4. Work breakdown (additive, phased)

### Phase 0 — Foundation correctness & deps (small, unblocks everything)

**0.1 Fix the settings prop mismatch (bug).**
- `app/settings/add-ons/page.jsx`: rename the emitted signal to match the consumer, i.e. provide
  `providerProductReadiness` keyed by provider, e.g.
  `providerProductReadiness: { upstash: listUpstashProductReadiness(process.env) }`
  (or generalize to all `MARKETPLACE_PROVIDERS` via `listProviderProductReadiness`).
- `app/settings/add-ons/add-ons-client.jsx`: keep consuming
  `envSignals.providerProductReadiness`; confirm `WorkspaceAddOnsMarketplace.jsx` reads the same
  shape. Add a unit test (§5) asserting the page-emitted key equals the client-consumed key.

**0.2 Add dependencies.**
- Add to kit `package.json`: `@upstash/qstash` (Receiver for signature verification, schedules
  client) and `@upstash/workflow` (`serve` for Next.js). Pin to current major.
- Keep the existing fallback-by-`fetch` probe style for read probes (no new dep needed there);
  use the SDK only where it earns its keep (signature `Receiver`, schedule idempotency helpers).

**0.3 Centralize env resolution through the canonical entry.**
- Route all token reads through the kit's existing canonical resolver
  (`readServerSecret()` / `envKeyCandidates()` in `app/api/workspace/sandbox-run/route.js` and
  `lib/orchestration-graph-runner.js`) instead of ad-hoc `process.env[...]` in add-on routes, so
  "the canonical entry returns the stored env tokens for the run" is literally true (PR checkbox 1).
  Extract that resolver into a shared `lib/` helper if it is currently route-local.

### Phase 1 — Provider verification honesty (review §1)

**1.1** `app/api/workspace/add-ons/upstash/provider/sync/route.js`: before writing
`syncStatus=verified`, perform a real provider-lane probe.
- If `UPSTASH_EMAIL` + `UPSTASH_API_KEY` are present, do a single read-only Developer API call
  (HTTP Basic) — e.g. `GET https://api.upstash.com/v2/redis/databases` — and store only
  `proof`/`lastTested`. If the Developer API is unavailable (third-party account), fall back to
  marking the provider `account-linked` (a distinct, weaker status) rather than `verified`, and
  surface that in the receipt `nextActions`.
- Preserve current behavior of listing `configuredProviderProducts()` for the UI, but the
  provider's `syncStatus` must reflect the probe, not mere env presence.

### Phase 2 — QStash schedule as an installed capability (review §3) — **NEW**

**2.1 Deterministic schedule identity.** Derive a stable id for idempotent create/update.
Canonical format is hyphen-delimited and slug-safe (`/^[A-Za-z0-9_-]+$/`) — QStash custom schedule
ids reject `:`; this one format is shared across code/tests/docs/live:
```txt
growthub-{providerId}-{workspaceId}-{sandboxObjectId}-{sandboxRowId}-{workflowVersion}
```
Add a pure helper `deriveQstashScheduleId(...)` to `lib/workspace-add-ons.js` (unit-tested for
idempotency — same inputs → same id).

**2.2 Schedule create/update route.** Add
`app/api/workspace/add-ons/upstash/qstash/schedule/route.js` (`POST`):
- Resolve `QSTASH_TOKEN` via the canonical entry (§0.3); 422 with `missingEnv` if absent.
- `POST /v2/schedules/{destination}` to QStash with headers:
  `Authorization: Bearer <token>`, `Upstash-Cron: <cron>`,
  `Upstash-Schedule-Id: <deriveQstashScheduleId(...)>`,
  `Upstash-Callback: <workspace callback URL>`,
  `Upstash-Failure-Callback: <workspace failure URL>`,
  optional `Upstash-Forward-*` governed metadata (workspaceId/objectId/rowId/runId).
  `destination` = the serverless workflow endpoint from §4.3.
- On success, **update** the API Registry QStash row with non-secret scheduler metadata:
  `scheduleId, scheduleDestination, callbackUrl, failureCallbackUrl, region,
  lastScheduleTime, nextScheduleTime, lastScheduleStates, syncStatus=verified,
  syncProof, lastTested`. Append a receipt (`changedFields: ["dataModel.api-registry"]`).
- Add a matching `DELETE` (uninstall) that calls `DELETE /v2/schedules/{scheduleId}` and clears the
  scheduler metadata + receipt.

**2.3 Extend the row schema.** Add the new scheduler-metadata columns to `apiRegistryColumns()` in
`lib/workspace-add-ons.js` so the row can carry schedule proof. `makeUpstashProductRow()` keeps
returning placeholders **only** until a real schedule/callback overwrites them.

### Phase 3 — Serverless workflow endpoint as a thin adapter (review §4) — **NEW**

**3.1** Add `app/api/workspace/workflows/upstash/route.js` using `serve()` from
`@upstash/workflow/nextjs`. It must be a **thin adapter over the existing governed run loop**, not a
second workflow schema:
- Parse `{ workspaceId, objectId, rowId, runId, orchestrationConfigVersion }` (forwarded headers/payload).
- `readWorkspaceConfig()` → resolve the same sandbox/workflow row used by
  `POST /api/workspace/sandbox-run`.
- Execute the **existing** orchestration loop —
  `runOrchestrationGraphIfPresent()` / `runAgentSwarmGraphIfPresent()`
  (`lib/orchestration-graph-runner.js`, `lib/orchestration-agent-swarm.js`) — wrapping each node/phase
  as a Workflow `context.run(...)` step so QStash provides durability/retry/resume. No node-type
  changes; reuse `KNOWN_NODE_TYPES`.
- Write outputs through the existing governed helpers and `appendOutcomeReceipt()`.
- Return a compact run result. **Do not** introduce a parallel runner or persistence model.

### Phase 4 — Callback / failure-callback = the synchronization bridge (review §5) — **NEW, closure point**

**4.1** Add:
- `app/api/workspace/add-ons/upstash/qstash/callback/route.js`
- `app/api/workspace/add-ons/upstash/qstash/failure/route.js`

**4.2** Both routes must:
1. Verify `Upstash-Signature` using `Receiver` from `@upstash/qstash` with
   `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` (resolved via §0.3).
2. Use the **raw request body** for verification (do not stringify a parsed object — per Upstash docs).
   Reject invalid/missing signatures with 401 and a `blocked` receipt.
3. Match the callback to the governed schedule/run via `scheduleId` / `messageId` / forwarded
   workflow headers / payload ids.
4. Write only normalized, non-secret proof into the workspace config + API Registry row + receipt:
   `lastResponseStatus, lastResponseBodyPreview, lastMessageId, lastScheduleId, lastAttemptedAt,
   lastSucceededAt | lastFailedAt, lastFailureReason, syncProof`.
5. Append an outcome receipt: `lane="server-authoritative"`, `policyVerdict`, `changedFields`,
   `objectRefs` pointing at the sandbox/workflow row.

**4.3 Replace the placeholder.** This is what makes the PR's checkbox 4 true: the row's
`lastResponse`/`lastResponseBodyPreview` now comes from a real scheduled run, synchronized into
workspace config for that run.

### Phase 5 — Canvas binds only on real schedule-capability proof (review §6)

**5.1** Tighten `WorkflowSurface.jsx`:
- `useInstalledQstashWorkflowAddOn()` should require the QStash API Registry row to have **both**
  `syncStatus==="verified"` and a **schedule capability proof** (`scheduleId` present from §2.2),
  not just a verified read probe.
- Extend `deriveWorkspaceAddOnsState()` / `findInstalledWorkspaceAddOns()` in
  `lib/workspace-add-ons.js` to expose `hasQstashSchedulerCapability` (verified row **with**
  `scheduleId`). Gate the "Use for this workflow" CTA on that; otherwise keep the workflow local and
  route to `/settings/add-ons` (the existing `openQstashSetup()` path).
- Only then patch `runLocality=serverless` + `schedulerRegistryId=upstash-qstash-workflow`.

---

### Phase 6 — Serverless-readiness causality gate (downstream graph compatibility) — **NEW, closure layer**

A scheduler install succeeding proves the **binding** (remote schedule exists, row owns
`scheduleId`, trigger node is `serverless-scheduler`, signed destination/callback validate). It does
**not** prove the **downstream graph** can run with no human/local agent state. `lib/serverless-readiness.js`
produces that missing compatibility proof and is the causality gate before bind/publish/resume.

**6.1 The scan (`scanServerlessReadiness`).** Pure + dependency-injected (graph + workspace config +
`env` in, a structured verdict out). It scans the **runtime-live** graph field (runner precedence:
`orchestrationGraph` else `orchestrationConfig`) and inspects every node reachable from the trigger:

- **Input / trigger** — `bound` phase: `trigger==="serverless-scheduler"`, `config.schedule.scheduleId`
  agrees with the row + expected schedule, `schedulerRegistryId`/provider/product match, enabled.
- **API Registry call** — resolve the referenced row; require a concrete `integrationId`; require the
  declared `authRef` to resolve through `server-secrets` (`readServerSecret`/`resolveRequiredEnv`),
  never browser/client/local state; refuse any secret **value** persisted into config/graph/receipts;
  bind endpoint/body `{{input.*}}` from the scheduled input contract.
- **Transform / filter** — every referenced input field must exist under scheduled execution; a
  manual-only field becomes a `scheduled-input-unmapped` warning (draft delta), not a silent schedule.
- **Agent / local-process** — local-only adapters (`local-agent-host`, `local-intelligence`), local
  filesystem/browser/desktop assumptions, and non-API-backed `ai-agent` nodes are **blocked** with a
  `local-agent-upgrade-required` helper action (migrate to a Claude/OpenAI/API-Registry runtime).
- **Tool-result** — must keep `writeLastResponse` so scheduled-run proof syncs back to the owning row.

**6.2 The delta/helper contract.** A not-ready graph never fails vaguely: the verdict carries
`status` (`ready`/`warning`/`blocked`), `blockingNodes[]` + `warnings[]` (each with canonical
`deltaTags` and a `helperAction`), and a `deltaTags` union. Canonical tags: `serverless-schedule`,
`runtime-locality`, `input-contract`, `api-registry-env`, `local-agent-upgrade-required`,
`downstream-node-incompatible`, `missing-server-secret`, `scheduled-input-unmapped`,
`published-graph-required`.

**6.3 Gate wiring (block/pause until clean; published graph unchanged).**
- **Install** (`runScheduleInstall`) runs the scan after row eligibility and **before any remote
  QStash call** — a blocked verdict emits a `serverless-schedule-readiness` blocked receipt and
  returns 422 (no remote schedule created, no row bound).
- **Publish** (`workflow/publish`) re-scans a serverless-bound row in `bound` phase; a blocked verdict
  returns `409 serverless_not_ready` and the live graph is left unchanged.
- **Resume** (`schedule` route `action:"resume"`) re-runs the scan before re-enabling — a continuing
  runtime contract, so drift (a changed node/row/cred/template) re-blocks.
- **Read-only scan** (`action:"readiness"` → `runReadinessScan`) performs no remote call and no
  mutation; the canvas calls it when the input trigger flips to Serverless Schedule.

**6.4 Atomic UI flagging (`readinessFieldFlags`).** The verdict maps each alert to the **exact**
config/sandbox-row field(s) to change. The canvas renders an **ultrathin orange border** on a flagged
node and a **light-orange fill** on only those fields + the matching delta-tag shields — the color is
the guidance, nothing else added.

---

## 5. QA bar before merge (concretizes review §7 + PR checkboxes)

**Unit**
- [ ] Provider/product sync never writes `verified` without required env **and** a successful probe.
- [ ] No secret value ever appears in workspace config, API Registry rows, receipts, or responses (assert against `redactSecrets()` output).
- [ ] `deriveQstashScheduleId(...)` is deterministic/idempotent for identical inputs.
- [ ] Callback route rejects invalid/missing `Upstash-Signature` (401 + blocked receipt).
- [ ] Callback route updates the correct schedule/workflow row and appends a receipt.
- [ ] `page.jsx` emits the exact `envSignals` key the client consumes (`providerProductReadiness`) — regression test for the §0.1 bug.
- [ ] Canvas bind is blocked unless the row has `verified` **and** `scheduleId`.
- [ ] `scanServerlessReadiness` blocks install/publish/resume when a downstream node is not serverless-ready (missing server secret, unresolved API Registry row, local-only adapter/agent) and emits the canonical delta tags + helper actions; warnings (unmapped input) do not hard-block. Canonical `scheduleId` format is hyphen-delimited and slug-safe (`/^[A-Za-z0-9_-]+$/`).

**Smoke**
- [ ] Install/sync QStash product → API Registry row appears `verified`.
- [ ] Create a schedule → row carries `scheduleId` + scheduler metadata.
- [ ] Workflow canvas binds installed QStash row → `runLocality=serverless`, `schedulerRegistryId=upstash-qstash-workflow`.
- [ ] One-minute schedule (or single publish test) → callback/failure route writes last-response proof into workspace config.

**Build**
- [ ] Kit `next build` (`--webpack`) green; existing kit smoke/QA gate green; paste output into the PR.

---

## 6. File-level change map

| Action | Path (under `…/growthub-custom-workspace-starter-v1/apps/workspace/`) |
|---|---|
| FIX | `app/settings/add-ons/page.jsx` (prop key) |
| EDIT | `lib/workspace-add-ons.js` (`apiRegistryColumns` += scheduler meta; `deriveQstashScheduleId`; `deriveWorkspaceAddOnsState` += `hasQstashSchedulerCapability`) |
| EDIT | `app/api/workspace/add-ons/upstash/provider/sync/route.js` (live provider probe) |
| NEW | `app/api/workspace/add-ons/upstash/qstash/schedule/route.js` (POST/DELETE) |
| NEW | `app/api/workspace/workflows/upstash/route.js` (`serve()` thin adapter) |
| NEW | `app/api/workspace/add-ons/upstash/qstash/callback/route.js` |
| NEW | `app/api/workspace/add-ons/upstash/qstash/failure/route.js` |
| EDIT | `app/workflows/WorkflowSurface.jsx` (gate bind on schedule capability) |
| EDIT | `package.json` (`@upstash/qstash`, `@upstash/workflow`) |
| EXTRACT | shared canonical env resolver helper in `lib/` (from `sandbox-run` route) |
| NEW | unit/smoke tests per §5 |

## 7. Sequencing & risk

1. **Phase 0** first (bug fix + deps + canonical resolver) — unblocks and is low-risk/high-value.
2. **Phase 1** (provider honesty) — small, removes the worst over-claim.
3. **Phase 2 → 3 → 4** in order — this is the real loop; Phase 4 is the closure point and should be
   the gate for flipping the PR out of WIP.
4. **Phase 5** last — purely tightens UX gating once real proof exists.

**Top risks:** (a) signature verification regressions if the parsed body is stringified — covered by
a dedicated unit test; (b) read-only persistence runtimes (Vercel/Netlify) where
`writeWorkspaceConfig` returns 409 — callbacks must degrade gracefully and still emit a receipt with
`persisted:false`; (c) scope creep into a parallel runner — explicitly forbidden, Phase 3 is a thin
adapter only.

---

*This plan keeps every new capability inside the same Growthub governed universe: API Registry rows,
sandbox/workflow rows, workspace config, and outcome receipts. The marketplace surface and canonical
entry are already a strong foundation; the next patch focuses almost entirely on proving the live
install → schedule → callback → sync loop and the QA that backs it.*

---

## 8. Delivery (what this PR actually ships)

Built as a **provider-agnostic scheduler-capability layer** with Upstash QStash as the first
adapter — a second provider is added by registering one more adapter, with **no route changes**.

**New (provider-agnostic core)**
- `lib/server-secrets.js` — the single canonical env resolver (`readServerSecret`/`resolveRequiredEnv`); add-on routes resolve tokens through the same entry the sandbox run loop uses.
- `lib/workspace-add-on-scheduler.js` — `deriveScheduleId` (deterministic upsert key), public-URL + callback-URL derivation, **native QStash JWT signature verification** (`node:crypto`, wire-compatible with `@upstash/qstash` Receiver, zero runtime dep), and the `upstash-qstash` SchedulerAdapter (build schedule/delete requests, parse callback envelope).
- `lib/workspace-add-on-callback.js` — the synchronization bridge: verify signature → parse → write non-secret last-response proof into workspace config + receipt.
- `app/api/workspace/add-ons/[providerId]/schedule/route.js` (POST upsert / DELETE), `…/callback/route.js`, `…/failure/route.js`, `app/api/workspace/workflows/[providerId]/route.js` (signed serverless destination; thin adapter over `runOrchestrationGraphIfPresent`).

**Changed**
- `lib/workspace-add-ons.js` — scheduler/callback columns, `withMarketplaceSchedulerMetadata` (allowlisted, secret-dropping merge), `hasSchedulerCapability`, `deriveWorkspaceAddOnsState.hasQstashSchedulerCapability`, `listAllProviderProductReadiness`, provider rows can be `account-linked` vs `verified`.
- `app/api/workspace/add-ons/providers/[providerId]/sync/route.js` — **live** account-management probe (Basic auth); only writes `verified` on a real success, else `account-linked`.
- `app/settings/add-ons/page.jsx` — emits `providerProductReadiness` (fixes the prop-mismatch bug; regression-tested).
- `app/workflows/WorkflowSurface.jsx` — "Use for this workflow" **creates this row's schedule first and only flips to serverless if the provider confirms it** (stronger than a static gate).

**Validation (all green)**
- `node --test scripts/unit-workspace-add-ons-scheduler.test.mjs` → 20/20 (schedule-id idempotency; signature valid/tampered/wrong-key/rotated/expired/missing; callback parse; capability gating; secret-never-persisted; env-signals key contract).
- Existing suites (`unit-sandbox-serverless-flow`, `unit-resolver-registry`) → 40/40, no regression.
- Kit `next build` (`--webpack`) → green; all new routes registered.
- `check:version-sync` (bump), `check:worker-kits`, `freeze:check`, kernel, monorepo-boundary, cli-package → pass.

**Review hardening (round 2 — security/correctness)**
- **Signature is endpoint-bound.** `verifyQstashSignature` now enforces `iss === "Upstash"` and `sub === expectedUrl`, requires the `body` claim for a non-empty body, and the callback/destination routes derive `expectedUrl` from the canonical public URL (not a header). A `/callback` signature cannot be replayed at `/workflows` and vice-versa (unit-tested both directions).
- **Callbacks require the installed scheduleId.** `evaluateCallbackScheduleMatch` (pure, unit-tested) requires the registry row to own a `scheduleId`, the callback to carry one, and the two to match; any miss appends a **blocked** receipt instead of silently mutating config.
- **Single canonical secret resolver.** `sandbox-run`, `orchestration-graph-runner`, `test-api-record`, and `env-status` now import `lib/server-secrets.js` and define no local copies — enforced by a regression test that scans the kit for duplicate `readServerSecret`/`envKeyCandidates` definitions.
- **`QSTASH_URL` optional.** Only `QSTASH_TOKEN` is required; the schedule base URL derives from the selected region (`https://qstash-{region}.upstash.io`) when `QSTASH_URL` is absent, and an explicit `QSTASH_URL` overrides it (unit-tested).
- **No localhost/non-https callbacks.** `resolveWorkspacePublicUrl` returns `""` for `localhost`/`127.0.0.1`/`0.0.0.0`/non-https origins unless `GROWTHUB_ALLOW_INSECURE_CALLBACK_URL=true` (local tunnel), so a schedule is never installed against an unreachable callback.
- **Forwarded-header naming fixed.** QStash strips the `Upstash-Forward-` prefix, so the schedule sets canonical `Upstash-Forward-X-Growthub-*` and the destination reads `x-growthub-*`.
- Plus retry counters (`retried`/`maxRetries`) and `lastScheduleInstalledAt` recorded as non-secret proof.

**Review hardening (round 3 — runtime truth alignment / multi-workflow)**
- **Schedule state is owned by the workflow ROW, not the global provider row.** `withWorkflowServerlessBind` writes `scheduleId`, `schedulerProviderId/ProductId`, `schedulerRegion`, `schedulerCron`, destination + callback URLs, and `schedulerInstalledAt` onto the owning sandbox row. The API Registry row stays a pure **capability** (verified token/probe). Two workflows can each own their own schedule without fighting over one id (unit-tested A+B).
- **Trigger node synced in the same atomic write.** The orchestration config's trigger node (`data-trigger`, else the entry `input` node) is set to `trigger: "serverless-scheduler"` with the schedule metadata, and the `tool-result` node keeps `writeLastResponse` on — so the graph logic tells the same story as the row and the run's last response is recorded. Only the **live** graph fields (`orchestrationGraph`/`orchestrationConfig`) are touched, never the draft; the bind binds to the published graph (stated in the receipt).
- **Callback syncs to the OWNING row.** The callback bridge resolves `scheduleId → owning sandbox row` (`findSandboxRowByScheduleId`), verifies the row is still bound to this provider, and writes `lastScheduledRun{Status,MessageId,AttemptedAt,SucceededAt,FailedAt,FailureReason,BodyPreview,Retries}` to that row; the receipt's `objectRefs` point at the workflow row. Provider row is no longer the per-run truth.
- **Validate-before-remote + replace semantics.** The schedule route resolves and validates the target row (exists + `sandbox-environment` + eligible) **before** any QStash call (`findEligibleSandboxRow`), and if the row already owns a different `scheduleId` it deletes the old remote schedule first (no orphans on version/name change).
- **Destination validates current binding.** `/api/workspace/workflows/[providerId]` rejects (409 + blocked receipt) a signed-but-stale delivery whose row is no longer `serverless` / bound to this scheduler / matching `scheduleId`.
- **Algorithm lock.** The signature verifier now rejects any JWT whose header `alg !== "HS256"` (`alg=none`/`RS256` rejected; tested).
- **Mutation access boundary.** `requireWorkspaceOperator()` (no-op in the starter, `GROWTHUB_REQUIRE_OPERATOR_AUTH=true` hard-blocks; the single wire-point for hosted auth) guards the schedule/sync mutation routes.

**Honest residuals (named, not hidden)**
- Step-level Workflow durability via `@upstash/workflow serve()` is intentionally **not** adopted: scheduling/retry come from QStash schedules, step semantics from the existing orchestration graph. Wrapping each node as a `serve()` step is named future work, not required to close the loop.
- Per-run `last*` proof is written to the workflow row (the canonical runtime truth); mirroring it onto the trigger node's `config.last*` is a follow-up (the trigger node already carries the schedule binding).

---

## 8b. Custom plugins — the provider-agnostic lane (no gaps)

Add-ons have **two governed serverless lanes, both backed by the API Registry**; nothing is
Upstash-special-cased:

| | Adapter lane (e.g. Upstash QStash) | Custom lane (any owned worker/fn/API/cron) |
|---|---|---|
| Governed as | API Registry capability row + per-workflow row schedule | plain API Registry row referenced by `schedulerRegistryId` |
| Install UI | Settings → Add-ons → provider product sync | Settings → Add-ons → **Custom Plugin** → API/Webhooks registration |
| Bind UI | Canvas chooser → "Use for this workflow" (creates the schedule) | Canvas chooser → "Configure custom" → set `schedulerRegistryId` on the row |
| Execution | deterministic QStash schedule → signed destination → signed callback (durable, async) | `sandbox-run` serverless delegation: signed-server POST to the row's URL (synchronous) |
| Last-response sync | async callback writes `lastScheduledRun*` to the owning row | captured **inline** by `sandbox-run` (`lastResponse`/`status`) — no callback needed |
| Provider coupling | a registered `connectorKind` adapter | **none** — works for any row |

Guarantees that keep the custom lane gap-free and agnostic:
- A custom/owned row has **no scheduler adapter** (`getSchedulerAdapter` → null, `isSchedulerProduct` → false), so the adapter-specific QStash schedule/callback/destination routes never claim it (unit-tested). Custom rows run through the generic `schedulerRegistryId` delegation.
- Per-workflow schedule state lives on the **workflow row**, not the API Registry row, so the API Registry object stays a generic governed capability surface (no Upstash/per-schedule columns leak onto it — unit-tested).
- The canvas custom handler never navigates with empty `object`/`row` params — with a row it opens the row drawer at `schedulerRegistryId`; without one it routes to API/Webhooks to register the row first.

## 9. Live smoke — merge gate (external truth proof)

Offline tests + `next build` prove the implementation **shape**. The live run proves the
**real-world loop**, and is a hard merge gate. Capture this evidence and link it here / in the PR
before flipping out of draft. Each item maps to an enforced invariant.

### Acceptance checklist (all must pass)

1. [ ] real `QSTASH_TOKEN` + `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` configured in the runtime
2. [ ] product readiness sync verifies QStash **without leaking secrets** (response/row/receipt carry slugs + proof, never the token)
3. [ ] schedule route creates a real deterministic `scheduleId` (`growthub-upstash-{ws}-{obj}-{row}-{ver}`)
4. [ ] owning workflow row persists `runLocality=serverless`, `scheduleId`, `schedulerProviderId/ProductId`, `schedulerCron`, destination/callback URLs
5. [ ] live graph trigger node contains matching `schedule` metadata (`trigger=serverless-scheduler`)
6. [ ] QStash fires the destination route on the cron
7. [ ] destination **rejects** stale/missing schedule identities (401/400/409) and **accepts** the valid one (200)
8. [ ] orchestration runner executes through the existing graph (`runOrchestrationGraphIfPresent`), not a second engine
9. [ ] callback/failure callback verifies the signature against the correct endpoint (`sub` = that route)
10. [ ] callback persists `lastScheduledRun*` proof to the **owning workflow row**
11. [ ] receipt ledger shows: schedule install → scheduled run → callback sync → uninstall
12. [ ] uninstall deletes the remote schedule **and** clears local row/trigger state, returning non-success if either side fails

### Runbook

> Prereq: deploy the kit to a runtime QStash can reach (or expose local via a tunnel) and set
> `GROWTHUB_WORKSPACE_PUBLIC_URL` to that public origin; set the three `QSTASH_*` env vars;
> `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true` (or a writable persistence runtime).

```bash
BASE="$GROWTHUB_WORKSPACE_PUBLIC_URL"      # public origin QStash will call back to
OBJ="sandbox-workflows"; ROW="Flow A"      # an existing workflow row with a growthub-native graph

# (2) verify the product (live REST probe; secrets stay server-side)
curl -sS -X POST "$BASE/api/workspace/add-ons/providers/upstash/products/sync" \
  -H 'content-type: application/json' -d '{"productId":"upstash-qstash","region":"us-east-1"}' | jq

# (3,4,5) install a per-workflow schedule + bind the row + sync the trigger node (ONE write)
curl -sS -X POST "$BASE/api/workspace/add-ons/upstash/schedule" \
  -H 'content-type: application/json' \
  -d "{\"productId\":\"upstash-qstash\",\"objectId\":\"$OBJ\",\"rowId\":\"$ROW\",\"cron\":\"* * * * *\"}" | jq
#   → expect { ok:true, bound:true, scheduleId:"growthub-upstash-...", liveField, triggerNodeId }

# (4,5) confirm row + trigger truth
curl -sS "$BASE/api/workspace" | jq '.dataModel.objects[] | select(.id=="'"$OBJ"'") .rows[] | select(.Name=="'"$ROW"'") | {runLocality,scheduleId,schedulerProviderId,schedulerCron,orchestrationConfig}'

# (6,7,8,9,10) wait ~1 min for QStash to fire the destination + post the callback, then read proof
curl -sS "$BASE/api/workspace" | jq '.dataModel.objects[] | select(.id=="'"$OBJ"'") .rows[] | select(.Name=="'"$ROW"'") | {lastScheduledRunStatus,lastScheduledRunSucceededAt,lastScheduledRunMessageId,lastScheduledRunBodyPreview}'

# (7) negative: replay a stale/forged delivery to the destination → expect 401/409 (never 200)

# (11) receipt ledger shows install → scheduled-run → callback sync
curl -sS "$BASE/api/workspace/agent-outcomes" | jq '.receipts[] | select(.kind|test("schedule|scheduled-run")) | {kind,outcomeStatus,summary}'

# (12) uninstall: deletes the remote schedule AND reverts the row; non-success if either fails
curl -sS -X DELETE "$BASE/api/workspace/add-ons/upstash/schedule" \
  -H 'content-type: application/json' -d "{\"productId\":\"upstash-qstash\",\"objectId\":\"$OBJ\",\"rowId\":\"$ROW\"}" | jq
```

### Evidence (paste captured output here before ready-for-review)

```txt
runtime / public URL:
(2)  product sync verified — proof / no-secret:
(3)  scheduleId:
(4)  row runLocality/scheduleId/provider/product/cron:
(5)  trigger node schedule metadata:
(6)  QStash console: schedule fired at:
(7)  destination: stale rejected (status) / valid accepted (200):
(10) callback: lastScheduledRun* on owning row:
(11) receipt ids: install / scheduled-run / callback / uninstall:
(12) uninstall: remote deleted (HTTP) + row reverted + persisted:
```

Until this block is filled, this PR is *“production-shaped, offline-verified; live external smoke pending,”* not *“end-to-end loop closed.”*

### Readiness causality gate — real-localhost probe (captured)

`npm run smoke:serverless-readiness` stands up a real `127.0.0.1` HTTP server over a real
file-backed `growthub.config.json` (real read/write) and drives the actual install/readiness route
cores with positive **and** negative probes (the external QStash create is stubbed — that is the §9
live gate above, which needs real `QSTASH_*` + public ingress):

```txt
PASS  POS readiness: clean graph -> ok/ready                       (status=200 readiness.status=ready)
PASS  NEG readiness: local-agent node -> blocked                   (tags=["runtime-locality","local-agent-upgrade-required"])
PASS  NEG install:   local-agent graph -> 422, NO remote QStash    (status=422, qcalls+=0  ← gate fires before any side-effect)
PASS  POS install:   ready graph -> 200 bound + row persisted      (locality=serverless, scheduleId=growthub-upstash-ws-sandbox-workflows-ready-flow-v1)
PASS  NEG readiness: missing server secret -> blocked              (tags=["api-registry-env","missing-server-secret"])
PASS  scheduleId is canonical hyphen/slug-safe format              (/^[A-Za-z0-9_-]+$/)
ALL PROBES PASSED (6/6)
```
