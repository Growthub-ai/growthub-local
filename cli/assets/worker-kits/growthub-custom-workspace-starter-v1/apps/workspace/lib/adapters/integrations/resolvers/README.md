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

## How the refresh button connects to this

1. User configures a `dataModel.object` with `binding.sourceStorage: "workspace-source-records"` and `binding.integrationId: "your-provider-slug"`.
2. User clicks Refresh on the tab bar.
3. The builder collects all `sourceId` values from live-backed widgets on the active tab and POSTs them to `/api/workspace/refresh-sources`.
4. The route looks up the resolver by `integrationId`, calls `fetchRecords`, and persists normalized records via `writeWorkspaceSourceRecords`.
5. The builder reloads from `/api/workspace` and the widgets render the updated rows.

## Auth contract

- Provider tokens live in the Growthub bridge / BYO env var store — never in workspace config or client state.
- `config` passed to your resolver is the server-side `adapterConfig` from `readAdapterConfig()`. Read `process.env.YOUR_TOKEN` server-side inside the resolver. Never forward it to the client.
- Normalize provider responses to display-safe records before returning — no raw API payloads, no token-adjacent fields.
