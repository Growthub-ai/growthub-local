# Marketplace Provider Playbook V1 — shipping a new official plugin at Supabase/Vercel parity

This is the canonical, end-to-end playbook for adding a new official
marketplace provider (plugin) + install products to the governed workspace
kit. It was extracted from the two shipped reference integrations — the
Vercel/GitHub deployment lane and the Supabase database-operations lane —
and it is written for agents: follow it in order, prove every phase, and a
new provider lands with zero parallel subsystems and full browser proof.

The bar is explicit: **mirror the existing integration mechanisms exactly.
Never invent a detection key, a route class, a row shape, or an oversight
surface that Vercel/GitHub/Supabase did not already need.**

Reference integrations to read side-by-side with this playbook:

- Vercel + GitHub: `docs/GOVERNED_INBOUND_AND_DEPLOYMENT_RELEASE_FREEZE_V1.md`
- Supabase: `docs/OFFICIAL_SUPABASE_PROVIDER_V1_PLAN.md` (Phase-0 intent) and
  `docs/OFFICIAL_MARKETPLACE_PLUGINS_V1.md` (shipped contract)

All kit paths below are relative to
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`.

---

## Phase 0 — Intelligence gathering (do this BEFORE writing anything)

An agent must reconstruct the current contract from source, not from memory.
Read these files and extract the listed facts. If the repo has moved on,
the files win over this document.

| Source of truth | What to extract |
| --- | --- |
| `lib/workspace-add-ons.js` | `MARKETPLACE_PROVIDERS` provider grammar; product grammar (`productId`, `integrationId`, `authRef`, `connectorKind`, `executionLane`, `requiredEnv`/`optionalEnv`, `probe`, `resourceDiscovery`, `consoleUrl`); account probe grammar (`authMode: "bearer"` + `tokenEnv`, or `emailEnv`+`keyEnv` basic pair, optional `fallback` project probe, optional `aliasEnv`, optional `baseUrlEnv` override); row builders (`makeMarketplaceProviderRow`, `makeMarketplaceProductRow`, `makeUpstashProductRow`, `makeVercelProductRow`); upserts (`withMarketplaceProviderRegistry`, `withMarketplaceProductRegistry`, `withRegistryProductRowUpsert`); lane helpers (`listInstalledDataProducts`, `resolveInboundMethodProducts`, `listProviderProductReadiness`); `deriveWorkspaceAddOnsState` capability derivation |
| `lib/server-secrets.js` | `readServerSecret` / `readEnvVar` / `resolveRequiredEnv` — the ONLY way secrets are read; rows and payloads carry env-ref NAMES only |
| `app/api/workspace/add-ons/providers/[providerId]/credentials/route.js` | generic account verify: `providerAccountAuthMode` gate → `handleBearerCredentials` (token, team scope, `accountProbe.fallback` project probe, `aliasEnv` writes) or the basic pair lane; `writeLocalEnv` → `.env.local` only; provider row upsert + receipt |
| `app/api/workspace/add-ons/providers/[providerId]/sync/route.js` | provider account re-probe (`probeBearerProviderAccount` incl. fallback), honest `setup-required` / blocked receipts |
| `app/api/workspace/add-ons/providers/[providerId]/products/sync/route.js` | product install: readiness gate → `probeJsonPaths` (Bearer + optional `tokenHeaderName`, optional `teamId` query) → `withMarketplaceProductRegistry` → receipt; `resolveEnvFromResourceMappings` delegation (`lib/provider-resource-discovery.js`) |
| `app/api/workspace/add-ons/providers/[providerId]/products/[productId]/resources/route.js` | resource discovery via `resolveProviderAccountAuth` — mode-aware, provider-contract-driven, no per-provider forks |
| `app/api/workspace/add-ons/[providerId]/schedule/route.js` and `app/api/workspace/add-ons/[providerId]/data/route.js` | the "one governed door per lane" class: GET read-only state, POST one receipted action per call, DELETE unbind; operator-gated; every outcome (including blocked) receipted to `workspace:agent-outcomes` |
| `app/components/WorkspaceAddOnsMarketplace.jsx` | the ENTIRE customer install journey: provider grid card states, install card + `accountSetupFields` rendering, `providerSetupNeedsCredentials`/`providerSetupReady` enablement, install-path nav (Install → Setup → Login/Auth → Sync), product gating behind provider connect, install drawer ("Install product"), manage drawer, console links |
| `app/settings/apps/page.jsx` | `attachExternalAppLinks` — external app links derive from GOVERNED ROWS (vercel-projects rows, app-registry row fields, `listInstalledDataProducts` rows via `dataProductLink`), icon per provider, dedupe by provider+URL, popover label/detail |
| `app/workflows/WorkflowSurface.jsx`, `app/data-model/components/OrchestrationNodeConfigPanel.jsx`, `lib/orchestration-graph.js`, `lib/orchestration-graph-runner.js` | ONLY if the provider adds an executing canvas node: palette entry, config panel branch + `tabsForType`, `KNOWN_NODE_TYPES`, runner executor + dispatch, redaction (`redactSecretsFromText`), `adapterMeta` carries ref slugs never values |
| `lib/workspace-data-model.js` | `OBJECT_TYPE_PRESETS` — especially `data-source` (registryId/sourceId/status/lastTested + `resolver-binding` relation to api-registry) and `app-surface` |
| `lib/workspace-outcome-receipts.js` | `appendOutcomeReceipt` + existing `workspace-add-on-*` receipt kinds — reuse the naming class |
| `scripts/unit-workspace-add-ons-vercel.test.mjs`, `scripts/unit-workspace-add-ons-supabase.test.mjs`, `scripts/unit-supabase-provider-hardening.test.mjs` | the test SHAPE to mirror: row-builder unit tests, lane derivation tests, secret-absence assertions, and source-truth assertions that read the route/page files and assert the contract survives refactors |

Recon commands (fast):

```bash
grep -n "MARKETPLACE_PROVIDERS" <kit>/lib/workspace-add-ons.js
grep -rn "executionLane" <kit>/lib/workspace-add-ons.js | sort -u
grep -rn "appendOutcomeReceipt" <kit>/app/api/workspace/add-ons | cut -d: -f1 | sort -u
grep -n "attachExternalAppLinks\|dataProductLink\|linkFromAppRow" <kit>/app/settings/apps/page.jsx
```

---

## Phase 1 — Provider definition (the only truly new data)

Everything provider-specific lives in ONE place: the provider entry in
`MARKETPLACE_PROVIDERS` plus its `*_PRODUCTS` array. Lock identity first
and keep it stable across every surface:

- `providerId` (kebab), `integrationId` (`<provider>-provider`), `authRef`
  (SCREAMING case, drives `readServerSecret` candidate expansion).
- Concrete env keys (`<PROVIDER>_URL`, `<PROVIDER>_API_KEY`, …) that already
  resolve through `lib/server-secrets.js` with zero changes.
- Products: `productId`/`integrationId`, `connectorKind`, and an
  `executionLane` — reuse an existing lane if the capability class exists
  (`serverless-scheduler`, `workspace-data`, `workspace-deployments`,
  `workspace-retrieval`, `inbound-webhook`, `api-request`); only mint a new
  lane string for a genuinely new capability class, and then every cockpit /
  canvas / apps-link surface must detect by THAT lane, never by providerId.
- Account probe: use `authMode: "bearer"` + `tokenEnv` (Vercel/Supabase
  class) or the basic `emailEnv`/`keyEnv` pair (Upstash class). Optional:
  `fallback` (direct project probe when no management token — Supabase),
  `aliasEnv` (alias env writes so the canonical `authRef` expansion resolves
  the product key), `baseUrlEnv` (self-hosted/offline-QA override),
  `teamEnv` (team-scoped tokens).
- `accountSetupFields` with `credentialRole`s (`bearerToken`, `teamScope`,
  `baseUrl`, `secret`, `basicAuthUsername`, `basicAuthPassword`) — the
  install card renders these generically; secret-bearing fields must be
  `type: "password"`.
- Product `probe` (`baseUrlEnv`, `tokenEnv`, `paths`, optional
  `tokenHeaderName` when the gateway reads a named header — Supabase's
  `apikey`) and `resourceDiscovery` (`auth: "provider-basic" | "provider-bearer"`,
  `paths`, `envFromResource` mappings: `urlTemplate` / `fromPath` +
  `matchField`/`matchValue` / `fieldCandidates`, `optional`).

Use the CURRENT external API of the real provider: read their latest REST
endpoint docs and encode the real paths (`/v1/projects`, `/v9/projects`,
`/rest/v1/`) and the real payload field names in `envFromResource`
mappings. Do not guess from memory — verify against the provider's live
API reference at implementation time.

**Rules that are never negotiable:**

1. Secrets live in `.env.local` / runtime env only. Rows, receipts,
   payloads, `adapterMeta`, and browser responses carry env-ref NAMES.
2. No new account-detection keys (`authMode` is the grammar), no competing
   row builders, no per-provider forks of the generic routes.
3. Server-side verification only — the browser never holds or sends a
   provider token anywhere except into the credentials route once.

---

## Phase 2 — Server lanes (what you should NOT need to write)

For a standard provider, **zero new routes** are required: credentials,
provider sync, product sync/install, and resource discovery are generic and
read the provider contract. If the account flow needs a new shape, extend
the generic lane behind a declared contract key (as `fallback` and
`aliasEnv` were added) so every future provider inherits it.

Add a provider-scoped action route ONLY when the lane itself is new (the
way `add-ons/[providerId]/schedule` owns scheduler binding and
`add-ons/[providerId]/data` owns external-table sync). That route class:

- `GET` read-only state; `POST` one governed action per call; `DELETE`
  unbind. Every handler operator-gated (`requireWorkspaceOperator`).
- Canonical sequence per action: `readWorkspaceConfig` → pure helper (in a
  `lib/*.js` module with offline unit tests) → `writeWorkspaceConfig` →
  `appendOutcomeReceipt` (including `outcomeStatus: "blocked"` receipts on
  refusals).
- Destructive external operations must be guarded before any request
  (e.g. filterless update/delete refused in the `supabase-data` executor).

---

## Phase 3 — Governed rows and Data Model interaction

The API Registry object (`objectType: "api-registry"`) is the single
capability ledger:

- Provider row: `integrationId: <provider>-provider`, `status: "connected"`,
  `syncStatus: "verified"`, `syncProof` naming the live probe
  (`GET <path> -> HTTP <status>`), account options/selection — via
  `withMarketplaceProviderRegistry`.
- Product row: built by `makeMarketplaceProductRow` (or the provider's
  dedicated builder if it has region/remote-resource semantics), carrying
  `executionLane`, `resolvedEnv` names, `baseUrl`, `resolverTemplateId`,
  `authHeaderName` when declared, `syncProof`/`syncCheckedAt` — via
  `withMarketplaceProductRegistry` → `withRegistryProductRowUpsert`
  (idempotent by `integrationId`).

External records become governed objects on the EXISTING presets — e.g.
external tables install as `data-source` objects
(`lib/workspace-external-sync.js` → `buildExternalTableObject`) carrying the
correlation spine: `registryId`/`integrationId` → api-registry row,
`externalTable`, `correlationKey`, and closed-loop stamps
(`lastSyncStatus`, `lastSyncedAt`, `lastSyncReceiptId`, `lastSyncSummary`
like `push apps · HTTP 201 · 3 pulled · 3 pushed · 2 matched`).

Oversight surface: `/settings/apps`. Installed + verified rows derive an
external link on the workspace app through `attachExternalAppLinks` —
provider icon, state-aware label, host/detail popover, deduped by
provider+URL. Follow `dataProductLink`: derive the console deep-link from
the row's `baseUrl` (e.g. `https://supabase.com/dashboard/project/<ref>`),
never store a separate copy of state. **Do not build a new cockpit or a
helper slash-command view for oversight** — that was explicitly removed in
favor of this surface.

---

## Phase 4 — Every UI state / customer touch point (the checklist)

Each of these must render correctly in BOTH the clean (no credentials) and
active states, and gets a screenshot in Phase 7:

1. Marketplace provider grid: card with real icon, products label, state
   line (`Provider setup required` → `Setup opened` → `Verified · N
   installed products`).
2. Install card: heading `Install <Provider>`, authRef chip (name only),
   every `accountSetupFields` input (secrets as password), install-path nav
   (Install / Setup / Login/Auth / Sync), verify button DISABLED until
   required values exist.
3. Honest failure: wrong/unreachable credentials → server probe → HTTP 422
   → visible message (`… could not be verified`), no crash, nothing
   persisted.
4. Product cards gated until the provider row is connected (same gate for
   every provider).
5. Install drawer → `Install product` → live read-probe → installed card
   with verified state + manage drawer + console link (+ `/settings/apps`
   link for data-lane products).
6. `/data-model?object=api-registry`: the registry table shows the rows.
7. `/settings/apps`: no icon pre-install; exactly one deduped icon
   post-install with hover popover above the card (never clipped).
8. Canvas (executing lanes only): palette entry, config panel, node trace,
   redacted errors.

---

## Phase 5 — Icons (real-world brand assets, not crammed)

- Files: `public/integrations/<provider>/provider.png` plus one PNG per
  product. Both the marketplace and `/settings/apps` read them.
- Standard: **448×448 circular badge** (matches the shipped Vercel badge) —
  brand-dark or brand-white disc filling the canvas, the official brand
  glyph centered at **~56% of the badge size**, transparent corners outside
  the circle. Never ship an edge-to-edge glyph — it renders crammed inside
  the round icon chips.
- Use the provider's real, current brand mark (brand-assets page of the
  provider). If only a raw glyph is available, compose the badge headlessly
  with the pre-installed Chromium:

```js
// render-badge.mjs — HTML → PNG badge with correct inset
const html = `<div id="b" style="width:448px;height:448px;border-radius:50%;
  background:#1c1c1c;display:flex;align-items:center;justify-content:center">
  <img src="data:image/png;base64,${glyphB64}" style="width:56%;height:56%;object-fit:contain"/></div>`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 460, height: 460 } });
await page.setContent(html);
await page.locator("#b").screenshot({ path: "provider.png", omitBackground: true });
```

---

## Phase 6 — Tests, CI, and release gates

Mirror the shipped suites; every new provider adds:

1. `scripts/unit-workspace-add-ons-<provider>.test.mjs` — identity/grammar
   assertions (lane, env keys, `authMode`), row builders (verified +
   missing-env states), upsert idempotency, `deriveWorkspaceAddOnsState`
   capability, **secret-absence** (`JSON.stringify(row)` never contains the
   token), and source-truth assertions on any page/route the provider
   touches (read the file, assert the contract strings).
2. Pure-core suites for any new `lib/*.js` (offline, injected fetch — see
   `lib/provider-resource-discovery.js` + its hardening suite).
3. Wire root `package.json` `test:*` scripts AND the CI job block in
   `.github/workflows/ci.yml` (see the "Validate Supabase provider" step).
4. Version lockstep: bump `cli/package.json` +
   `packages/create-growthub-local/package.json` + the dependency pin
   together; `node scripts/check-version-sync.mjs
   --require-bump-if-source-changed` must pass.
5. Gates before push: `pnpm check:worker-kits`, `pnpm
   check:monorepo-boundary`, `node scripts/check-resolver-registry.mjs`,
   `bash scripts/freeze-check.sh`, `bash scripts/pr-ready.sh`.

---

## Phase 7 — Real-world browser QA (the proof bar — non-negotiable)

Tests alone do not close a provider. Prove it as a real user, in a real
browser, on a real boot, with screenshots:

1. **Boot the canonical export** — `node scripts/export-seed-workspace.mjs`
   → activation 5/5, cockpit spine 100, `next dev` on `:3777`,
   `GET /api/workspace` → 200. Never QA against the repo tree.
2. **Drive Chromium via playwright-core** (`executablePath:
   "/opt/pw-browsers/chromium"`, `NO_PROXY=127.0.0.1`). Script the run —
   every assertion is a pass/fail line, every state a PNG.
3. **Clean states first** (no credentials): grid card, install card,
   disabled verify, gated products, empty `/settings/apps`.
4. **Honest failure**: submit fake credentials THROUGH THE UI → assert the
   real route returns 422 AND the message renders.
5. **Closed loop against a protocol-shaped local mock** (the Supabase run
   used a PostgREST-shaped `node:http` server: OpenAPI root + table GET +
   merge-duplicates POST + 401 on bad `apikey`):
   connect through the UI (live probe → 200) → install through the UI →
   registry rows in the Data Model table (`/data-model?object=api-registry`)
   → lane actions through the governed door (e.g. `install-object` → pull →
   governed PATCH → `push` with pull-merge verify) → assert the external
   side received the workspace record AND the sync stamps + receipt ids
   landed on the object → live `/settings/apps` icon derived from the real
   rows → tampered credential → 401.
6. **Secret grep**: the config and every API response in the run must never
   contain the credential value.
7. **Deliver the screenshots** — clean, failure, connected, installed,
   registry table, mirrored object table, apps icon + popover hover.

Useful deep links for drivers: `/settings/add-ons?provider=<id>`,
`/data-model?object=<objectId>`, `/data-model?helper=open`.

---

## Future-agent TODO ledger (Supabase V1 + platform)

Deferred with intent — pick these up as their own governed releases:

- Live Supabase Management-API smoke with a real `sbp_` token (the mapping
  core is offline-proven; needs a super-admin one-time run).
- Scheduler-driven continuous sync (QStash lane triggering `pull` on the
  data door), Supabase Realtime, Storage/Edge Function products.
- Relationship import and conflict auto-resolution policies for external
  tables (today: pull ⇒ external wins, push ⇒ local wins, conflicts
  reported + receipted).
- API-driven project creation for providers whose consoles support it.
- Additional data providers on the `workspace-data` lane (Neon, Planetscale,
  Turso class) — they should require ONLY Phase 1 + icons + tests if this
  playbook holds; any needed generic-lane extension is a contract key, not
  a fork.

## Final-edit checklist before opening the PR

- [ ] Provider + products defined once in `workspace-add-ons.js`; exported
      constants added to the export block (no duplicate export names).
- [ ] Icons: circular badges, provider + per-product, loading (HTTP 200) on
      grid, install card, and `/settings/apps`.
- [ ] All generic lanes verified untouched for existing providers (run the
      Vercel + Upstash + inbound suites).
- [ ] New suites green; CI wired; version lockstep bumped; all gates green.
- [ ] Browser proof executed on a fresh export with screenshots delivered.
- [ ] Docs: provider section added to `docs/OFFICIAL_MARKETPLACE_PLUGINS_V1.md`
      (identity, lanes, validated capability, deferred list).
- [ ] No new persistence backends, no browser-held secrets, no parallel
      oversight surfaces, no auto-merge of release state.
