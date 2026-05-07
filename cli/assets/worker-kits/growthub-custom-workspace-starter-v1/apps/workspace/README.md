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

The Growthub local-first operator shell remains at `../../studio`.

Settings exposes two universal integration lanes:

- Data sources.
- Workspace integrations.

The `/settings/integrations` page is part of the official governed workspace app shell. It uses the same light workspace rail, toolbar, and product object model as the dashboard workspace, and it renders Growthub bridge account state without redirecting to or borrowing the agency portal kit.

Use `GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER=growthub-bridge` when the deployed app should read connection state from the Growthub GH app MCP bridge. The reusable primitive is `lib/adapters/integrations/growthub-connection-normalizer.js`; it accepts SDK/profile-style `integrations[]` payloads and GH app MCP `accounts[]` payloads, then emits the same normalized object shape used by `byo-api-key`. Keep source credentials in the hosted authority layer or named env vars; this app consumes normalized connection metadata only.

For first boot, the bundled app also supports a hybrid path: keep `GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER=growthub-bridge` and set `WINDSOR_API_KEY` locally. That overlays connected state for Windsor AI and Google Sheets blended data without moving the rest of the workspace off the hosted bridge authority path.

## Run

```bash
npm install
npm run dev
npm run build
```

## Deploy

Use this directory as the Vercel project root.
