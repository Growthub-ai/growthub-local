# PR #270 Production Proof Pack — Marketplace Provider Capability Stack

One continuous browser journey (54/54 checks GREEN, `qa3-run.log` is the
unedited run log) performed as a real user on a real boot of the exported
`growthub-custom-workspace-starter-v1` kit, from a fully reset workspace
(no providers connected, no products installed, no source objects, no
templates) through every surface the follow-up review required.

## Proof environment (honest adaptation of the requested proof language)

The review's proof-language template names "Codex IAB via browser-client.mjs".
That harness is not available in this environment, so the pack uses the same
structure with the real driver named explicitly:

- **Driver**: `playwright-core` on the pre-installed Chromium
  (`/opt/pw-browsers/chromium`), viewport 1440×950.
- **Backend**: local boot of the exported worker kit —
  `next dev` on `http://127.0.0.1:3777`, fresh `.next`, reset
  `growthub.config.json` / `growthub.source-records.json` / `.env.local`.
- **Provider side**: protocol-shaped mock of the Stripe/Resend/Neon/Cloudflare
  APIs on `http://127.0.0.1:4970` (Bearer auth enforced, 401 on wrong token,
  Stripe read envelopes, Resend `POST /emails` with a fault-injection toggle).
  Live vendor egress is blocked from this environment (proxy CONNECT 403);
  the runtime env carries `*_API_URL` overrides — the same mechanism a
  self-hosted operator uses — so every byte still flows through the real
  server-side probe/resolver/door/runner code paths. Live vendor smoke
  remains a documented deferred item until egress/credentials exist.
- **Live action layer**: Playwright `page.click` / `page.fill` /
  `page.keyboard` — real UI interactions, no API shortcuts for user steps.
- **Readback layer**: `page.request` JSON readbacks against the workspace
  routes plus DOM snapshots; all captured in `readbacks.json`.
- **Screenshots**: 24 PNGs in this directory, numbered in journey order.

Every `check(...)` line below cites the run log. Receipt ids are real ids
from `workspace:agent-outcomes` on this boot.

---

## Journey 1 — Resend Email Editor (install → editor → send → blocked states)

```text
Using playwright-core Chromium via qa3-run.mjs.
Backend: local export boot at 127.0.0.1:3777 (mock provider at 127.0.0.1:4970).
Current URL: /workflows?object=sandbox-probe&row=registry-workflow&field=orchestrationConfig.
Visible surface: Workflow canvas → Resend Email node → Configuration/Test tabs.
Live action layer: page.click / page.fill / page.keyboard.type.
Readback layer: page.request GET/POST /api/workspace/add-ons/resend/messaging + DOM snapshots.
Screenshots: 01, 03, 08–21.
Result: send receipt aor_mr77p929_wsbl7d · provider message id email_mock_1 ·
        blocked receipts aor_mr77oa0p_x0tkae (not connected), aor_mr77pbfk_3oepph
        (provider failure), aor_mr77ph8p_tx99s9 (missing sender).
```

- **Pre-connect blocked state** (`01`): the messaging door reports
  `providerConnected:false`, `missingEnv:["RESEND_API_KEY"]`; `send-test` is
  refused HTTP 409 and the refusal is receipted
  (`aor_mr77oa0p_x0tkae — "Resend Email send-test blocked: Resend account not
  connected."`) with a repair `nextActions`.
- **Connect + install** (`03`): credentials verified server-side against the
  provider API (`Resend Email probe /domains returned HTTP 200` stored as
  `syncProof` on the governed row); browser holds nothing.
- **Palette** (`08`): "Installed capabilities" group derives from the manifest
  (`listInstalledNodeSurfaces`) with the real product logos.
- **Editor modes** (`09`–`13`): Design (rich text with B/I/U/lists/link/H2
  toolbar), HTML source, Plain-text, and Preview in desktop (600px) and
  mobile (320px) frames. Token chips insert `{{input.name}}` / `{{input.email}}`
  into the active surface; free-form token insert supported.
- **Templates** (`14`): "Save as template" posts the governed door's
  `save-template` action → sanitized server-side → upserted as a governed
  `email-templates` row → receipt `aor_mr77p7r6_xpszbx` → immediately
  reloadable from the sidecar select.
- **AI entry point**: "Draft with AI helper" deep-links
  `/data-model?helper=open&prompt=…` with a prefilled email-drafting prompt.
- **Sender readiness** (`15`): derived from the server door only — the pane
  prints env-ref NAMES with states (`RESEND_API_KEY · Configured —
  RESEND_FROM_EMAIL · Resolved`), never values.
