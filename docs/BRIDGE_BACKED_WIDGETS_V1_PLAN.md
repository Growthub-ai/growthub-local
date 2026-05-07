# Universal Source Object Widget Binding Plan

Workspace widgets bind to universal source objects. A source object can come from a managed integration, a custom API, or a webhook-backed object resolver. The browser does not know provider-specific object types, does not call provider APIs, and does not receive source credentials.

## Persisted Shape

Widgets persist only references and generic filter clauses:

```js
binding: {
  mode: "integration",
  sourceType: "managed-integrations",
  sourceAuthority: "growthub-bridge",
  integrationId: "stable-integration-id",
  lane: "data-source",
  entityId: "stable-source-object-id",
  entityType: "adapter-provided-object-type",
  entityLabel: "display-only label"
}

filter: {
  op: "and",
  clauses: [
    { fieldId: "id", operator: "eq", value: "stable-source-object-id" }
  ]
}
```

Custom API/webhook sources use the same pattern:

```js
binding: {
  mode: "json",
  sourceType: "custom-api-webhooks",
  sourceAuthority: "custom-api",
  endpointRef: "stable-endpoint-reference",
  fields: ["id", "label", "status"]
}
```

## Source Object Contract

Server-side object resolvers normalize every source object to:

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

The UI builds filter fields from the normalized root keys and from `metadata` keys returned by the resolver. There is no provider-type allowlist and no hard-coded provider field map.

## Authority Boundary

- Bridge and BYO adapters discover connected integrations.
- Server-side object resolvers fetch real API/webhook objects.
- Browser calls only local workspace routes.
- Widget config stores references and filter clauses, never credentials.
- `/api/workspace` PATCH allowlist remains `dashboards`, `widgetTypes`, and `canvas`.

## Required Route

`GET /api/workspace/integration-entities?integrationId=<id>`

Returns real normalized objects when a resolver exists:

```js
{
  integrationId: "stable-integration-id",
  entities: [],
  source: "resolver",
  requiresObjectResolver: false,
  authority: "growthub-bridge"
}
```

When no resolver exists, it returns no fabricated objects:

```js
{
  integrationId: "stable-integration-id",
  entities: [],
  source: "none",
  requiresObjectResolver: true,
  authority: "growthub-bridge"
}
```
