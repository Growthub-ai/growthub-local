# Bridge-Backed Widget Binding — V1 Plan

> **Status:** Shipped in `growthub-custom-workspace-starter-v1` as an additive V1.1+
> vocabulary extension. All new state nests under `widget.config.binding` and
> `widget.config.filter`, so the PATCH allowlist and workspace envelope are unchanged.

---

## The core primitive

**Governed Integration Reference Binding**

A governed integration reference binding lets a workspace widget reference a connected
provider entity by stable ID while resolving display metadata from an authority adapter
at runtime — without storing provider credentials or executing provider queries in the browser.

Shorter: **Widgets store references. Adapters resolve metadata. Bridge owns authority.**

The private Creative OS fork validated this in real usage with Meta Ads account selection.

---

## What the widget stores

```jsonc
// widget.config.binding — the only thing that persists
{
  "mode": "integration",
  "source": "Meta Facebook and Instagram",
  "integrationId": "meta-ads",
  "lane": "data-source",
  "entityId": "57497690",        // stable provider entity ID — never a token
  "entityType": "account",       // canonical type (see KNOWN_ENTITY_TYPES)
  "entityLabel": "Dr. Robert Whitfield"  // display-only, refreshable from adapter
}

// widget.config.filter — the query clause generated from the selected entity
{
  "op": "and",
  "clauses": [
    { "fieldId": "accountId", "operator": "eq", "value": "57497690" }
  ]
}
```

The widget does **not** store:
- Provider token or OAuth credential
- Raw bridge secret
- Provider payload
- Workflow execution request

---

## Authority boundary (unchanged from V1)

```
Browser (workspace builder)
  → picks integration from normalized catalog
  → picks entity from server-returned metadata
  → persists only:  binding.entityId + filter clause
  → NEVER calls provider API
  → NEVER holds provider token

Server (apps/workspace/app/api)
  → GET /api/workspace/integration-entities?integrationId=xxx
  → calls bridge (or returns sample data in static mode)
  → returns NormalizedIntegrationEntity[]
  → tokens stay server-side

Bridge / BYO adapter
  → owns provider OAuth / API key
  → returns normalized entity catalog
  → never exposes credentials to browser
```

This is identical to the authority rule in `GOVERNED_WORKSPACE_TOPOLOGY_V1.md` —
the binding extension does not relax any boundary.

---

## NormalizedIntegrationEntity shape

Defined locally in `lib/domain/integrations.js` and `lib/workspace-schema.js`.
**Not yet promoted to `@growthub/api-contract`** — local-first until validated end-to-end.

```ts
{
  id: string,               // stable provider entity ID — what the widget persists
  label: string,            // primary display name (e.g. "Dr. Robert Whitfield")
  secondaryLabel?: string,  // muted subtitle (account ID, domain, type hint)
  entityType?: string,      // canonical type — see KNOWN_ENTITY_TYPES below
  provider?: string,        // provider slug (e.g. "meta-ads", "shopify")
  lane?: "data-source" | "workspace-integration",
  status?: "connected" | "needs-connection" | "unavailable",
  metadata?: Record<string, unknown>  // display-only adapter metadata
}
```

### KNOWN_ENTITY_TYPES and fieldId mapping

| entityType  | filter clause fieldId |
|-------------|----------------------|
| `account`   | `accountId`          |
| `property`  | `propertyId`         |
| `store`     | `shopId`             |
| `sheet`     | `spreadsheetId`      |
| `channel`   | `channelId`          |
| `project`   | `projectId`          |
| `location`  | `locationId`         |
| `folder`    | `folderId`           |
| `pipeline`  | `pipelineId`         |
| `workspace` | `workspaceId`        |

`buildEntityFilterClause(entityType, entityId)` (exported from `lib/workspace-schema.js`)
builds the canonical clause from any selection.

---

## Provider entity resolution — cross-provider uniformity

All providers return the same `NormalizedIntegrationEntity` shape from their adapter.
The UI (EntitySelector, EntityBadge) is provider-agnostic.

| Provider         | entityType  | Example entity                              |
|------------------|-------------|---------------------------------------------|
| Meta Ads         | `account`   | `{ id: "57497690", label: "Dr. Robert Whitfield" }` |
| Google Analytics | `property`  | `{ id: "123456789", label: "Main Property" }` |
| Shopify          | `store`     | `{ id: "my-store", label: "My Store" }`     |
| Google Sheets    | `sheet`     | `{ id: "1BxiM...", label: "Marketing Sheet" }` |
| Slack            | `channel`   | `{ id: "C0123456", label: "#general" }`     |
| Asana            | `project`   | `{ id: "1204622...", label: "Marketing Projects" }` |
| GoHighLevel      | `location`  | `{ id: "ghl-loc", label: "Demo Location" }` |
| Google Drive     | `folder`    | `{ id: "1a2b3c...", label: "Client Deliverables" }` |
| Notion           | `workspace` | `{ id: "notion-ws", label: "Team Workspace" }` |

Same UI. Different adapter metadata. Provider-specific work stays server-side.

---

## Integration adapter modes

The same `NormalizedIntegrationEntity[]` shape is returned regardless of adapter mode:

