# Inbound Input Method QA Handoff - PR #263

Date: 2026-07-03

Branch: `claude/pr-261-review-blockers-dqlks8`

PR: https://github.com/Growthub-ai/growthub-local/pull/263

Latest remote commit before this handoff: `e4167824` - `feat(workspace-kit): test-event modal, last-run inspector with dynamic references, draft-authored webhook method`

## Scope

This handoff records the real temp-export super-admin QA pass for the native no-code inbound input methods:

- Webhook: `registry-workflow`
- API Request: `api-workflow`
- Runtime: `http://127.0.0.1:3778`
- Export app: `/Users/antonio/growthub-worker-kit-exports/feature-work-2026-07-03T22-22-53-962Z/growthub-custom-workspace-starter-v1/apps/workspace`
- Persistence: filesystem, writable via `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true`

This work completes the no-code input method path:

`Connect -> Bind -> Test -> Go live`

with a test-event modal, last-run inspector, dynamic downstream references, and native marketplace-agnostic Webhook/API Request methods.

## Architecture Boundary - Scheduler vs Inbound Input Methods

The most important product boundary from final review:

- `/schedule` remains the scheduler cockpit command. It is not the user entry for Webhook or API Request.
- Webhook and API Request are workflow input methods, surfaced in the workflow sidecar.
- QStash Scheduler, Webhook, and API Request share the lower-level binding/proof vocabulary only because all three invoke a workflow graph and write durable proof.
- They are not equal user mental models: Schedule is time-based; Webhook is event-based; API Request is request-based.

```mermaid
flowchart TD
  A["/schedule helper command"] --> B["Schedule Cockpit"]
  B --> C["serverless-scheduler lane only"]
  C --> D["QStash scheduler adapter"]
  D --> E["remote schedule create / callback / pause / resume"]

  F["Workflow sidecar"] --> G["Input method: Webhook"]
  F --> H["Input method: API Request"]
  G --> I["native inbound invocation core"]
  H --> I
  I --> J["real destination door"]

  E --> K["workflow graph execution"]
  J --> K
  K --> L["lastScheduledRun* proof on owning row"]
  L --> M["publish gate checks fresh method-consistent proof"]
```

The add-ons schedule route is intentionally shared as the governed binding endpoint, but execution dispatch is lane-specific:

```mermaid
flowchart LR
  A["POST/DELETE /api/workspace/add-ons/:providerId/schedule"] --> B["resolve marketplace/native product"]
  B --> C{"product lane"}
  C -->|serverless-scheduler| D["existing scheduler cores"]
  C -->|inbound-webhook| E["inbound method cores"]
  C -->|api-request| E
  D --> F["QStash adapter / remote scheduler"]
  E --> G["native workspace door / no remote provider"]
```

Rules for future add-ons and agents:

1. Do not add Webhook/API Request method chips or filters to `/schedule`.
2. Do not describe Webhook/API Request as scheduler equivalents. They are invocation equivalents.
3. Keep future marketplace/native entries lane-shaped: a product declares its `executionLane`, then the route dispatches to the lane core.
4. QStash products must continue through the existing scheduler cores and adapter.
5. Inbound products must continue through `workspace-inbound-invocation` and must not require marketplace installation.
6. Cross-lane teardown must stay refused: a Webhook/API uninstall cannot clear a QStash-bound row, and one inbound method cannot clear the other method's binding.

## Fixes Landed During QA

1. Test-event modal CSS now forces a clean light JSON editor:
   - `background: #fff`
   - dark text
   - scoped to `.dm-inbound-test-modal .dm-inbound-body textarea`

2. `scripts/e2e-inbound-journey-seed.mjs` now derives the local public URL from `BASE_URL` / `E2E_PORT` and replaces stale env keys. This prevents a temp workspace running on `3778` from keeping a stale `GROWTHUB_WORKSPACE_PUBLIC_URL=http://127.0.0.1:3777`.

## Phase 2 - No-Code Sidecar E2E

Completed in the in-app browser through the real workflow sidecar.

### API Request

Workflow: `api-workflow`

Outcome:

- Selected native `API Request` input method.
- Env row showed `GROWTHUB_API_INVOKE_TOKEN` as `Configured`.
- Bound trigger through the sidecar.
- Endpoint corrected to `http://127.0.0.1:3778/api/workspace/workflows/growthub`.
- Test-event modal opened with payload seeded from `samplePayload`.
- Edited payload and sent via `Send test event`.
- UI updated without manual refresh to `Verified 200`.
- Last-run inspector showed `Response`, `Trace`, and `Details`.
- Response tab showed downstream output from `probe-scheduler`.

Durable row proof:

```json
{
  "runLocality": "serverless",
  "schedulerTriggerKind": "api-request",
  "lastScheduledRunStatus": "200",
  "lastScheduledRunTriggerKind": "api-request",
  "lastScheduledRunNodesCompleted": "true",
  "lastResponsePresent": true
}
```

