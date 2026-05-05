# Bridge-Backed Widgets V1 Plan

This document describes the future plan for connecting workspace widgets to live data via Growthub Bridge. It is a planning document — no bridge execution is implemented in V1.

## What exists in V1

- Static data bindings: `manual`, `json`, `csv` — all config-backed, all local
- Integration adapter state exposed in the Management panel (`static` / `growthub-bridge` / `byo-api-key`)
- `canvas.bindings` field reserves named binding slots:
  - `chatToCanvas`
  - `workflowOutputsToArtifacts`
  - `sessionContext`
  - `configDrivenCanvas`

## What bridge-backed widgets would add

In a future release, widgets could optionally specify a `liveBinding` that routes to a Growthub Bridge-connected data source:

```json
{
  "kind": "view",
  "config": {
    "liveBinding": {
      "adapter": "growthub-bridge",
      "endpoint": "/api/mcp/accounts",
      "transform": "rows"
    }
  }
}
```

The UI would show a "connected" state when `AGENCY_PORTAL_INTEGRATION_ADAPTER=growthub-bridge` and the bridge responds.

## What is NOT in scope

- No browser-side execution in V1
- No new API routes in V1
- No `liveBinding` field in the V1 schema (would require schema promotion + SDK update)
- No workflow trigger from widget interaction

## How to connect today

Set environment variables:

```bash
AGENCY_PORTAL_INTEGRATION_ADAPTER=growthub-bridge
GROWTHUB_BRIDGE_BASE_URL=https://app.growthub.ai
GROWTHUB_BRIDGE_USER_ID=your-user-id
GROWTHUB_BRIDGE_ACCESS_TOKEN=your-token
```

This enables the integration adapter state to show "connected" in the Management panel and unlocks the `/settings/integrations` page with live integration data.

## Authoritative reference

- [`docs/GROWTHUB_AUTH_BRIDGE.md`](./GROWTHUB_AUTH_BRIDGE.md) — bridge auth flow
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — local vs hosted boundary
- [`docs/WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md) — V1 config contract (no `liveBinding` yet)
