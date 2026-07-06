# Obsidian Add-On Topology & Capabilities V1 — the vault as a governed `workspace-data` brain

Phase-0 intent + topology plan for shipping **Obsidian** as an official
marketplace provider at Supabase parity: a second occupant of the existing
`workspace-data` lane whose external "tables" are vault folders and whose
records are Markdown notes. Custom install products — **Marginalia
Collection**, **Glossary Backbone**, **Master Index** — bind the vault's
three knowledge layers into governed `data-source` objects on the same
correlation spine the Supabase PostgREST integration already uses.

This document is the contract intent, not the code. It enters the platform
through [`docs/MARKETPLACE_PROVIDER_PLAYBOOK_V1.md`](./MARKETPLACE_PROVIDER_PLAYBOOK_V1.md)
(Phase 0 recon → grammar-only definition → governed rows → icons → tests →
real-browser closed-loop proof) and the
[`growthub-marketplace-provider`](../.claude/skills/growthub-marketplace-provider/SKILL.md)
skill. Every grammar fact below was read from source at the `f758785`
release (`feat: marketplace provider stack and GTM OS template`); where the
source has since moved on, the source wins.

Read side-by-side:

- [`docs/SUPABASE_ADD_ON_TOPOLOGY_AND_CAPABILITIES_V1.md`](./SUPABASE_ADD_ON_TOPOLOGY_AND_CAPABILITIES_V1.md) — the reference data brain.
- [`docs/MARKETPLACE_PLUGIN_VALUE_ROADMAP_V1.md`](./MARKETPLACE_PLUGIN_VALUE_ROADMAP_V1.md) — the compounding-loop / lane-genericity argument.
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) and [`docs/OPERATING_THE_GOVERNED_UNIVERSE_V1.md`](./OPERATING_THE_GOVERNED_UNIVERSE_V1.md) — the three-layer control plane.

Kit root for all paths below:
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`.

---

## 0. The one architectural fact that shapes everything: Obsidian is local-first

Unlike every provider shipped so far (Supabase, Vercel, Neon, Stripe, Resend,
Cloudflare — all hosted cloud REST APIs reachable from anywhere), **Obsidian
has no hosted cloud API**. Obsidian Sync and Publish are proprietary with no
public surface. The real, current, officially-maintained REST surface in 2026
is the **Local REST API (with MCP)** community plugin, which runs *inside the
user's Obsidian app*:

- Base URL: `https://127.0.0.1:27124` (HTTPS, **self-signed cert**); HTTP on
  `27123` exists but is off by default.
- Auth: `Authorization: Bearer <api-key>` — the key is generated in
  *Settings → Local REST API with MCP*. Single bearer token, no OAuth.
- Endpoints (verify the exact set against the plugin's live API reference at
  implementation time — this is the Phase-1 "encode the REAL endpoints" rule):
  - `GET /` — status/probe: returns `authenticated`, service name, and
    Obsidian + plugin versions.
  - `GET /vault/` and `GET /vault/{dir}/` — list files/folders (a folder is a
    "table").
  - `GET /vault/{path}` with `Accept: application/vnd.olrapi.note+json` —
    returns `{ path, content, frontmatter, tags, stat }` (frontmatter → row
    columns; `stat.mtime` → drift fingerprint). Plain `Accept` returns raw
    Markdown.
  - `PUT /vault/{path}` (create/replace), `POST` (append), `PATCH` (insert
    relative to heading/block/frontmatter), `DELETE`.
  - `POST /search/` with content-type
    `application/vnd.olrapi.dataview.dql+txt` (Dataview DQL) or
    `application/vnd.olrapi.jsonlogic+json` (JsonLogic) — powers the Master
    Index MOC queries.

**Why this is a clean fit, not a fork:** the local-first reality maps
one-to-one onto grammar keys that *already exist* for exactly this purpose.
`baseUrlEnv` was added as the "self-hosted / offline-QA override" (it is how
Supabase's `SUPABASE_URL` and Vercel's `VERCEL_API_URL` work); Obsidian's
`OBSIDIAN_API_URL` is the same key doing its intended job. `authMode:"bearer"`
+ `tokenEnv` is the same probe grammar as Vercel/Neon/Stripe. **No new
detection key, no route fork.**

