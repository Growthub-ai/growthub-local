# Vercel Serverless Deployment

The clean cloud deployment lane is the app payload:

```text
apps/workspace/
```

The Growthub local-first workspace remains the kit root, and the Vite operator shell remains:

```text
studio/
```

## Vercel project settings

- Root directory: `apps/workspace`
- Build command: `npm run build`
- Install command: `npm install`
- Framework preset: Next.js

## Required adapter env

At minimum, set:

```text
AGENCY_PORTAL_DEPLOY_TARGET=vercel
AGENCY_PORTAL_DATA_ADAPTER=<postgres|qstash-kv|provider-managed>
AGENCY_PORTAL_AUTH_ADAPTER=<oidc|clerk|authjs|provider-managed>
AGENCY_PORTAL_PAYMENT_ADAPTER=<none|stripe|polar>
AGENCY_PORTAL_INTEGRATION_ADAPTER=<static|growthub-bridge|byo-api-key>
```

Then set the provider-specific env required by `docs/adapter-contracts.md`.

### Optional env-var login gate

For client portals or internal ops consoles without wiring OIDC yet, enable the additive gate documented in `apps/workspace/docs/workspace-login-gate.md`:

```text
GROWTHUB_WORKSPACE_GATE_ENABLED=1
GROWTHUB_WORKSPACE_GATE_USERNAME=<username>
GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH=<sha256-hex>
GROWTHUB_WORKSPACE_GATE_SECRET=<random-secret>
```

Use `GROWTHUB_WORKSPACE_GATE_PASSWORD` only for local `.env.local`; prefer `GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH` on Vercel.

For hosted Growthub authority, set:

```text
GROWTHUB_BRIDGE_BASE_URL=<growthub-gh-app-url>
GROWTHUB_BRIDGE_INTEGRATIONS_PATH=/api/mcp/accounts
GROWTHUB_BRIDGE_ACCESS_TOKEN=<bridge-token-issued-by-growthub-authority>
```

The deployed app reads normalized integration state from the bridge. It does not require raw Shopify, Meta, Google Analytics, Asana, Slack, GoHighLevel, Google Drive, Notion, Windsor, or Google Sheets secrets.

If `AGENCY_PORTAL_INTEGRATION_ADAPTER=byo-api-key`, set `AGENCY_PORTAL_BYO_CONNECTIONS_JSON` with the same normalized integration object fields and secret env names. This is more detailed setup, but keeps the worker kit contract composable.
