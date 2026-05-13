# MCP, Chrome, and tool connectors

AWaC keeps **authority on the server**: MCP sessions, Chrome bridges, and local tool CLIs are reached through resolver `fetchRecords` / optional `listEntities`, sandbox adapters, or serverless scheduler rows — never by embedding tokens into `growthub.config.json`.

Recommended pattern:

1. Model the connector as an **API Registry** row plus optional **Data Source** with `binding.sourceStorage: "workspace-source-records"`.
2. Implement a resolver whose `integrationId` matches the registry row.
3. Use `POST /api/workspace/test-source` before binding widgets to the Data Source.
4. For actions that mutate external systems, prefer **sandbox** lanes (`runLocality: local` with `local-agent-host`, or `serverless` with a scheduler API Registry row) so outputs land in `growthub.source-records.json`.

The `mcp-tool` and `chrome-bridge` templates are scaffolds — replace `integrationId` values with your registered resolver slug after you add resolver files.