**Honest carry caveat (state it, don't hide it — trust is the scalar in the
value function).** The Supabase brain is reachable from the *deployed*
workspace app; the Obsidian vault lives on the operator's machine. The
deployed app can reach it only if the operator exposes the Local REST API at
a routable base URL (tunnel / reverse proxy / self-hosted endpoint) recorded
in `OBSIDIAN_API_URL`. Where that is unacceptable, the fallback is a
git-backed vault mirror the workspace pulls server-side. V1 targets the local
boot + reachable-endpoint case and says so on the row (`syncProof` names the
host); the git-mirror lane is deferred (§9). Self-signed TLS is handled the
same way local QA already handles `127.0.0.1` (`NO_PROXY=127.0.0.1`, permit
the localhost self-signed cert in the server-side probe leg only).

---

## 1. Lane decision — reuse `workspace-data`, mint nothing

The playbook's Nango decision rule: a first-party provider is only worth
shipping when the capability deserves **lane semantics beyond "make API
requests"** — governed actions, a persistence spine, sync stamps, and
business-object binding. Obsidian clears that bar: notes become governed
`data-source` rows with two-way sync and conflict detection, not one-off
requests.

It does **not** justify a new lane. Vault folders are tables, notes are
records, YAML frontmatter is columns — the same shape Supabase Postgres lands
in `WORKSPACE_DATA_LANE = "workspace-data"`. This is the Neon precedent
(second `workspace-data` occupant, zero new lanes) applied to a Markdown
substrate. Shipping Obsidian on `workspace-data` makes the strongest possible
platform statement: **the data lane is substrate-generic — Postgres OR a
Markdown vault resolve through the identical correlation spine.** Cockpits,
canvas, and `/settings/apps` continue to detect capability by the lane
string (`deriveWorkspaceAddOnsState().hasWorkspaceDataCapability`), never by
`providerId`.

Deferred, not V1: a second product family on `workspace-retrieval` (embed the
vault → semantic glossary hover-links and RAG). That is the natural Tier-2
follow-on but requires the embeddings producer; it is out of scope here.

---

## 2. Provider definition (the only genuinely new data — one place)

Everything provider-specific lives in one entry in `MARKETPLACE_PROVIDERS`
plus one `OBSIDIAN_PRODUCTS` array in `lib/workspace-add-ons.js`. Identity,
locked and stable across every surface:

| Field | Value |
| --- | --- |
| `providerId` | `"obsidian"` |
| `integrationId` | `OBSIDIAN_PROVIDER_INTEGRATION_ID = "obsidian-provider"` |
| `authRef` | `OBSIDIAN_AUTH_REF = "OBSIDIAN"` |
| `label` / `developer` | `"Obsidian"` / `"Obsidian"` |
| `iconSrc` | `"/integrations/obsidian/provider.png"` |
| `baseUrl` | `"https://127.0.0.1:27124"` (overridable via `OBSIDIAN_API_URL`) |
| `endpoint` / `method` | `"/"` / `"GET"` |
| `connectorKind` | `"obsidian-provider"` |
| `executionLane` | `"workspace-provider"` (every provider row) |
| `capabilities` | `"provider-account,local-first,marketplace-products"` |
| `entityTypes` | `"provider,marketplace,vault"` |

**Account probe** (bearer grammar, mirrors Vercel/Neon exactly):

```js
accountProbe: {
  authMode: "bearer",
  tokenEnv: "OBSIDIAN_API_KEY",
  baseUrlEnv: "OBSIDIAN_API_URL",   // self-hosted override key that already exists
  paths: ["/"],                     // GET / -> { authenticated:true, versions... }
}
```

**Account setup fields** (env-ref names + `credentialRole`s; the install card
renders these generically — secrets as `type:"password"`):