- **Verified send** (`16`): real POST through the governed door → provider
  `POST /emails` → HTTP 200, message id `email_mock_1`, receipt
  `aor_mr77p929_wsbl7d`; the mock's outbox readback confirms the email
  actually arrived at the provider side. The receipt summary carries the
  node-proof key `workflowRef · nodeId · draftHash`.
- **Publish honesty** (`16`): chip says **"Node tested · Verified 200"** and
  the pane copy states "This proves the NODE — the workflow's full draft test
  still gates publish." The workflow header keeps Publish gated behind the
  draft test; node proof never unlocks it.
- **Draft-hash staleness** (`17`): editing the subject after a verified send
  revokes the stored chip (hash mismatch) — proof can never be stale.
- **Blocked: bad recipient** (`18`): Send stays disabled client-side; the
  door independently refuses a missing/invalid recipient with HTTP 400
  (receipted).
- **Blocked: provider failure** (`19`): with the mock forced to return 422
  "domain is not verified", the door surfaces HTTP 502, no Verified chip is
  minted, and the blocked outcome is receipted (`aor_mr77pbfk_3oepph`).
- **Blocked: missing env** (`20`): with `RESEND_API_KEY` stripped from the
  runtime, `send-test` → HTTP 422 `missingEnv:["RESEND_API_KEY"]` (receipted),
  and the pane shows `RESEND_API_KEY · Missing`.
- **Blocked: missing sender** (`21`): with `RESEND_FROM_EMAIL` stripped,
  `send-test` → HTTP 422 naming `RESEND_FROM_EMAIL`, receipt
  `aor_mr77ph8p_tx99s9`; pane shows "set in runtime or From field".

## Journey 2 — Stripe Commerce Dashboard (seeded empty → resolver → widgets)

```text
Using playwright-core Chromium via qa3-run.mjs.
Backend: local export boot at 127.0.0.1:3777 (mock provider at 127.0.0.1:4970).
Current URL: / (Builder) → Dashboards → Stripe Commerce (template-applied draft).
Visible surface: native template gallery → applied Stripe Commerce dashboard.
Live action layer: page.click (gallery "New Dashboard", widget selection).
Readback layer: page.request GET /api/workspace + POST /api/workspace/refresh-sources.
Screenshots: 02, 04–07.
Result: refresh readback stripe-payments-feed:4 · stripe-customers:3 ·
        stripe-products:2 · stripe-balance:2 records; widgets hydrated from
        governed rows; zero browser requests to the provider host.
```

- **Install seeds honest-empty governed objects** (`02` + config readback):
  installing `stripe-payments` seeds `stripe-payments-feed`, `stripe-customers`,
  `stripe-products`, `stripe-balance` with `rows: []` and bindings on the
  native refresh lane (`sourceStorage: "workspace-source-records"`,
  `integrationId: "stripe-payments"`). No fake sample rows anywhere.
- **Native gallery entry** (`04`): "Stripe Commerce" ships in the standard
  template gallery with honest copy about the read-only resolver path.
- **Template applies cleanly** (`05`): the "New Dashboard" clone runs
  `validateWorkspaceTemplate` and lands a dashboard whose widgets render
  honestly EMPTY before any refresh. (This exact click caught a real template
  grammar bug during proofing — see "Fixes shipped by this proof pass".)
- **Server-side resolver refresh** (readback): `POST /api/workspace/refresh-sources`
  dispatches the registered read-only `stripe-payments` resolver → 4/3/2/2
  records land through `writeWorkspaceSourceRecords`. The browser sends only
  non-secret `sourceIds`.
- **Hydrated widgets** (`06`): revenue chart (4 recomputed bars), Available
  Balance ($18,742.00 available / $1,398.00 pending as governed rows), Recent
  Payments (4 payment intents incl. `processing` and
  `requires_payment_method` states), Customers (incl. a delinquent one),
  Products, plus the "How this dashboard stays honest" widget.
- **Widget configuration state** (`07`): selecting a widget in draft mode
  opens the native config panel: kind, layout options, **Source: Stripe
  Payments** (the governed data-model binding), fields, filter/sort.
- **Read-only boundary**: the page's full network log shows **zero browser
  requests to the provider host** across the whole journey (G1) — every
  provider byte flows server-side; the runner's Stripe allowlist
  (`list-payment-intents`, `list-customers`, `list-products`,
  `retrieve-balance`, GET-only) is unit-enforced.

## Journey 3 — 1K+ Marketplace Scale (bounded, searchable, deterministic)

