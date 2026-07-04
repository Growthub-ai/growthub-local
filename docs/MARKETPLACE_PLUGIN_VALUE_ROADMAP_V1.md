# Marketplace Plugin Value Roadmap V1 — the compounding loop as product, and the next providers worth shipping

Companion to
[`docs/AWAC_DIRECTION_AND_EVOLUTION_V1.md`](./AWAC_DIRECTION_AND_EVOLUTION_V1.md)
and [`docs/MARKETPLACE_PROVIDER_PLAYBOOK_V1.md`](./MARKETPLACE_PROVIDER_PLAYBOOK_V1.md).
This is a value analysis, not a commitment ledger: every candidate below must
still enter through the playbook (Phase 0 recon → grammar-only definition →
governed rows → icons → tests → real-browser closed-loop proof).

All grammar facts cited here were read from
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-add-ons.js`
and `lib/workspace-data-model.js` at `0.14.14`. If the source has moved on,
the source wins.

---

## Part 1 — The compounding loop, broken down as product

The compound loop:

```text
real-world event -> governed workflow execution -> provider-backed capability call
  -> durable state/file persistence -> receipt/proof -> UI + agent readback
  -> next governed action -> (repeat)
```

Each stage is itself a product surface, and each stage multiplies the others.

### Stage products

| Loop stage | The product it is | Shipped form (0.14.14) |
| --- | --- | --- |
| Real-world event | **Trigger surface** — how reality enters | `inbound-webhook`, `api-request`, `serverless-scheduler` lanes; HMAC-verified doors; proof-gated publish |
| Governed execution | **Orchestration surface** — what runs | Workflow canvas + runner, swarm cockpit, sandbox rows, browser grants |
| Capability call | **Marketplace** — what the workspace can do | Provider/product grammar, lane dispatch, live discovery, resolver endpoints |
| Durable persistence | **Data substrate** — what accumulates | `workspace-data` (Supabase Postgres), `workspace-storage` (buckets), `workspace-retrieval` (Upstash Search/Vector), Data Model objects |
| Receipt/proof | **Trust layer** — why state is believable | `workspace:agent-outcomes` receipts, sync stamps, syncProof, honest blocked outcomes |
| UI + agent readback | **Operating surface** — who acts next | `/settings/apps` derivation, Lens/cockpits, MCP console (read + dry-run + hand-off) |

### Why it compounds instead of adds

A new provider is not one feature. Because every stage consumes governed rows
rather than provider-specific wiring, one install lights up **every** stage
simultaneously:

- a Stripe-class event source is immediately consumable by every existing
  workflow node;
- a new `workspace-data` product is immediately bindable by every existing
  Data Model surface;
- every new capability is immediately explainable by Lens/MCP and honest by
  receipt discipline.

So the value function is multiplicative, roughly:

```text
workspace value ≈ (event sources) × (capabilities) × (persistence lanes)
                  × (operating surfaces) × trust
