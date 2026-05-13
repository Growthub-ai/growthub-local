# Resolver template library

Templates live under `lib/adapters/integrations/templates/` and are registered in `template-registry.js`. Each template is **metadata only**: it suggests default API Registry / Data Source shapes and a `configSchema` for operators.

## HTTP API

- `GET /api/workspace/resolver-templates` — list all templates.
- `GET /api/workspace/resolver-templates?templateId=<id>` — fetch one template.

## Wiring a real resolver

1. Choose a template (for example `custom-http`).
2. Create an API Registry row whose `integrationId` matches the resolver you will register under `lib/adapters/integrations/resolvers/<id>.js`.
3. Drop a resolver file that calls `registerSourceResolver({ integrationId, fetchRecords, ... })`.
4. Test with `POST /api/workspace/test-source` and refresh with `POST /api/workspace/refresh-sources`.

Templates never execute network calls themselves.
