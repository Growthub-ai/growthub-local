# Workspace Builder Runtime V1.1

V1.1 is an additive widget configuration layer on top of the governed Workspace V1 contract. It does not change the workspace envelope, `/api/workspace` PATCH allowlist, or execution boundary.

## Non-Negotiable Boundary

- Workspace remains the product object.
- Browser remains config and status UI.
- Browser does not execute source/provider calls.
- Browser does not receive source credentials, API keys, webhook secrets, or bridge secrets.
- Widgets persist references and generic filter clauses only.
- `/api/workspace` PATCH allowlist remains `dashboards`, `widgetTypes`, and `canvas`.

## Universal Source Types

Chart and view widgets can bind to source objects through additive `widget.config.binding` fields:

- `managed-integrations`: connected integrations discovered through Bridge/BYO authority.
- `custom-api-webhooks`: universal API/webhook object sources identified by stable endpoint references.

The UI does not encode provider object types. It renders the normalized object shape returned by a server-side resolver.

## Persisted Binding Shape

```js
binding: {
  mode: "integration",
  sourceType: "managed-integrations",
  sourceAuthority: "growthub-bridge",
  integrationId: "stable-integration-id",
  lane: "data-source",
  entityId: "stable-source-object-id",
  entityType: "adapter-provided-type",
  entityLabel: "display-only label"
}
```

Custom API/webhook sources persist the same class of stable references:

```js
binding: {
  mode: "json",
  sourceType: "custom-api-webhooks",
  sourceAuthority: "custom-api",
  endpointRef: "stable-endpoint-reference",
  fields: ["id", "label", "status"]
}
```

## Generic Filter Shape

```js
filter: {
  op: "and",
  clauses: [
    { fieldId: "id", operator: "eq", value: "stable-source-object-id" }
  ]
}
```

Filter field choices come from:

- normalized object root keys: `id`, `label`, `secondaryLabel`, `entityType`, `provider`, `lane`, `status`
- keys present in the returned object `metadata`
- fields explicitly declared by a custom API/webhook source

There is no provider-type allowlist and no hard-coded provider field map.

## Normalized Source Object

Server-side object resolvers normalize every object to:

```js
{
  id: "stable-source-object-id",
  label: "display label",
  secondaryLabel: "optional secondary label",
  entityType: "optional adapter-provided type",
  provider: "optional adapter/provider slug",
  lane: "optional adapter lane",
  status: "optional adapter status",
  metadata: {}
}
```

If no real resolver exists, the API returns an empty list and `requiresObjectResolver: true`. It does not fabricate demo client objects.

## Runtime Route

`GET /api/workspace/integration-entities?integrationId=<id>`

This route is server-side. It may use Bridge/BYO connection authority to locate a configured object resolver, but object data must come from a real resolver path. The browser only calls this local route.

## Compatibility

Legacy widgets continue to load:

- manual rows
- JSON bindings
- CSV bindings
- existing chart `values`
- existing view `columns` and `rows`

All V1.1 fields are optional and live under `widget.config`.

## Validation Checklist

- Existing V1 widgets load unchanged.
- Source picker can select static, managed integration, or custom API/webhook source types.
- Integration source selection writes only `binding` reference fields.
- Object selection writes only `binding.entityId` and generic `filter.clauses`.
- Filter field/value dropdowns are derived from returned normalized objects, not provider assumptions.
- Save/reload preserves binding and filter config.
- No source credentials are stored in widget config.
- PATCH unknown top-level fields still fail.
- PATCH `dashboards`, `widgetTypes`, and `canvas` still succeeds.