### Webhook

Workflow: `registry-workflow`

Outcome:

- Selected native `Webhook` input method.
- Env row showed `GROWTHUB_WEBHOOK_SIGNING_SECRET` as `Configured`.
- Bound trigger through the sidecar.
- Endpoint corrected to `http://127.0.0.1:3778/api/workspace/workflows/growthub`.
- Test-event modal opened with payload seeded from `samplePayload`.
- Edited payload and sent via `Send test event`.
- UI updated without manual refresh to `Verified 200`.
- Last-run inspector showed `Response`, `Trace`, and `Details`.
- Response tab showed downstream output from `probe-scheduler`.

Durable row proof:

```json
{
  "runLocality": "serverless",
  "schedulerTriggerKind": "inbound-webhook",
  "lastScheduledRunStatus": "200",
  "lastScheduledRunTriggerKind": "inbound-webhook",
  "lastScheduledRunNodesCompleted": "true",
  "lastResponsePresent": true
}
```

## Phase 3 - Real External Invocation

Completed outside the browser against the real destination door:

`http://127.0.0.1:3778/api/workspace/workflows/growthub`

### API Request Domain Hit

Request: `POST` with `Authorization: Bearer tok_e2e_inbound_journey`

Result:

```json
{
  "status": 200,
  "ok": true,
  "proofPersisted": true,
  "row": "api-workflow",
  "lastScheduledRunStatus": "200",
  "lastScheduledRunTriggerKind": "api-request",
  "lastScheduledRunNodesCompleted": "true",
  "lastScheduledRunAt": "2026-07-03T22:54:50.450Z"
}
```

Negative:

```json
{
  "wrongBearerStatus": 401,
  "reason": "credential-mismatch",
  "proofTimestampUnchanged": "2026-07-03T22:54:50.450Z"
}
```

### Webhook Domain Hit

Request: `POST` with v1 HMAC headers:

- `x-growthub-signature`
- `x-growthub-timestamp`

Result:

```json
{
  "status": 200,
  "ok": true,
  "proofPersisted": true,
  "row": "registry-workflow",
  "lastScheduledRunStatus": "200",
  "lastScheduledRunTriggerKind": "inbound-webhook",
  "lastScheduledRunNodesCompleted": "true",
  "lastScheduledRunAt": "2026-07-03T22:54:50.603Z"
}
```

Negative:

```json
{
  "tamperedSignatureStatus": 401,
  "reason": "signature-mismatch",
  "proofTimestampUnchanged": "2026-07-03T22:54:50.603Z"
}
```

## Release-Bar Status

Green:

- Phase 2 no-code sidecar E2E for API Request.
- Phase 2 no-code sidecar E2E for Webhook.
- Phase 3 external API Request bearer invocation.
- Phase 3 external Webhook HMAC invocation.
- Negative auth rejection for wrong bearer.
- Negative auth rejection for tampered webhook signature.
- No proof update after failed auth.
- Modal CSS fixed and verified in browser.
- Temp seed URL drift fixed for non-3777 ports.
- `/schedule` cockpit source was rolled back to match `origin/main` scheduler-only behavior byte-for-byte after review.
- Scheduler/QStash focused tests passed after the rollback: `55/55`.
- Inbound tests passed after pinning the new boundary: `40/40`.
- The publish route has an explicit `export { POST }` guard for the 405 regression class.

Not completed in this pass:

- Missing-env negative restart test.
- Publish button HTTP 200 from a fresh draft state.
- Duplicate-body ACK/no re-execution check.
- Rate-limit burst check.
- Browser visit to `/schedule` after the final scheduler-only rollback.
- Full Tier 1 automated gates: previous `pnpm` attempts were blocked by workspace dependency/install state in this partial OSS tree.

## Notes For Next Agent

Start from the Phase 2/3 proof above. Do not retest from scratch unless the temp export is reset.

The next highest-value checks are:

1. Create a fresh draft change after the verified 200 proof and confirm publish blocks until a fresh test.
2. Publish from a verified draft and confirm HTTP 200 plus binding retention.
3. Run duplicate and rate-limit negatives against the same `3778` destination.
4. Visit `/schedule` only to confirm the scheduler cockpit remains scheduler-only and QStash-focused. Do not expect Webhook/API method chips there.

## Final Boundary Proof Commands

Run from repo root:

```bash
git diff --exit-code origin/main -- \
  cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/schedule-cockpit-console.js

node --test \
  scripts/unit-schedule-cockpit.test.mjs \
  scripts/unit-workspace-add-ons-scheduler.test.mjs \
  scripts/unit-scheduler-orchestration.test.mjs

node --test scripts/unit-workspace-inbound-invocation.test.mjs
```

Observed results during handoff:

- Schedule cockpit byte comparison against `origin/main`: exit `0`.
- Scheduler/QStash focused tests: `55/55` pass.
- Inbound invocation tests: `40/40` pass.