```js
accountSetupFields: [
  { id: "base-url", label: "Local REST API URL", type: "url",
    envRef: "OBSIDIAN_API_URL", credentialRole: "baseUrl", required: true,
    placeholder: "https://127.0.0.1:27124" },
  { id: "api-key", label: "API Key", type: "password",
    envRef: "OBSIDIAN_API_KEY", credentialRole: "bearerToken", required: true },
]
```

No `tokenHeaderName` (standard `Authorization: Bearer`, unlike Supabase's
`apikey`). No `aliasEnv` needed (the setup fields write the canonical keys
`OBSIDIAN_API_URL` / `OBSIDIAN_API_KEY`, which resolve through
`lib/server-secrets.js` unchanged).

---

## 3. Install products — the three knowledge layers as `workspace-data` products

All three share `authRef:"OBSIDIAN"`, `connectorKind:"obsidian-vault"`,
`resolverTemplateId:"obsidian-vault"`, `executionLane: WORKSPACE_DATA_LANE`,
`requiredEnv:["OBSIDIAN_API_URL","OBSIDIAN_API_KEY"]`. Each carries a `probe`
(read-verification) and `resourceDiscovery` (folder/note selection) pointed
at its vault layer. The `externalTable` is the vault folder; the
`externalCorrelationKey` is the note's frontmatter `id` (fallback: file path).

### 3.1 Marginalia Collection — the annotation hub

```js
{
  productId: "obsidian-marginalia",
  integrationId: "obsidian-marginalia",
  label: "Marginalia Collection", shortLabel: "Marginalia",
  connectorKind: "obsidian-vault", executionLane: WORKSPACE_DATA_LANE,
  entityTypes: "note,marginalia,annotation",
  capabilities: "database,workspace-data,two-way-sync,knowledge",
  endpoint: "/vault/Marginalia/", method: "GET",
  requiredEnv: ["OBSIDIAN_API_URL","OBSIDIAN_API_KEY"],
  probe: { baseUrlEnv: "OBSIDIAN_API_URL", tokenEnv: "OBSIDIAN_API_KEY",
           paths: ["/vault/Marginalia/"] },
  resourceDiscovery: { auth: "provider-bearer", paths: ["/vault/Marginalia/"],
    emptyLabel: "No source notes in Marginalia/ yet",
    envFromResource: [] },   // account token authorizes all notes; selection binds the row
}
```

One Markdown file per source (book/PDF/article). Frontmatter → governed
columns: `source`/title (→ `Name`), `author`, `type`, `quote`, `page`,
`tags`, `note`. The reserved sync columns (`Name`, `externalId`,
`lastSyncedAt`, `registryId`) are appended by the builder; everything else is
derived from the discovered frontmatter keys.

### 3.2 Glossary Backbone — standardized terminology (the semantic-stability layer)

```js
{
  productId: "obsidian-glossary",
  integrationId: "obsidian-glossary",
  label: "Glossary Backbone", shortLabel: "Glossary",
  connectorKind: "obsidian-vault", executionLane: WORKSPACE_DATA_LANE,
  entityTypes: "note,term,definition",
  capabilities: "database,workspace-data,two-way-sync,glossary",
  endpoint: "/vault/Glossary/", method: "GET",
  probe: { baseUrlEnv: "OBSIDIAN_API_URL", tokenEnv: "OBSIDIAN_API_KEY",
           paths: ["/vault/Glossary/"] },
  resourceDiscovery: { auth: "provider-bearer", paths: ["/vault/Glossary/"],
    emptyLabel: "No terms in Glossary/ yet", envFromResource: [] },
}
```

One note per term (`Caffeine.md`). Columns: `term` (→ `Name`), `aliases`,
`definition`, `related`, `tags`. `externalCorrelationKey` = the term title +
aliases. This is the layer that gives the whole workspace semantic stability:
once the glossary is a governed `data-source` object, **every other atom can
join against canonical term rows** — workflow nodes resolve jargon, the Data
Model renders an always-current dictionary, and (deferred) the retrieval lane
turns titles/aliases into hover-links.

