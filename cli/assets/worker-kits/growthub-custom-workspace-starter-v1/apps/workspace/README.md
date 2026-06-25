# Growthub Workspace App

This app is the Vercel/serverless runtime payload for `growthub-workspace-starter-v1`.

It intentionally depends on adapter contracts:

- `GROWTHUB_WORKSPACE_DATA_ADAPTER`
- `GROWTHUB_WORKSPACE_AUTH_ADAPTER`
- `GROWTHUB_WORKSPACE_PAYMENT_ADAPTER`
- `GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER`
- `GROWTHUB_BRIDGE_BASE_URL`
- `GROWTHUB_BRIDGE_INTEGRATIONS_PATH`
- `GROWTHUB_BRIDGE_ACCESS_TOKEN`
- `GROWTHUB_BRIDGE_USER_ID`
- `GROWTHUB_WORKSPACE_BYO_CONNECTIONS_JSON`
- `NANGO_SECRET_KEY` (required when any api-registry row uses `connectorKind: "nango"`)
- `NANGO_HOST_URL` (self-hosted Nango only)
- `NANGO_ENVIRONMENT` (default `dev`)
- `NANGO_MODE` (`cloud` | `self-hosted`, default `cloud`)

This `apps/workspace` app is the only bundled app surface; the legacy `studio/` Vite shell has been removed. It is the governed control plane and audit surface — non-technical users do not operate it directly; an agent operates the Workspace on their behalf through the governed routes (see the workspace `SKILL.md` operating-role contract), while super admins use this app for inspection, proof, and governance.

Settings exposes two universal integration lanes:

- Data sources.
- Workspace integrations.

The `/settings/integrations` page is part of the official governed workspace app shell. It uses the same light workspace rail, toolbar, and product object model as the dashboard workspace, and it renders Growthub bridge account state without redirecting to or borrowing the agency portal kit.

Use `GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER=growthub-bridge` when the deployed app should read connection state from the Growthub GH app MCP bridge. The reusable primitive is `lib/adapters/integrations/growthub-connection-normalizer.js`; it accepts SDK/profile-style `integrations[]` payloads and GH app MCP `accounts[]` payloads, then emits the same normalized object shape used by `byo-api-key`. Keep source credentials in the hosted authority layer or named env vars; this app consumes normalized connection metadata only.

For first boot, the bundled app also supports a hybrid path: keep `GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER=growthub-bridge` and set `WINDSOR_API_KEY` locally. That overlays connected state for Windsor AI and Google Sheets blended data without moving the rest of the workspace off the hosted bridge authority path.

## Data sources and API registry

Use the Data Model page to configure API-backed Data Sources and reusable API Registry records. Credentials stay in workspace settings or server env; Data Model records store only non-secret references such as `authRef`.

See [`docs/data-sources-api-registry.md`](./docs/data-sources-api-registry.md) for the setup guide, test flow, widget source eligibility rules, and the LeadShark example.

## Integration resolvers

Drop one `.js` file per integration into `lib/adapters/integrations/resolvers/`. Each file registers a provider-agnostic resolver that the workspace routes (`test-source`, `refresh-sources`) dispatch to. The bridge confirms which integrations are connected — resolvers call the provider API directly using env-var tokens.

```bash
# List registered resolvers (JSON)
curl -s http://localhost:3000/api/workspace/resolvers

# Test a resolver before saving to data model (JSON)
curl -s -X POST http://localhost:3000/api/workspace/test-source \
  -H "Content-Type: application/json" \
  -d '{"integrationId":"google-analytics","binding":{"entityType":"ga4.traffic","sourceStorage":"workspace-source-records","sourceId":"ga4-traffic"}}'

# Register a resolver-backed data model object (persists to growthub.config.json)
curl -s -X PATCH http://localhost:3000/api/workspace \
  -H "Content-Type: application/json" \
  -d '{"dataModel":{"objects":[...]}}'
```

See [`lib/adapters/integrations/resolvers/README.md`](./lib/adapters/integrations/resolvers/README.md) for the full resolver shape, all CLI commands with JSON response contracts, and the complete data model → source dropdown → refresh flow.

## Run

```bash
npm install
npm run dev
npm run build
```

## Deploy

Use this directory as the Vercel project root.
