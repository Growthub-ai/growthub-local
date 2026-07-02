# Official Supabase Provider V1 — Implementation Plan (Phase 0 Intent)

Supabase as the next official marketplace provider: governed registration,
bearer resource discovery, a constructed (never hand-written) resolver through
the Unified Resolver Registry, Supabase tables as `data-source` business
objects, one new `supabase-data` canvas node, and receipted two-way sync
(pull = existing resolver/refresh lane, push = one provider-scoped governed
action route). Additive only; every path reuses the shipped governed surfaces.

Base: `origin/main` @ `f1e6a8c` (v0.14.11). Branch:
`claude/supabase-marketplace-provider-es6srf`.

---

## 1. Source-truth current state (verified on f1e6a8c)

- **Marketplace registry**: `apps/workspace/lib/workspace-add-ons.js` —
  `MARKETPLACE_PROVIDERS` (Upstash only, line 169), product grammar
  (`productId`, `integrationId`, `authRef`, `requiredEnv`, `probe`,
  `resourceDiscovery`, `connectorKind`, `executionLane`), registry-row
  builders `makeMarketplaceProviderRow` / `makeUpstashProductRow`, upserts
  `withMarketplaceProviderRegistry` / `withMarketplaceProductRegistry`
  (non-Upstash fallback is a no-op at line 765-770), readiness
  `listProviderProductReadiness` (line 655).
- **Secrets**: `lib/server-secrets.js` — canonical `readServerSecret` /
  `readEnvVar` / `resolveRequiredEnv`; concrete `SUPABASE_*` keys already
  resolve with zero changes.
- **Discovery routes**: `app/api/workspace/add-ons/providers/[providerId]/…`
  — resources route builds **Basic-only** auth from
  `provider.accountProbe.emailEnv/keyEnv` (`resources/route.js:126-145`);
  `products/sync/route.js:144` gates `resolveProviderResource` on
  `auth === "provider-basic"`; `credentials/route.js` verifies live, writes
  secrets to `.env.local` only (`writeLocalEnv`, lines 162-183), persists
  env-ref names on rows, never values.
- **Canvas runtime**: `lib/orchestration-graph.js:12-27` `KNOWN_NODE_TYPES`
  (14 types); the only executing HTTP node is `api-registry-call` via
  `executeApiRegistryCall` (`lib/orchestration-graph-runner.js:142-266`,
  single-header auth via `buildAuthHeaders`); dispatch in
  `runOrchestrationGraphIfPresent` (:277-406); execution enters through
  `POST /api/workspace/sandbox-run` which emits the `sandbox-run` receipt
  (`sandbox-run/route.js:768-783`). Palette:
  `WorkflowSurface.jsx:409-439` (`WORKFLOW_ACTION_GROUPS`); config panels:
  `OrchestrationNodeConfigPanel.jsx` type-keyed branches + `tabsForType`
  (:639-644). **There is no Upstash Redis canvas data node** — `data-action`
  / `core-action` / `flow-control` palette nodes have no runner branch
  (authoring-only).
- **Data Model subatomic types**: `lib/workspace-data-model.js`
  `OBJECT_TYPE_PRESETS` (:791-968). `data-source` preset carries `registryId`,
  `sourceId`, `sourceStorage`, `resolverTemplateId`, `entityType`, `status`,
  `lastTested`, `lastResponse` and a built-in `resolver-binding` relation to
  `api-registry` (`valueField: integrationId`). The `sandbox-environment`
  scheduler relation text already names Supabase Edge URLs as a serverless
  target (:930).
- **Unified Resolver Registry V1 (contract v1.5.1)**: resolvers are
  **constructed** from a tested response shape (`lib/resolver-constructor.js`)
  and correlated to their registry row in the `GET /api/workspace/resolvers`
  index; each registered resolver is addressable at
  `/api/resolvers/<integrationId>`; `_registry.generated.json` /
  `_endpoints.generated.json` are projections, never hand-edited
  (`scripts/check-resolver-registry.mjs` drift guard).
- **Receipts**: `lib/workspace-outcome-receipts.js` `appendOutcomeReceipt`
  (:113-139), stream `workspace:agent-outcomes`, hash-chained; add-on kinds
  in use: `workspace-add-on-provider-connect/-credentials/-sync`,
  `workspace-add-on-sync`, `workspace-add-on-schedule*`,
  `workspace-scheduled-run`.