### 3.3 Master Index — the central map (Dataview-driven MOC)

```js
{
  productId: "obsidian-master-index",
  integrationId: "obsidian-master-index",
  label: "Master Index", shortLabel: "Index",
  connectorKind: "obsidian-vault", executionLane: WORKSPACE_DATA_LANE,
  entityTypes: "note,moc,index",
  capabilities: "database,workspace-data,index,knowledge-graph",
  endpoint: "/search/", method: "POST",
  requiresProduct: "obsidian-glossary",   // soft-gate: an index needs something to index
  probe: { baseUrlEnv: "OBSIDIAN_API_URL", tokenEnv: "OBSIDIAN_API_KEY",
           paths: ["/vault/"] },
  resourceDiscovery: { auth: "provider-bearer", paths: ["/vault/"],
    emptyLabel: "Vault root empty", envFromResource: [] },
}
```

The Master Index does not scrape a single folder — its records are the result
of **Dataview DQL queries** issued through `POST /search/`
(`application/vnd.olrapi.dataview.dql+txt`), grouping conceptually (People,
Concepts, Projects) rather than by folder. Each MOC entry becomes a governed
row: `group`, `member` (→ `Name`), `path`, `tags`. The index is dynamic — a
scheduled `pull` (§6) re-runs the DQL so the MOC stays current, and its
freshness is a derived state, never a static badge.

---

## 4. Governed rows and the correlation spine (identical to Supabase — the parity claim)

Nothing new here — this is the whole point. Provider + product rows land only
through the existing upserts; external notes become `data-source` objects on
the existing preset.

- **Provider row** via `withMarketplaceProviderRegistry` →
  `makeMarketplaceProviderRow`: `integrationId:"obsidian-provider"`,
  `status:"connected"`, `syncStatus:"verified"`,
  `syncProof:"GET / -> HTTP 200 · Obsidian <ver>"`,
  `executionLane:"workspace-provider"`.
- **Product rows** via `withMarketplaceProductRegistry` →
  `makeMarketplaceProductRow` → `withRegistryProductRowUpsert` (idempotent by
  `integrationId`): each carries `executionLane:"workspace-data"`,
  `resolvedEnv` (names only), `baseUrl`, `resolverTemplateId:"obsidian-vault"`,
  `syncProof:"GET /vault/Glossary/ -> HTTP 200 · N notes"`, `syncCheckedAt`.
  The proof triad `syncStatus:"verified" && syncProof && syncCheckedAt` is
  the verified gate every consumer reads.
- **External notes → `data-source` objects** via the Obsidian analogue of
  `buildExternalTableObject` (see §5): one object per bound folder/query,
  carrying the spine —
  - FK `registryId` → the api-registry product row (the preset's built-in
    `resolver-binding` relation, `valueField:"integrationId"`, renders the
    link),
  - `externalTable` (folder or DQL id), `externalCorrelationKey`,
    `externalRegistryId`,
  - closed-loop stamps `lastSyncedAt`, `lastSyncStatus`, `lastSyncSummary`
    (e.g. `pull Glossary · HTTP 200 · 42 pulled · 3 pushed · 39 matched`),
    `lastSyncReceiptId`, `lastSyncFingerprint`.

**The api-registry object is the federation join table.** `registryId` (on
every data-source object) ↔ `integrationId` (on every api-registry row) is
the single key that federates the vault into every atom of the system. No
parallel ledger, no second oversight surface.

Oversight = `/settings/apps` only. Installed + verified rows derive one
deduped external link via `attachExternalAppLinks`; follow `dataProductLink`
to derive the console deep-link from the row's `baseUrl` (the vault host, or
an `obsidian://` URI) — never store a separate copy of state. **No new
cockpit, no helper slash-command view.**

---

## 5. The one honest extension — an Obsidian record mapper beside the PostgREST one

