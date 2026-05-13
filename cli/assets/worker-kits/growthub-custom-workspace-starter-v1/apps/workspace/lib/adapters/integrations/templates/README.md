# Resolver template library

Shipped templates under this directory are **metadata-only** seeds. They do not register resolvers or execute providers.

- Add a new `*.js` file exporting a `default` object with `schemaVersion: "growthub-resolver-template-v1"`.
- Register the module in `template-registry.js`.
- Implement real HTTP/MCP/tool behavior in `lib/adapters/integrations/resolvers/<integrationId>.js` using `registerSourceResolver`.

Runtime surfaces:

- `GET /api/workspace/resolver-templates` — list templates
- `GET /api/workspace/resolver-templates?templateId=<id>` — fetch one