```text
Using playwright-core Chromium via qa3-run.mjs.
Backend: local export boot at 127.0.0.1:3777.
Current URL: /workflows?object=sandbox-probe&row=registry-workflow&field=orchestrationConfig.
Visible surface: workflow add-step palette with 1,000 installed discovered products.
Live action layer: page.click / page.fill (palette search, variant insert).
Readback layer: config row counts via kit lib + DOM snapshots.
Screenshots: 22–24.
Result: 1,000 unique governed rows · re-install of svc-500 → still 1,000 rows ·
        palette renders 8 of 1000 with search · "Service 777" inserts as
        api-registry-call · curated bespoke set stays [resend-email, stripe-commerce].
```

- **Seeded account** (`22`): 1,000 Nango-style discovered products installed
  as governed api-registry rows (1,000 unique `integrationId`s; the 1,001st
  upsert — a re-install of `svc-500` — changes nothing: still 1,000 rows).
- **Bounded search** (`22`, `23`): the "Installed integrations" palette group
  renders "Showing 8 of 1000 — refine the search" with a search input; exactly
  8 buttons in the DOM (no over-render); "Service 777" narrows to one
  deterministic hit.
- **Deterministic install, no new node types** (`24`): inserting the
  discovered product lands an **`api-registry-call`** node (config panel
  header: "Service 777 · api-registry-call") — the long tail rides the
  canonical lane. `listCapabilitySurfaces()` readback confirms the curated
  bespoke set stays exactly `[resend-email, stripe-commerce]`.

## Secret hygiene readback

```text
grep of provider token values across all governed state after the full journey:
  growthub.config.json ................ 0 hits
  growthub.source-records.json ........ 0 hits (includes the receipt stream)
  all 24 screenshots (binary scan) .... 0 hits
  env-ref NAMES in config ............. STRIPE_SECRET_KEY / RESEND_API_KEY as refs only
  actual secret values ................ .env.local (runtime) only
Browser → provider-host requests across the whole journey: 0 (G1).
Receipt stream re-scan (50 newest receipts): 0 token hits (G3).
```

## Fixes shipped by this proof pass (bugs the pack caught)

Running the journey as a real user surfaced two real defects that source
review and unit suites had missed — exactly what the proof-pack bar is for:

1. **Stripe Commerce template failed on actual application.** The
   `DASHBOARD_TEMPLATES` entry used `chartType: "bar"` (not in the validator
   allowlist), bare-string axes, and `mode: "integration"` widget bindings
   without `integrationId`/`lane` — `validateWorkspaceTemplate` threw on the
   real "Use Here"/"New Dashboard" click and the gallery silently stayed
   open. Fixed by mirroring the builder's own data-model binding grammar
   (`mode: "manual"` + `sourceType: "workspace-data-model"` +
   `sourceAuthority: "workspace-config"` + `objectId`) and the validator's
   chart grammar (`bar-vertical`, `ChartAxisConfig` objects). A regression
   test now applies the template through the exact gallery clone path
   (`cloneTemplateToTab` / `cloneTemplateToDashboard`).
2. **Template-applied charts landed dead.** Charts only read
   `config.values`, which recomputed on refresh events and in the config
   panel — but never at template application, so an applied revenue chart
   stayed blank even with hydrated rows. Template application now recomputes
   data-model-bound chart widgets against the live tables (honest both ways:
   rows present → chart lands live; nothing refreshed → stays empty).

## Reviewer acceptance checklist mapping

- [x] Resend editor screenshots prove production-grade user flow (09–14: modes,
      previews, tokens, template save/reload, AI entry).
- [x] Resend test-send proof shows receipt id and blocked states (16, 18–21;
      receipts cited above, incl. all four blocked classes).
- [x] Workflow publish proof: node proof and publish proof are not conflated
      (16 copy + chip wording + gated Publish; draft-hash staleness in 17).
- [x] Stripe dashboard shows real widgets bound to governed Stripe source
      objects (06, 07).
- [x] Stripe resolver proof: rows populate through server-side refresh, not
      static samples (05 honest-empty → refresh readback → 06 hydrated).
- [x] 1K discovered-product UI proof: bounded, searchable, deterministic
      (22–24; idempotent re-install readback).
- [x] Secret grep/readback: no provider keys in rows, browser state, receipts,
      screenshots, or source records (section above; B9/G1/G2/G3).
- [~] Live vendor smoke: still blocked on egress/credentials from this
      environment; the mocked-provider proof is protocol-shaped and explicit
      (Bearer auth, real envelope shapes, fault injection). First live run is
      a documented deferred item.
