# Agency Portal App

This app is the Vercel/serverless runtime payload for `growthub-agency-portal-starter-v1`.

It intentionally depends on adapter contracts:

- `AGENCY_PORTAL_DATA_ADAPTER`
- `AGENCY_PORTAL_AUTH_ADAPTER`
- `AGENCY_PORTAL_PAYMENT_ADAPTER`
- `AGENCY_PORTAL_INTEGRATION_ADAPTER`
- `GROWTHUB_BRIDGE_BASE_URL`
- `GROWTHUB_BRIDGE_INTEGRATIONS_PATH`
- `GROWTHUB_BRIDGE_ACCESS_TOKEN`
- `GROWTHUB_BRIDGE_USER_ID`
- `AGENCY_PORTAL_BYO_CONNECTIONS_JSON`

The Growthub local-first operator shell remains at `../../studio`.

Settings exposes two integration lanes:

- Data sources: Windsor AI, Google Sheets blended data, Google Analytics, Shopify, Meta Facebook/Instagram.
- Workspace integrations: Asana, Slack, GoHighLevel, Google Drive, Notion.

Use `AGENCY_PORTAL_INTEGRATION_ADAPTER=growthub-bridge` when the deployed app should read connection state from the Growthub GH app MCP bridge. The reusable primitive is `lib/adapters/integrations/growthub-connection-normalizer.js`; it accepts SDK/profile-style `integrations[]` payloads and GH app MCP `accounts[]` payloads, then emits the same normalized object shape used by `byo-api-key`. Keep provider tokens in the hosted authority layer or named env vars; this app consumes normalized connection metadata only.

## Run

```bash
npm install
npm run dev
npm run build
```

## Deploy

Use this directory as the Vercel project root.
