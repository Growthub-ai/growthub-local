# Official Marketplace Plugins V1

Growthub Marketplace Plugins are governed workspace capabilities installed into
the existing Agent Workspace as Code universe. A plugin does not create a second
runtime, database, workflow engine, or mutation lane. It registers governed rows,
server-side env references, UI affordances, receipts, and provider-specific
adapters that operate through the workspace's existing control plane.

This is the official V1 plugin model for the custom workspace starter.

## Definition

An official marketplace plugin is a provider-backed capability bundle that can:

- register provider and product rows in the API Registry
- verify runtime readiness with server-side probes
- keep secrets in environment variables and persist only env references
- expose governed UI setup flows in the Add-ons Marketplace
- power workspace features through existing objects, routes, receipts, and
  helper surfaces
- record every install, run, callback, failure, and uninstall through
  `workspace:agent-outcomes`

Official plugins are workspace-native. They land as Data Model/API Registry
truth, not as opaque external app state.

## V1 Provider: Upstash

Upstash is the first official marketplace provider. The provider row represents
account/setup capability. Product rows represent runnable workspace
capabilities.

Provider:

- `providerId`: `upstash`
- provider account lane: Upstash Developer API
- setup fields: account email + management API key
- setup surface: Add-ons Marketplace / provider setup
- persisted truth: provider row and product rows in the API Registry
- secret rule: no API key, token, or signing key is persisted into config,
  receipts, browser payloads, or row output

## V1 Products

### Upstash QStash / Workflow

QStash is the first validated runnable plugin product.

It enables:

- serverless scheduled workflow runs
- deterministic per-workflow schedule ownership
- signed destination delivery
- signed callback/failure callback sync
- last-run proof written back to the owning workflow row
- `/schedule` cockpit visibility and controls
- receipt-backed audit for install, run, callback, and uninstall

Product identity:

- `productId`: `upstash-qstash`
- `integrationId`: `upstash-qstash-workflow`
- `authRef`: `QSTASH`
- execution lane: `serverless-scheduler`
- required env: `QSTASH_TOKEN`
- optional env: `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`,
  `QSTASH_NEXT_SIGNING_KEY`

Validated V1 capability:

- QStash product sync verifies `/v2/schedules` over the live provider API.
- Serverless schedule install creates a real QStash schedule.
- QStash delivers to the workspace workflow destination.
- QStash callback returns success proof to the owning workflow row.
- Receipts record the full lifecycle.

### Upstash Redis

Redis is registered as a workspace data/cache capability.

It enables:

- Redis REST database registration
- governed env references for Redis URL/token
- readiness probing through `/ping`
- future cache, queue, rate-limit, and workspace data features

Product identity:

- `productId`: `upstash-redis`
- `integrationId`: `upstash-redis`
- `authRef`: `UPSTASH_REDIS`
- execution lane: `workspace-data`
- required env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### Upstash Search

Search is registered as a retrieval/search capability.

It enables:

- search index registration
- governed env references for Search URL/token
- readiness probing through `/stats` and `/info`
- future workspace retrieval and document-search flows

Product identity:

- `productId`: `upstash-search`
- `integrationId`: `upstash-search`
- `authRef`: `UPSTASH_SEARCH`
- execution lane: `workspace-retrieval`
- required env: `UPSTASH_SEARCH_REST_URL`, `UPSTASH_SEARCH_REST_TOKEN`

### Upstash Vector

Vector is registered as a semantic retrieval capability.

It enables:

- vector index registration
- governed env references for Vector URL/token
- readiness probing through `/info`
- future semantic memory, retrieval, and embedding-backed workspace features

Product identity:

- `productId`: `upstash-vector`
- `integrationId`: `upstash-vector`
- `authRef`: `UPSTASH_VECTOR`
- execution lane: `workspace-retrieval`
- required env: `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`

## User Surfaces

Official marketplace plugins appear in these workspace surfaces:

- Add-ons Marketplace: provider/product setup, product verification, resource
  selection, env reference binding
- API Registry: persisted provider/product capability rows
- Workflow Canvas: trigger/runtime configuration and schedule ownership
- Workspace Helper: `/schedule` command entry point
- Schedule Cockpit: fleet view for scheduled, ready, blocked, and drifted
  workflows
- Agent Outcomes: receipt ledger for every governed action

## Governance Rules

Marketplace plugins must obey the workspace mutation boundary:

- config changes go through `PATCH /api/workspace`
- serverless/sandbox execution goes through governed execution routes
- schedule operations go through the existing add-on schedule route
- receipts are written to `workspace:agent-outcomes`
- secrets remain server-side
- UI controls hand off to governed routes, not direct client-side config edits

## Coming Soon

The V1 marketplace shape is provider-agnostic. The next expansion points are:

- custom scheduler providers using the same `schedulerRegistryId` contract
- additional official provider packs
- marketplace-backed API Registry resource discovery
- hosted provider account authority when a workspace needs it
- richer Add-ons Marketplace install receipts and rollback surfaces
- plugin-specific cockpit lenses for data, retrieval, queue, and cache products

The invariant stays the same: plugins extend the governed workspace universe;
they do not bypass it.