| Adapter mode      | Entity resolution source                                  |
|-------------------|-----------------------------------------------------------|
| `static`          | `SAMPLE_ENTITIES_BY_PROVIDER` in `lib/domain/integrations.js` (demo) |
| `growthub-bridge` | `GET <bridge>/api/integrations/<id>/entities` via server-side fetch with token |
| `byo-api-key`     | Same bridge path or static fallback depending on config   |

Authority adapters live under `lib/adapters/integrations/`. The browser never
sees which adapter is active — it only receives `NormalizedIntegrationEntity[]`.

---

## API surface

### `GET /api/workspace/integration-entities?integrationId=<id>`

Added in this plan. Server-side only.

```jsonc
// 200 OK
{
  "integrationId": "meta-ads",
  "entities": [
    {
      "id": "57497690",
      "label": "Dr. Robert Whitfield",
      "secondaryLabel": "57497690",
      "entityType": "account",
      "provider": "meta-ads",
      "lane": "data-source",
      "status": "connected"
    }
  ],
  "source": "sample"   // "bridge" when live Bridge entities returned
}

// 400 Bad Request
{ "error": "integrationId query parameter is required" }
```

No new top-level keys are added to `PATCH /api/workspace`. The PATCH allowlist
(`dashboards`, `widgetTypes`, `canvas`) is unchanged.

---

## UI components

All live in `apps/workspace/app/workspace-builder.jsx` under the `SourceSubPanel`:

- **`EntityBadge`** — chip showing selected entity (icon initials, primary label, muted ID). Has optional `onClear`.
- **`EntitySelector`** — compact list appearing below integration selection. Shows connected status, sample hint when not live, loading state, entity rows.
- **`SourceSubPanel`** — updated to fetch entities via the new API route when an integration binding is active, and to call `selectEntity` which writes both `binding.entityId` and the filter clause atomically.

CSS class families added to `globals.css`:
`.workspace-entity-selector`, `.workspace-entity-list`, `.workspace-entity-row`,
`.workspace-entity-badge`, `.workspace-entity-badge-*`, `.workspace-entity-empty`,
`.workspace-entity-sample-hint`.

---

## What changes in the widget config on selection

**Before** (integration selected, no entity):
```jsonc
{
  "mode": "integration",
  "source": "Meta Facebook and Instagram",
  "integrationId": "meta-ads",
  "lane": "data-source"
}
```

**After** (entity selected):
```jsonc
// binding:
{
  "mode": "integration",
  "source": "Meta Facebook and Instagram",
  "integrationId": "meta-ads",
  "lane": "data-source",
  "entityId": "57497690",
  "entityType": "account",
  "entityLabel": "Dr. Robert Whitfield"
}

// filter (auto-written):
{
  "op": "and",
  "clauses": [
    { "fieldId": "accountId", "operator": "eq", "value": "57497690" }
  ]
}
```

The filter clause is what execution engines will use. `entityLabel` is display-only.

---

## Compatibility

- V1 dashboards with `mode: "manual" | "json" | "csv"` round-trip unchanged.
- V1.1 integration bindings without `entityId` continue to load and display correctly.
- `entityLabel` is display-only and may be absent on load — the UI falls back to `entityId`.
- The validator (`lib/workspace-schema.js`) accepts `entityId`, `entityType`, `entityLabel`
  as optional strings; it never requires them.
- The PATCH allowlist and workspace envelope are **not changed**.

---

## BYO API keys and custom product bridges

This primitive is not Growthub Bridge-only. The same `NormalizedIntegrationEntity[]`
shape can be returned by:

| Authority adapter                | Integration adapter mode   |
|----------------------------------|---------------------------|
| Growthub Bridge MCP              | `growthub-bridge`         |
| BYO API key (env-backed)         | `byo-api-key`             |
| Founder's own product bridge     | custom (same output shape) |
| Enterprise internal service      | custom (same output shape) |

The difference is the authority adapter behind `listEntityMetadataForIntegration`.
All return the same shape. The UI never branches on adapter type.

---

## Explicit non-goals (unchanged from V1/V1.1)

- Browser-hosted workflow execution — out of scope.
- Provider token storage in the browser — out of scope.
- Live metric querying from the widget — out of scope (entity selection configures WHERE, not WHAT).
- New top-level PATCH fields — out of scope.
- Provider-specific widget types (Meta widget, Shopify widget, etc.) — out of scope;
  the governing primitive is provider-agnostic reference binding.

---

## Cross-references

- [`docs/WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md) — V1 config envelope (unchanged)
- [`docs/WORKSPACE_BUILDER_RUNTIME_V1_1.md`](./WORKSPACE_BUILDER_RUNTIME_V1_1.md) — V1.1 additive vocabulary
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — authority boundary
- [`docs/ADAPTER_CONTRACTS_V1.md`](./ADAPTER_CONTRACTS_V1.md) — integration adapter contract
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js` — source of truth for validator + KNOWN_ENTITY_TYPES + buildEntityFilterClause
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/domain/integrations.js` — SAMPLE_ENTITIES_BY_PROVIDER + getEntityMetadataForIntegration
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/integrations/index.js` — listEntityMetadataForIntegration
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/integration-entities/route.js` — GET endpoint