```

Trust is the scalar that keeps the product usable at all: the moment a
capability could be faked, agents and humans both have to re-verify
everything and the multiplication collapses. This is why "honest 422",
blocked receipts, and proof-gated publish are product features, not
engineering hygiene.

### The serverless carry — the newly unlocked multiplier

The 0.14.13 + 0.14.14 pairing means an installed capability is **portable
across runtimes**:

- rows carry env-ref **names** only, so the same governed row resolves
  against `.env.local` locally and against Vercel project env in the
  deployed app;
- registered resolvers are addressable Next.js endpoints
  (`/api/resolvers/<integrationId>`) that ship inside the deployed workspace
  app;
- inbound doors and QStash schedules fire against the production URL just as
  they do against the local boot;
- the workspace artifact remains forkable — installs travel as config + rows,
  and secrets rehydrate per environment.

Every provider we add is therefore not "a local integration" — it is a
**production capability of the customer's deployed business app**, gained
through a no-code install. That is the lens the candidate ranking below uses.

---

## Part 2 — What the grammar already supports (the fit surface)

Shipped providers: `upstash` (QStash scheduler, Redis, Search, Vector),
`growthub` (inbound webhook + API request), `vercel` (deployments),
`supabase` (PostgREST + Storage), `nango` (live-discovered integrations).

Shipped execution lanes (the well-known api-registry sub-types):

| Lane | Meaning | Current occupants |
| --- | --- | --- |
| `serverless-scheduler` | time-based triggers | Upstash QStash |
| `inbound-webhook` / `api-request` | external invocation | Growthub native |
| `workspace-deployments` | ship the app | Vercel (+ GitHub credentials) |
| `workspace-data` | external database tables as governed data | Supabase PostgREST |
| `workspace-storage` | buckets/files with proof | Supabase Storage |
| `workspace-retrieval` | search + vector memory | Upstash Search, Upstash Vector |
| `workspace-integrations` | governed API requests to any SaaS | Nango (live discovery) |
| `workspace-provider` | the provider account row itself | all providers |

Governed business objects (Data Model presets): `data-source`,
`api-registry`, `app-surface`, `people`, `tasks`, `sandbox-environment`,
`custom`.

### The decision rule Nango forces

Nango's live discovery already turns *any* of its supported APIs into a
governed `workspace-integrations` row. Therefore a first-party provider is
only worth shipping when the capability deserves **lane semantics beyond
"make API requests"** — its own governed actions, persistence spine, sync
stamps, or business-object binding (exactly why Supabase became
`workspace-data`/`workspace-storage` instead of staying a generic
integration). Candidates that fail this test should be reached through Nango
and a workspace template, not a new provider.

Fit criteria used below (all derived from the playbook's hard rules):

1. **Auth fits the generic probe grammar** — bearer token or basic pair; no
   OAuth-only dance (OAuth-only platforms route through Nango).
2. **Real, stable REST endpoints** for `probe` + `resourceDiscovery`.
3. **Reuses an existing lane** (cheapest) or justifies exactly one new lane.
4. **Binds to a governed business object** (`data-source`, `tasks`, `people`,
   `app-surface`) rather than only emitting requests.
5. **Serverless carry** — the capability is valuable *from the deployed app*,
   not just from the local boot.

---

## Part 3 — Highest-value candidates

### Tier 1 — ship-next candidates (new capability classes for a business OS)

**1. Stripe — `workspace-commerce` lane (one new lane, maximal leverage).**
Revenue is the central governed business object of any business stack, and it
is the one thing the workspace cannot yet represent as verified reality.
Bearer auth (`STRIPE_SECRET_KEY`) fits the generic probe lane
(`GET /v1/account` as probe; products/prices/customers/webhook-endpoints as
`resourceDiscovery`). The compounding is unusually complete: Stripe events
enter through the **existing** `inbound-webhook` lane (signature verification
mirrors the shipped HMAC discipline), customers bind to the `people` preset,
payments become receipt-backed business events, and the deployed workspace
app can both *react to* and *initiate* commerce server-side. This is the
candidate where every loop stage lights up at once.

**2. Resend (or Postmark) — `workspace-messaging` outbound lane.**
Nearly every workflow's terminal action is "tell someone." Outbound email is
the missing effector between "governed execution" and "real-world effect."
Resend is bearer-auth, minimal REST (domains, audiences as discoverable
resources; send as the governed lane action), and serverless-native — the
deployed app sends from production with the same governed row. Receipts per
send give the workspace an auditable outbound ledger, which no generic Nango
row provides. A `workspace-messaging` lane also becomes the landing zone for
Slack/Twilio effectors later without new grammar.

**3. Neon — second `workspace-data` occupant (zero new lanes).**
Proves the data lane is provider-generic (the same argument
Upstash↔Supabase settled for scheduler/storage) and adds the most
AWaC-native database primitive that exists: **branchable Postgres**. Fork the
workspace, branch the database — the workspace artifact and its data
substrate finally have the same lifecycle. Bearer auth, clean REST
(`/api/v2/projects`, branches, endpoints) for probe + discovery; table sync
reuses the Supabase correlation spine (`registryId`, `externalTable`,
`lastSync*` stamps). Cheapest Tier-1 ship by construction.

**4. Cloudflare R2 — second `workspace-storage` occupant.**
Same lane-genericity argument for storage, with a real customer story:
S3-compatible object storage + CDN for the deployed app's assets at
egress-free economics. Bearer (API token) auth, bucket
creation/inventory/proof mirror the shipped Supabase Storage actions. Also
quietly positions the broader Cloudflare surface (queues, KV, D1) behind one
verified provider account for later products.

### Tier 2 — business-object substrates (high value, ship after Tier 1)

**5. Linear — the `tasks` preset made real.**
The `tasks` governed object exists but has no external substrate. Linear's
API-key auth and clean API make it the reference "external work → governed
tasks rows with sync stamps" integration — the same promotion Supabase gave
external tables. This is the first provider whose install directly populates
a shipped business-object preset, which is what makes it Tier-2-top rather
than "just use Nango."

**6. HubSpot (or Attio) — the `people` preset made real.**
CRM contacts/companies as governed `people` rows with a correlation spine.
Highest customer resonance ("my CRM inside my workspace"), and it compounds
with Stripe (customer ↔ revenue joins inside the Data Model). Private-app
token auth keeps it inside the bearer grammar; OAuth-first CRMs stay on the
Nango path.

**7. OpenAI (embeddings) — completing the `workspace-retrieval` loop.**
Upstash Search/Vector shipped the retrieval *store*; an embeddings product
ships the retrieval *producer*. Bearer auth, trivial probe (`GET /v1/models`).
With it, the workspace owns a full governed RAG loop — files in
`workspace-storage` → embeddings → `workspace-retrieval` rows → agent
readback — all receipt-backed, all portable to the deployed runtime.

**8. Clerk — auth for the `app-surface` object.**
The 0.14.13 deploy lane ships real production apps; production apps need
users. Clerk's secret-key auth and instance/user REST surface fit the
grammar, and the governed row answers a question agents currently cannot:
"does the deployed app have real auth, and is it verified?" This deepens the
`workspace-deployments` + `app-surface` story rather than adding a request
capability.

### Deliberately routed through Nango (not first-party)

Slack, Notion, Airtable, Google Workspace, most OAuth-first SaaS: live
discovery already promotes them into governed `workspace-integrations` rows,
and none of them (yet) demand their own lane semantics. The correct product
motion there is **workspace templates** that pair a Nango-discovered product
with dashboards and workflows — not new providers. Revisit any of them only
when a governed action class emerges that generic API requests cannot
express.

---

## Part 4 — Sequencing logic (why this order)

1. **Stripe + Resend** add the two missing loop classes — money in, messages
   out — turning the deployed workspace app into a business that can *earn*
   and *speak*, not just compute and store.
2. **Neon + R2** are second occupants of existing lanes: near-zero grammar
   risk, and they convert "Supabase features" into "lane guarantees," which
   is what makes the marketplace credible as a platform rather than a
   partner list.
3. **Linear + HubSpot** then bind external business reality to the shipped
   object presets (`tasks`, `people`), which is where the Data Model starts
   feeling like the customer's actual business.
4. **OpenAI embeddings + Clerk** round out retrieval and deployed-app
   readiness once the above are earning trust.

Every candidate above passes the same bar: bearer/basic auth, real REST
probe + discovery endpoints, governed rows through the existing upserts,
receipts for every outcome including blocked, env-ref names only, and the
mandatory real-browser closed-loop QA on a booted export before it may call
itself shipped.
