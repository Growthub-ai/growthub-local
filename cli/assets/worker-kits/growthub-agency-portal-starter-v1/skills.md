# Agency Portal Starter — Operator Runbook

This runbook specializes the custom workspace starter into an agnostic agency portal worker kit.

## Non-negotiable architecture

1. The governed workspace is the root artifact.
2. The Vite shell in `studio/` remains the local-first Growthub operator surface.
3. The Vercel app lives in `apps/agency-portal/`.
4. Persistence, auth, payments, and reporting are selected through thin adapters and environment variables.
5. Integration state is resolved through a static local catalog or Growthub GH app MCP bridge, never by moving provider secrets into this starter.
6. BYO API key setup is supported, but it must normalize into the same object contract as Growthub bridge output.
7. Prior app examples are reference material only; this kit contract is defined by the governed workspace primitives and adapter model.

## Capability map

The portal starter must preserve these business capabilities:

- Dashboard: revenue, tasks, health, and alerts.
- Clients: profiles, contacts, status, notes, onboarding, targets.
- Pipeline: leads, opportunities, stages, won/lost state.
- Content: calendar, platform, owner, status.
- Tasks: priorities, recurring templates, due dates.
- Finance: invoices, expenses, payment state.
- Reports: performance report generation and review.
- Metrics: period-based agency health.
- Operations: SOPs, links, internal docs.
- Settings: profile, workspace, adapters, deployment.
- Settings integrations: data sources and workspace integrations resolved through static local catalog or Growthub bridge authority.

## Adapter model

### Persistence

Use `AGENCY_PORTAL_DATA_ADAPTER`:

- `postgres` with `DATABASE_URL`
- `qstash-kv` with `QSTASH_KV_REST_URL` and `QSTASH_KV_REST_TOKEN`
- `provider-managed` for a hosted database surface outside the kit

### Auth

Use `AGENCY_PORTAL_AUTH_ADAPTER`:

- `oidc`
- `clerk`
- `authjs`
- `provider-managed`

### Payments

Use `AGENCY_PORTAL_PAYMENT_ADAPTER`:

- `none`
- `stripe`
- `polar`

### Integrations

Use `AGENCY_PORTAL_INTEGRATION_ADAPTER`:

- `static` for local starter catalog output.
- `growthub-bridge` for hosted authority through the Growthub GH app MCP connection bridge.
- `byo-api-key` for explicit workspace-owned provider setup through `AGENCY_PORTAL_BYO_CONNECTIONS_JSON`, with `WINDSOR_API_KEY` supported directly for the Windsor data pipeline object.

Keep the lanes distinct:

- Data sources: Windsor AI, Google Sheets blended data, Google Analytics, Shopify, Meta Facebook/Instagram.
- Workspace integrations: Asana, Slack, GoHighLevel, Google Drive, Notion.

The GH app owns user auth, provider tokens, account IDs, scopes, verification, and MCP connection metadata. The starter consumes normalized bridge output only.

The normalized object mirrors the GH app integration primitive and adds worker-kit lane metadata:

- `id`, `name`, `label`, `icon`
- `provider`
- `description`
- `category`
- `authType`
- `isConnected`
- `isActive`
- `connectionId`
- `connectionMetadata`
- `lane`
- `objectType`
- `status`
- `authPath`
- `setupMode`

Use `growthub-bridge` when the user has existing hosted connections. Use `byo-api-key` only when the user explicitly needs local/provider-owned setup; that path is more manual but still composable. Windsor BYO setup is intentionally direct: set `WINDSOR_API_KEY` and the Windsor AI data pipeline object renders as connected.

## Real-world QA script

Run these before calling the kit v1-ready:

```bash
growthub kit list --family studio --json
growthub kit download growthub-agency-portal-starter-v1 --out /tmp/agency-portal-qa --yes
growthub kit fork register /tmp/agency-portal-qa/growthub-agent-worker-kit-agency-portal-starter-v1
growthub kit fork status <fork-id>
cd /tmp/agency-portal-qa/growthub-agent-worker-kit-agency-portal-starter-v1
bash setup/check-deps.sh
node setup/verify-env.mjs
cd studio && npm install && npm run build
cd ../apps/agency-portal && npm install && npm run build
```

Then open the app and verify `/settings/integrations`.

## Local-first workflow

```bash
bash setup/check-deps.sh
node setup/verify-env.mjs
cd studio && npm install && npm run dev
```

The local operator shell must work without cloud deployment.

## Vercel workflow

```bash
cd apps/agency-portal
npm install
npm run dev
npm run build
```

Vercel root directory: `apps/agency-portal`.

## Self-evaluation unit

The unit of work is one adapter contract change, one portal capability change, one deployment surface change, or one governed primitive change. Enforce `SKILL.md` `maxRetries: 3`.