`lib/workspace-external-sync.js` is pure and Supabase-shaped: `parseOpenApiTables`
reads a PostgREST Swagger 2.0 root. Obsidian returns folder listings + note
JSON, not OpenAPI. So V1 adds a **pure, sibling adapter**
(`lib/workspace-obsidian-vault.js`, offline unit-tested, injected fetch, never
throws) that mirrors the existing pure functions with a Markdown mapper:

- `parseVaultFolder(listing)` → `[{ name, columns }]` (folder → "table",
  frontmatter keys → columns) — the `parseOpenApiTables` analogue.
- `buildVaultNoteObject({ providerId, folder, columns, integrationId,
  correlationKey })` → the **same `data-source` object shape** as
  `buildExternalTableObject` (`objectType:"data-source"`, `source:"Obsidian"`,
  `icon:"BookOpen"`, spine fields identical).
- Reuse verbatim from the existing module: `buildSyncProof`,
  `buildDriftFingerprint` (over `stat.mtime` + content hash),
  `deriveExternalSyncFreshness` (`unbound|never-synced|drifted|conflict|stale|synced`),
  and the merge/conflict logic (pull ⇒ external wins, push ⇒ local wins,
  conflicts reported + receipted, filterless delete refused).

The correlation spine and every stamp stay byte-for-byte the same as
Supabase. Only the record ⇄ row mapper is provider-specific — which is exactly
the seam the playbook says a new data provider should touch.

---

## 6. Sync mechanics — one operator-gated governed door

One new provider-scoped action route, in the class of
`add-ons/[providerId]/data`:
`app/api/workspace/add-ons/obsidian/data/route.js`. `GET` read-only state,
`POST` one receipted action per call, `DELETE` unbind; every handler
`requireWorkspaceOperator`-gated. Canonical sequence per action:
`readWorkspaceConfig` → pure helper in `lib/workspace-obsidian-vault.js` →
`writeWorkspaceConfig` → `appendOutcomeReceipt` (including
`outcomeStatus:"blocked"` on refusals).

- **`install-object`** — bind a folder/DQL to a new `data-source` object.
- **`pull`** — `GET /vault/{folder}/` list → per note
  `GET /vault/{path}` (`Accept: application/vnd.olrapi.note+json`) → parse
  `{frontmatter,tags,content}` → merge into rows (external wins). Master
  Index instead issues the `POST /search/` DQL.
- **`push`** — governed rows → `PUT`/`PATCH /vault/{path}` (local wins);
  filterless delete refused *before* any request and receipted as blocked.
- **conflict** — drift fingerprint diff → conflicts surfaced as object status
  + receipt, never silent overwrite.

Continuous sync reuses the **existing** `serverless-scheduler` lane (Upstash
QStash) to trigger `pull` on a cron — no new scheduler grammar. This is the
"scheduler-driven continuous sync" item from the playbook's TODO ledger,
satisfied by lane reuse.

---

## 7. Federation across atoms — why one install lights up everything

Because every stage consumes governed rows rather than provider-specific
wiring, installing Obsidian is not one feature — it multiplies across the loop
(`event × capability × persistence × operating-surface × trust`):

- **Data Model** — the three `data-source` objects are immediately bindable by
  any existing View widget's Source panel.
- **Workflow canvas** — nodes read glossary/marginalia/index rows through the
  same resolver path any `workspace-data` row uses (no bespoke node required
  for read; an executing write node, if wanted, models on
  `executeApiRegistryCall` and lands in the `sandbox-run` receipt).
- **Lens / MCP console** — the vault is explainable and dry-runnable through
  the existing read + hand-off surfaces the moment the rows exist.
- **`/settings/apps`** — one derived icon from the real rows.
- **Trust** — honest 422 on a wrong key, blocked receipts on refused
  filterless deletes, `syncProof` naming the live probe. The moment the vault
  could be faked, every downstream reader has to re-verify — so honesty is the
  feature that keeps the multiplication from collapsing.

