# Vercel Serverless Deployment

The clean cloud deployment lane is the app payload:

```text
apps/workspace/
```

The Growthub local-first workspace remains the kit root. The deployable app lives under `apps/workspace`.

## Vercel project settings

- Root directory: `apps/workspace`
- Build command: `npm run build`
- Install command: `npm install`
- Framework preset: Next.js

## Required adapter env

At minimum, set:

```text
WORKSPACE_DEPLOY_TARGET=vercel
WORKSPACE_DATA_ADAPTER=<postgres|qstash-kv|provider-managed>
WORKSPACE_AUTH_ADAPTER=<oidc|clerk|authjs|provider-managed>
WORKSPACE_PAYMENT_ADAPTER=<none|stripe|polar>
WORKSPACE_INTEGRATION_ADAPTER=<static|growthub-bridge|byo-api-key>
```

Then set the provider-specific env required by `docs/adapter-contracts.md`.

For hosted Growthub authority, set:

```text
GROWTHUB_BRIDGE_BASE_URL=<growthub-gh-app-url>
GROWTHUB_BRIDGE_INTEGRATIONS_PATH=/api/mcp/accounts
GROWTHUB_BRIDGE_ACCESS_TOKEN=<bridge-token-issued-by-growthub-authority>
```

The deployed app reads normalized integration state from the bridge. It does not require raw Shopify, Meta, Google Analytics, Asana, Slack, GoHighLevel, Google Drive, Notion, Windsor, or Google Sheets secrets.

If `WORKSPACE_INTEGRATION_ADAPTER=byo-api-key`, set `WORKSPACE_BYO_CONNECTIONS_JSON` with the same normalized integration object fields and secret env names.