- **Boot loop**: `scripts/export-seed-workspace.mjs` (export → seed →
  validate → `npm install` → `next dev --webpack` on :3777). MCP console:
  `growthub serve --mcp` — Intelligence reads / `preflight_patch` dry-run /
  `next_actions` hand-off (`docs/GOVERNED_MCP_CONSOLE_V1.md`).
- **Regression on f1e6a8c**: `lib/workspace-config.js:582`
  (`connectPostgres` → `await import("pg")`, landed in f1e6a8c) fails
  module resolution in fresh exports because the kit `package.json` has no
  `pg` dependency → `/api/workspace` 500s and `export-seed-workspace.mjs`
  cannot reach ready. Reproduced with the canonical script; installing `pg`
  in the export clears the module error.

## 2. Gap analysis

| Finding | Category |
| --- | --- |
| Provider/product grammar, env resolution, receipts, add-ons UI flow | Already Exists — reuse verbatim |
| Generic provider registry helpers (`withMarketplaceProviderRegistry`, readiness) | Already Exists |
| Non-Upstash product upsert fallback | Partially Exists — no-op body; PR #263 fills it (`withRegistryProductRowUpsert`) |
| Resource discovery auth modes | Partially Exists — `provider-basic` only; bearer mode Missing |
| Executing canvas data node with multi-header auth | Missing — `api-registry-call` is single-header; nothing else executes |
| Supabase resolver | Missing as artifact — but the construction lane Already Exists (resolver constructor); no hand-written resolver is permitted |
| Supabase tables as governed business objects | Already Exists as type (`data-source` preset) — Missing only the install affordance |
| Outbound push (workspace → external DB) | Missing — Proposed as one provider-scoped action route (same class as `add-ons/[providerId]/schedule`) |
| Fresh-export boot on f1e6a8c | Regressed — `pg` dependency Missing from kit package.json |

## 3. Locked identity & cross-PR compatibility

Adopt PR #260's Supabase identity verbatim so both efforts reconcile to one
row set: `providerId: "supabase"`, `integrationId: "supabase-provider"`,
`authRef: "SUPABASE"`, product `supabase-postgrest`
(`connectorKind: "supabase-data"`), `requiredEnv: ["SUPABASE_URL",
"SUPABASE_SERVICE_ROLE_KEY"]`, optional `SUPABASE_ANON_KEY`,
`SUPABASE_ACCESS_TOKEN` (management discovery only).

Execution lanes: product `workspace-data`, provider row `workspace-provider`.
Never `inbound-webhook` / `api-request` — PR #263 classifies inbound trigger
products by those lane strings (`isInboundInvocationProduct`).

Known rebase hotspots vs #263 (base f1e6a8c, feature-only): the
`MARKETPLACE_PROVIDERS` array tail, `withMarketplaceProductRegistry`
fallback, the `export {}` block, and the `WorkflowSurface.jsx` input-trigger
region. On rebase, adopt #263's `makeMarketplaceProductRow({...})` (object
arg) + `withRegistryProductRowUpsert` rather than adding a competing generic
helper. #263 also restores `export { POST }` on `workflow/publish` — do not
duplicate.

## 4. Implementation phases (dependency-ordered; each phase = one commit; gates are acceptance criteria, not timelines)

