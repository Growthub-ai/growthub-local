# Agency Portal Starter — Runtime Assumptions

- **Node**: >= v20 for Growthub CLI parity and Next.js/Vite local development.
- **Git**: required on PATH for fork-sync and remote operations.
- **Local-first shell**: `studio/` uses Vite + React and must remain runnable without Vercel.
- **Cloud app**: `apps/agency-portal/` is the Vercel/serverless app payload.
- **Persistence**: selected by `AGENCY_PORTAL_DATA_ADAPTER`, not by kit identity.
- **Auth**: selected by `AGENCY_PORTAL_AUTH_ADAPTER`.
- **Payments**: selected by `AGENCY_PORTAL_PAYMENT_ADAPTER`.
- **Integrations**: selected by `AGENCY_PORTAL_INTEGRATION_ADAPTER` as `static`, `growthub-bridge`, or `byo-api-key`.
- **Growthub bridge**: the first-party hosted path reads normalized connection state from GH app MCP authority. The starter never queries `mcp_connections` directly and never stores raw provider tokens in source.
- **BYO API key**: supported through `AGENCY_PORTAL_BYO_CONNECTIONS_JSON` and named env vars, using the same normalized integration object shape as the bridge path.
- **Windsor AI**: first-class data pipeline object. It is not a database adapter. Google Sheets blended data is modeled as a companion data pipeline destination.
- **Fork registration**: exported workspaces carry `.growthub-fork/fork.json`, `policy.json`, `project.md`, and `trace.jsonl`.
- **Bundled sources**: paths in `kit.json.frozenAssetPaths` are upstream-owned and reviewed by fork sync.
