# Integration Resolvers

Drop one `.js` file per integration here. Each file calls `registerSourceResolver()` once at module load.

**No resolver files ship in the upstream kit.** This directory is the extension point — operators add their own files for whatever integrations they connect (Asana, Linear, HubSpot, a custom API, a BYO token endpoint, a webhook, anything).

## Resolver shape

```js
import { registerSourceResolver } from "../source-resolver-registry.js";

registerSourceResolver({
  integrationId: "your-provider-slug",   // must match binding.integrationId in dataModel
  entityTypes: ["object.type"],          // list of types this resolver handles
  listEntities: async (config, connection) => NormalizedEntity[],
  fetchRecords: async (config, connection, binding) => Record[]
});
```

## Agent CLI commands

All commands output JSON. Pipe through `| jq` for filtering.

```bash
# List registered resolver IDs and on-disk files
curl -s http://localhost:3000/api/workspace/resolvers

# Test a resolver without saving (returns preview rows or error reason)
curl -s -X POST http://localhost:3000/api/workspace/test-source \
  -H "Content-Type: application/json" \
  -d '{
    "integrationId": "your-provider-slug",
    "binding": {
      "entityType": "your.entity.type",
      "sourceStorage": "workspace-source-records",
      "sourceId": "your-source-id"
    }
  }'

# Trigger a full refresh for one or more source IDs on the active tab
curl -s -X POST http://localhost:3000/api/workspace/refresh-sources \
  -H "Content-Type: application/json" \
  -d '{"sourceIds": ["your-source-id"]}'

# Register a data model object backed by this resolver (persists to growthub.config.json)
curl -s -X PATCH http://localhost:3000/api/workspace \
  -H "Content-Type: application/json" \
  -d '{
    "dataModel": {
      "objects": [
        {
          "id": "your-source-id",
          "label": "Your Source Label",
          "objectType": "your.object.type",
          "storageType": "manual-object",
          "columns": ["col1", "col2"],
          "rows": [],
          "sourceId": "your-source-id",
          "binding": {
            "mode": "integration",
            "sourceStorage": "workspace-source-records",
            "integrationId": "your-provider-slug",
            "sourceId": "your-source-id",
            "entityType": "your.entity.type"
          }
        }
      ]
    }
  }'

# Read back the full workspace config (data model objects, canvas, adapters)
curl -s http://localhost:3000/api/workspace
```

### Response contracts

**`GET /api/workspace/resolvers`**
```json
{
  "files": ["google-analytics.js"],
  "registeredIds": ["google-analytics"],
  "canUpload": true
}
```

**`POST /api/workspace/test-source` — resolver found, token missing**
```json
{
  "ok": false,
  "reason": "fetch-error",
  "integrationId": "google-analytics",
  "error": "GOOGLE_ANALYTICS_ACCESS_TOKEN is not set. Add it to .env.local to enable GA4 data refresh."
}
```

**`POST /api/workspace/test-source` — resolver found, records returned**
```json
{
  "ok": true,
  "integrationId": "google-analytics",
  "recordCount": 120,
  "columns": ["date", "channel", "device", "sessions", "activeUsers", "bounceRate"],
  "preview": [{ "date": "20260501", "channel": "Organic Search", "sessions": 412 }],
  "entityTypes": ["ga4.traffic"]
}
```

**`POST /api/workspace/refresh-sources`**
```json
{ "refreshed": ["your-source-id"], "skipped": [] }
```

## Data model and source dropdown flow

1. Add resolver file here → resolver registers on server start.
2. `PATCH /api/workspace` with a `dataModel.objects` entry that sets `binding.sourceStorage: "workspace-source-records"` and `binding.integrationId` matching this resolver.
3. Source dropdown in the workspace builder shows the object as a selectable dynamic source (resolver-backed objects appear in the **Dynamic sources** section).
4. User clicks Refresh on the tab bar → `POST /api/workspace/refresh-sources` → resolver `fetchRecords` runs → records persisted → widgets re-render.

## How the refresh button connects to this

1. User configures a `dataModel.object` with `binding.sourceStorage: "workspace-source-records"` and `binding.integrationId: "your-provider-slug"`.
2. User clicks Refresh on the tab bar.
3. The builder collects all `sourceId` values from live-backed widgets on the active tab and POSTs them to `/api/workspace/refresh-sources`.
4. The route looks up the resolver by `integrationId`, calls `fetchRecords`, and persists normalized records via `writeWorkspaceSourceRecords`.
5. The builder reloads from `/api/workspace` and the widgets render the updated rows.

## Auth contract

- **Tokens stay server-side.** Provider tokens live in the Growthub bridge / BYO env var store — never in workspace config or client state.
- The bridge confirms which integrations are connected. It does not proxy data. The resolver reads `process.env.YOUR_PROVIDER_TOKEN` and calls the provider API directly.
- `config` passed to your resolver is the server-side `adapterConfig` from `readAdapterConfig()`. Read `process.env.YOUR_TOKEN` server-side inside the resolver. Never forward it to the client.
- Normalize provider responses to display-safe records before returning — no raw API payloads, no token-adjacent fields.