### T1 — Restore boot truth (blocker for all downstream proof)
- `apps/workspace/package.json`: add `pg` to `dependencies` (the f1e6a8c
  persistence lane's missing dep).
- Gate: `node scripts/export-seed-workspace.mjs` reaches ready;
  `GET /api/workspace` 200 on the fresh export.

### T2 — Provider + product registration (Upstash parity)
- `lib/workspace-add-ons.js`: `SUPABASE_PRODUCTS` + provider entry;
  product probe `{ baseUrlEnv: "SUPABASE_URL", tokenEnv:
  "SUPABASE_SERVICE_ROLE_KEY", paths: ["/rest/v1/"] }` (PostgREST needs
  `apikey` + `Authorization: Bearer` — probe helper gains an
  `authScheme: "supabase"` header shape); `resourceDiscovery` per T3;
  `entityTypes: "table,record,postgres"`; export new names.
- `public/integrations/supabase/*.png` icons; marketplace UI groups render
  from the registry (no hardcoded provider list edits beyond the entry).
- `scripts/unit-workspace-add-ons-supabase.test.mjs`: readiness matrix,
  env-ref-only row contract, probe shape, registry upsert round-trip.
- Gate: provider + product rows render in Add-ons and API Registry with
  env-refs only; readiness flips on injected env.

### T3 — Bearer discovery + credentials
- `resources/route.js`: branch on `product.resourceDiscovery.auth` —
  keep `provider-basic`, add `provider-bearer` (token from
  `provider.accountProbe.tokenEnv`); Supabase paths `["/v1/projects"]`
  against `https://api.supabase.com`.
- `products/sync/route.js` `resolveProviderResource`: same mode branch;
  `envFromResource` maps project ref → `SUPABASE_URL`
  (`https://<ref>.supabase.co`) and `/v1/projects/{ref}/api-keys` → key envs.
- `credentials/route.js`: support single-token `accountSetupFields`
  (`credentialRole: "bearerToken"`) alongside the basic pair; manual
  URL + service-key fallback fields on the provider entry; `.env.local`
  write + env-ref rows unchanged.
- Gate: live probe verifies against a real project; discovery lists projects
  with a real `sbp_` token; no secret value in any row/receipt/response.

### T4 — Constructed resolver through the Unified Resolver Registry (pull atom)
- No hand-authored resolver file, no template hardcoding. The
  `supabase-postgrest` row is tested through the existing lane
  (`test-api-record` → `GET {SUPABASE_URL}/rest/v1/{table}` with
  `apikey` + `Bearer` resolved by `server-secrets.js`), and the registry
  **constructor flow** (`lib/resolver-constructor.js`) builds the governed
  resolver from the tested response shape.
- Only permitted code change: if the constructor's shape inference does not
  already handle a PostgREST top-level JSON array of records, add that one
  inference case on the shared path (not a Supabase branch), covered in the
  existing resolver-registry unit suite.
- Gate: `GET /api/workspace/resolvers` index correlates the Supabase row
  (registered/tested, shape, score, endpoint);
  `/api/resolvers/supabase-postgrest` serves records;
  `scripts/check-resolver-registry.mjs` green (generated artifacts remain
  projections).

### T5 — Supabase tables as `data-source` business objects (inbound sync)
- Add-ons install affordance (existing governed creation path — helper
  `create_object` proposal or the typed-object creation flow) creates one
  `data-source` object per selected table: `registryId =
  supabase-postgrest`, `resolverTemplateId`, `entityType = <table>`,
  `sourceStorage = source-records`.
- Pull/refresh = the existing resolver/refresh lane hydrating source records
  into rows; the preset's built-in `resolver-binding` relation renders the
  link to the registry row; Workspace Map picks the object up from the
  metadata graph with no map changes.
- Gate: refresh pulls live table rows into Data Model; `sourceId` /
  `lastTested` / `lastResponse` stamped; zero new mutation surface used.

### T6 — `supabase-data` canvas node (write atom; five insertion points)
1. `lib/orchestration-graph.js:12-27` — add `"supabase-data"` to
   `KNOWN_NODE_TYPES`.
2. `WorkflowSurface.jsx:409-439` — palette entry (Data group), operations
   select/insert/update/upsert/delete/rpc; defaults in `makeWorkflowNode`.
3. `OrchestrationNodeConfigPanel.jsx` — config branch (registry-row binding
   via `registryId`, table, operation, filter/body mapping with
   `{{input.*}}` substitution, `Prefer` return handling) + `tabsForType`.
4. `lib/orchestration-graph-runner.js` — `executeSupabaseData` modeled on
   `executeApiRegistryCall`: resolve row → `readEnvVar("SUPABASE_URL")` +
   `readServerSecret("SUPABASE")` server-side → PostgREST call with
   `apikey` + `Bearer` + operation-mapped method/`Prefer` → redacted
   structured result; dispatch stage in `runOrchestrationGraphIfPresent`.
5. Receipts: none new — runs land in the existing `sandbox-run` receipt with
   node trace; correlation via `sandboxRecordRef`.
- `scripts/unit-supabase-data-node.test.mjs`: mock-fetch executor tests —
  auth headers, operation → method/`Prefer` matrix, substitution, secret
  redaction, never-throws, timeout.
- Gate: node configures in canvas, executes through `sandbox-run`,
  structured result + receipt + `lastResponse` on the owning row.

### T7 — Outbound push + reconcile (two-way close)
- `app/api/workspace/add-ons/supabase/data-sync/route.js` — operator-gated
  action route in the exact class of the shipped
  `add-ons/[providerId]/schedule/route.js`: read config → compute row deltas
  for the target `data-source` object (correlation column default `Name`,
  override via the object's `fieldSettings`) → PostgREST upsert/delete
  server-side → re-pull through the T4 constructed resolver → stamp
  `status` / `lastTested` / `lastResponse` / `sourceId` on the object.
  Sync state lives in the columns the `data-source` preset already defines —
  no new contract field, no new object type, no PATCH allowlist change.
- Receipt kind `workspace-add-on-data-sync` (existing `workspace-add-on-*`
  family): before/after and conflicts in `objectRefs` / `changedFields`;
  conflicts surface as status, never silent overwrite.
- UI: "Sync now" + status pill on the `data-source` object header in Data
  Model (reads existing columns; no new drawer surface).
- `scripts/unit-workspace-external-sync.test.mjs` for the pure delta/conflict
  helpers (pure lib `lib/workspace-external-sync.js`, never-throws,
  env-injectable).
- Gate: create/update a row in Data Model → appears in Supabase; external
  edit → pulled with correlation; conflict visible; receipts carry
  before/after proof.

### T8 — Docs, gates, release
- `docs/OFFICIAL_MARKETPLACE_PLUGINS_V1.md`: Supabase provider + product
  section (parity language with Upstash; honest deferred scope).
- Lockstep version bump `cli/package.json` +
  `packages/create-growthub-local/package.json` (matching pin). Asset-only
  kit change ⇒ **no dist rebuild**.
- Gates: `bash scripts/freeze-check.sh`,
  `node scripts/check-version-sync.mjs --require-bump-if-source-changed
  --base origin/main --head HEAD`, `node scripts/check-worker-kits.mjs`,
  `node scripts/check-resolver-registry.mjs`,
  `node scripts/release-check.mjs`, `pnpm check:monorepo-boundary`, full
  unit suites.
- Product smoke on the booted export (`export-seed-workspace.mjs`), driving
  the journey: Add-ons connect → discover → install table object → refresh
  pull → canvas node run → push sync → receipts → Workspace Map. MCP console
  (`growthub serve --mcp --live`) used for reads/preflight only.
- Frozen-snapshot commit message (L1–L5), squash-ready, PR held in draft
  until the interactive smoke is signed off.

## 5. Runtime implications

No new runtime, no third mutation path. Config writes: PATCH lane and the
already-shipped operator-gated add-on route class. Execution: `sandbox-run`
only. Secrets: `.env.local` + server-side resolution only. Data Model remains
object authority; Canvas remains graph authority; resolver registry remains
the only API→rows abstraction; receipts remain the audit spine.

## 6. Validation checklist (author + adversarial reviewer)

- [ ] Fresh export boots on the branch (T1) — `/api/workspace` 200
- [ ] `listProviderProductReadiness("supabase")` correct; env-ref-only rows
- [ ] Live probe + bearer discovery against a real Supabase project
- [ ] Resolver constructed (not authored); registry index correlated; drift
      guard green
- [ ] Table rows pull into a `data-source` object via the existing refresh lane
- [ ] `supabase-data` node executes with receipt + row proof
- [ ] Two-way example round-trips with correlation and visible conflicts
- [ ] No secret values anywhere in config/rows/receipts/responses
- [ ] CI smoke/validate/verify green; all repo gate scripts pass
- [ ] Docs updated and honest; deferred scope explicit

## 7. Deferred scope (explicit)

Continuous/scheduled sync (wire the existing scheduler lane to the data-sync
route), Supabase Realtime subscriptions, Storage/Edge Function products,
join/relationship import, conflict auto-resolution policies.

## 8. Anti-patterns (forbidden)

Hand-written resolver files or edits to generated registry artifacts; client-
side Supabase SDK calls; secret persistence in rows/receipts/config; a second
mutation lane or PATCH allowlist widening; authoring-only nodes that pretend
to run; duplicate generic helpers that collide with PR #263/#260; trigger-lane
strings on data products; fake sync status not backed by receipts.
