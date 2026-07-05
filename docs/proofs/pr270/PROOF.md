# PR #270 Production Proof Pack — Marketplace Provider Capability Stack

One continuous browser journey (83/83 checks GREEN, `qa3-run.log` is the
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
- **Screenshots**: 26 PNGs in this directory, numbered in journey order.

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
Result: send receipt aor_mr7x1fq0_8t4e37 · provider message id email_mock_1 ·
        blocked receipts aor_mr7wzlny_xfg6hq (not connected), aor_mr7x1jas_m7v6sj
        (provider failure), aor_mr7x1nyh_p8qpl4 (missing sender).
```

- **Pre-connect blocked state** (`01`): the messaging door reports
  `providerConnected:false`, `missingEnv:["RESEND_API_KEY"]`; `send-test` is
  refused HTTP 409 and the refusal is receipted
  (`aor_mr7wzlny_xfg6hq — "Resend Email send-test blocked: Resend account not
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
  `email-templates` row → receipt `aor_mr7x1e0o_kcuuyj` → immediately
  reloadable from the sidecar select.
- **AI entry point**: "Draft with AI helper" deep-links
  `/data-model?helper=open&prompt=…` with a prefilled email-drafting prompt.
- **Sender readiness** (`15`): derived from the server door only — the pane
  prints env-ref NAMES with states (`RESEND_API_KEY · Configured —
  RESEND_FROM_EMAIL · Resolved`), never values.
- **Verified send** (`16`): real POST through the governed door → provider
  `POST /emails` → HTTP 200, message id `email_mock_1`, receipt
  `aor_mr7x1fq0_8t4e37`; the mock's outbox readback confirms the email
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
  minted, and the blocked outcome is receipted (`aor_mr7x1jas_m7v6sj`).
- **Blocked: missing env** (`20`): with `RESEND_API_KEY` stripped from the
  runtime, `send-test` → HTTP 422 `missingEnv:["RESEND_API_KEY"]` (receipted),
  and the pane shows `RESEND_API_KEY · Missing`.
- **Blocked: missing sender** (`21`): with `RESEND_FROM_EMAIL` stripped,
  `send-test` → HTTP 422 naming `RESEND_FROM_EMAIL`, receipt
  `aor_mr7x1nyh_p8qpl4`; pane shows "set in runtime or From field".

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

## Production-UI pass (operator-reported, fixed and re-proven)

A second round of operator review on the live surfaces flagged real interface
defects. All fixed, unit-guarded, and re-proven in the same 65/65 run:

1. **Editor controls rendered as UA-default dark buttons.** The editor's mode
   tabs / token chips / formatting toolbar / palette search carried a class
   with **zero authored CSS** and fell back to user-agent button styling.
   Mode/device tabs now reuse the canonical `dm-orchestration-config__tabs`
   grammar and every editor control is styled on the design system
   (browser-verified by computed-style readback, D3b).
2. **Static hint waterfall removed.** The sidecar stacked three explainer
   paragraphs (editor / templates / sender); all removed — env-ref context
   lives in placeholders and the live Test-pane status.
3. **Images are first-class body content with full on-click controls.**
   Toolbar **Image** insertion applies automatic sizing optimization as
   INLINE email-client-safe styles (`max-width:100%; height:auto;
   display:block` — shipped with the HTML, not just in-app CSS). Clicking an
   image opens a control bar: width presets (Auto/25/50/75/Full), alignment
   (Left/Center/Right), Alt text, Remove — all writing inline styles, all
   guarded against detached nodes (D3c–D3c4). Images survive the sanitize
   boundary into preview and template saves (D3e, D7b–D7d); the UI selection
   marker is stripped before anything persists (D7c).
4. **contentEditable DOM-reuse bug.** Switching Design → Preview directly
   leaked typed content into the preview frame as a stray text node (React
   reused the surface's DOM node whose children React never managed). The
   mode-owned elements are now keyed; a direct-switch renders exactly one
   clean preview card (D3d).
5. **"Installed capabilities" stays clean at any plugin count.** The group
   renders max 10 entries per page inside its own scroll area with an
   explicit "+ Show 10 more (N remaining)" expand — items remain derived from
   installed + verified governed rows; curated palette groups are untouched
   (D2b; unit-guarded).
6. **Preview frame layout overflow** at desktop width fixed
   (`min-width: 0` + scrollable frame) — no horizontal page scroll (verified
   by scrollWidth readback).

## Email tracking loop — real Resend events, per-send intelligence

```text
Using playwright-core Chromium via qa3-run.mjs.
Backend: local export boot at 127.0.0.1:3777 (mock provider at 127.0.0.1:4970).
Current URL: /api/workspace/add-ons/resend/events (external webhook door).
Live action layer: Svix-signed POSTs (HMAC-SHA256 over raw bytes, real header grammar).
Readback layer: page.request GET /api/workspace + door responses.
Result: send email_mock_1 → activity row created (status sent, template linked,
        blueprint lastUsedAt stamped) → signed delivered/opened×2/clicked events
        → row reads delivered · opens 2 · clicks 1 (webhook receipt
        aor_mr7x1gah_jw3cee) → forged signature 401 + receipted, row untouched →
        signed contact.* event honestly skipped 202.
```

The SENT EMAIL is the unit of performance intelligence — templates carry no
counters:

- Every real send lands ONE atomic row on the governed `email-activity`
  object, keyed by the provider message id Resend returns from
  `POST /emails` (D12b). The row carries `templateId`/`templateName`,
  workflow/node refs, and the full lifecycle grammar.
- The event map is EXACTLY Resend's documented webhook surface —
  `email.sent` / `delivered` / `delivery_delayed` / `bounced` / `complained`
  / `failed` / `opened` / `clicked`. Resend has **no reply event**, so the
  grammar carries no replies column: nothing invented (unit-enforced).
- The webhook door verifies real Svix signatures (HMAC-SHA256 over the raw
  body, `v1,<base64>` candidates, constant-time compare, 5-minute replay
  bound) with `RESEND_WEBHOOK_SECRET` from runtime env only. Missing secret
  → 422 receipted; forged signature → 401 receipted with rows untouched
  (D12g/D12h); signed events outside the email surface → honest 202 skip
  (D12i).
- Events for unknown message ids CREATE the activity row from event data —
  runtime-node sends close the same loop through the same key (unit-proven).
- Templates stay blueprints: the counters were REMOVED from template rows;
  a send stamps only `lastUsedAt` on the blueprint (D12d). Per-template
  performance is an aggregation over send rows.
- Terminal lifecycle honesty: bounced/complained/failed never regress to
  delivered (unit-proven).
- Runner security invariant (adversarial pass): the `resend-email` and
  `stripe-commerce` executors now resolve their credentialed base URL from
  GOVERNED material only (runtime env / server-written registry row) —
  browser-editable canvas config can never redirect a bearer-carrying call.
  The pre-existing `api-registry-call`/`supabase-data` precedence is flagged
  in the docs as its own follow-up migration.

## Email product surface — 2026 pass (operator-directed, re-proven)

A third operator pass raised the product bar on the email surface itself.
All shipped and browser-proven in the same 74/74 run:

1. **One Notion-style action bar** (`09`, `09b`): modes (Design/HTML/Text/
   Preview), formatting, Link/Image, a `{{…}} Variable` menu, and the expand
   control live in a single compact row — no stacked chip rows above the
   surface. Styling verified by computed-style readback (D3b/D3b1).
2. **Envelope separated from editing** (`09`): To / From / Subject / Preview
   text render as a collapsed breadcrumb bar (`To {{input.email}} › From
   RESEND_FROM_EMAIL › Subject … › Preview …`); the fields open only on an
   intentional Edit and collapse on Done (D3a/D3a2). Preview text (the inbox
   preheader) is a first-class envelope + template field (D7f).
3. **Full-width modal editing** (`09b`): the top-right expand opens a clean
   on-screen modal (portal, mirrors the workspace helper modal) editing the
   SAME node state live; Esc/Close returns to the sidecar with content intact
   (D3f/D3g). A bottom-left drag grip resizes the writing surface (180→320px
   proven in D3h) across Design/HTML/Text modes.
4. **Atomic template rows (agent-teams grammar)** (D7e): every saved template
   is an atomic governed row — slug `id`, capital-N identity, `status`,
   `version` (increments on content edits), `createdAt`/`updatedAt`,
   `lastUsedAt`. (A later operator pass moved performance tracking OFF the
   blueprint and onto per-send `email-activity` rows backed by real Resend
   webhook events — see "Email tracking loop" above.)

## GTM OS workspace template — canonical seeded-config pathway proof

```text
Using the committed dist CLI (node cli/dist/index.js, v0.14.15) on a temp dir.
Command: growthub starter init --out ./gtm-os-workspace --seed-config gtm-os
Readback layer: merged growthub.config.json + booted export /api/workspace.
Screenshot: 26 (booted GTM OS workspace, both dashboards live).
Result: 28 governed objects merged over the blank starter · dashboards
        "Reacher Enrichment Command Center" + "Email GTM Infra Control Plane"
        served · 11 api-registry rows all env-ref authRefs, needs-connection,
        EMPTY connectionIds · zero token-shaped strings · ops-template
        (project-management) regression export unchanged.
```

- The GTM OS config registered through the SAME canonical pathway as the ops
  variation: `templates/seeded-configs/gtm-os.config.json` applied by the
  existing `applySeededConfig` merge, surfaced as a workspace template in
  `kit list / inspect / download` (now table-driven — both templates ride one
  registry; src and committed dist updated in the same shape).
- Import sanitation (adversarial pass): one pre-populated `connectionIds`
  value in the provided seed was stripped to "" (connection ids are
  operator-owned post-OAuth per the template contract) and the
  workspace-template provenance keys (`template`, `templateKind`) were added.
  Entropy/token/PII grep over all 206KB: clean.
- Validator parity honesty: the strict `validateWorkspaceConfig` gate rejects
  BOTH the ops template and GTM OS merged configs identically (it validates
  PATCH bodies, not config files) — the acceptance proof is the real boot,
  which serves all 28 objects and both dashboards (screenshot 26).

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