This runs inside the three-layer control plane, unchanged:
**Mutation** (PATCH lane + the single `add-ons/obsidian/data` door) →
**Law** (patch-policy, secret-absence, filterless-delete guard, honest 422
before anything lands) → **Intelligence** (the metadata graph absorbs the
data-source objects; blast radius explains downstream impact). Agents propose,
the platform governs, the graph understands.

---

## 8. Hard rules carried from the playbook (non-negotiable for this provider)

1. Secrets in `.env.local` / runtime env only. Rows, receipts, payloads,
   `adapterMeta`, and browser responses carry env-ref **names**
   (`OBSIDIAN_API_URL`, `OBSIDIAN_API_KEY`). The browser never holds the
   token — it enters the credentials route once, server-side.
2. Mirror, don't invent: no new `authMode`, no competing row builder, no
   per-provider fork of the generic routes, no PATCH-allowlist widening. The
   only new files are one pure lib + one lane door + icons + tests.
3. Every governed action receipts to `workspace:agent-outcomes` — kind family
   `workspace-add-on-obsidian-*` (`-connect`, `-credentials`, `-sync`),
   including blocked outcomes.
4. Detect by lane (`workspace-data`), never by `providerId`.
5. QA as a real user on a real boot with real screenshots (Phase 7). Unit
   tests alone never close a provider.

---

## 9. Deferred with intent (own governed releases later)

- **Serverless carry for the deployed app** — reachable-endpoint contract
  (tunnel / reverse proxy) or the **git-backed vault mirror** pulled
  server-side, so the deployed workspace app reads the vault without the
  operator's machine online.
- **`workspace-retrieval` product family** — embed the vault → semantic
  glossary hover-links and RAG (needs the embeddings producer, e.g. the
  OpenAI candidate).
- **Virtual-linker parity** — auto-link glossary terms across marginalia rows
  inside the Data Model.
- **Canvas write node** (`obsidian-vault` executor) if a workflow needs to
  author notes mid-run, modeled on `executeApiRegistryCall`.
- **Conflict auto-resolution policies** beyond the V1 default (pull ⇒ external
  wins, push ⇒ local wins, conflicts reported).

---

## 10. Build order (Phase 0 is done; this doc is its output)

1. **Phase 1** — provider entry + `OBSIDIAN_PRODUCTS` (§2, §3) in
   `workspace-add-ons.js`; export constants. Verify endpoints against the
   Local REST API live reference.
2. **Phase 2/5** — `lib/workspace-obsidian-vault.js` pure mapper (§5); the
   `add-ons/obsidian/data` door (§6); provider + per-product 448×448 circular
   badge icons under `public/integrations/obsidian/`.
3. **Phase 3/4** — confirm rows land through the existing upserts; walk every
   UI state (clean → honest 422 → connected → installed → registry table →
   mirrored object → `/settings/apps` icon).
4. **Phase 6** — `scripts/unit-workspace-add-ons-obsidian.test.mjs` +
   pure-core suite for the vault mapper (grammar, builders, secret-absence,
   source-truth assertions); wire `test:*` + CI job; version lockstep bump;
   `check:worker-kits`, `check:monorepo-boundary`, `check-resolver-registry`,
   `freeze-check`, `pr-ready`.
5. **Phase 7** — boot `scripts/export-seed-workspace.mjs`, drive
   playwright-core Chromium against a **protocol-shaped local mock of the
   Local REST API** (`node:http`: `GET /` status, `GET /vault/{dir}/` listing,
   `GET /vault/{path}` note JSON, `PUT`/`DELETE`, `POST /search/` DQL, 401 on
   bad bearer): clean states → honest 422 through the UI → closed loop
   (connect → install → registry rows → `pull`/`push` → external side received
   the note → stamps + receipts on the object → live `/settings/apps` icon →
   tampered token 401) → secret grep → deliver screenshots.

The bar is unchanged: bearer auth, real REST probe + discovery, governed rows
through the existing upserts, receipts for every outcome including blocked,
env-ref names only, and the mandatory real-browser closed-loop proof on a
booted export before Obsidian may call itself shipped.
