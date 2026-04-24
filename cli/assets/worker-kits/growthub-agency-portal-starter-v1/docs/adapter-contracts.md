# Adapter Contracts — Agency Portal Starter

The worker-kit contract is provider-agnostic. Concrete providers are configured through environment variables and adapter documentation, not through kit identity.

## Persistence

`AGENCY_PORTAL_DATA_ADAPTER` selects the persistence layer:

| Value | Required env | Runtime target |
|---|---|---|
| `postgres` | `DATABASE_URL` | Any Postgres-compatible database |
| `qstash-kv` | `QSTASH_KV_REST_URL`, `QSTASH_KV_REST_TOKEN` | Qstash/Vercel KV-style HTTP storage |
| `provider-managed` | Provider-specific env in `.env` | Hosted database surface managed outside the kit |

The app payload under `apps/agency-portal/` exposes these adapters as code-level interfaces. Treat any future provider-specific implementation as replaceable behind this contract.

## Auth

`AGENCY_PORTAL_AUTH_ADAPTER` selects the auth layer:

| Value | Required env |
|---|---|
| `oidc` | `AUTH_SECRET`, `AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` |
| `clerk` | provider-specific Clerk env |
| `authjs` | Auth.js-compatible env |
| `provider-managed` | provider-specific env |

## Payments

`AGENCY_PORTAL_PAYMENT_ADAPTER` selects payment support:

| Value | Required env |
|---|---|
| `none` | none |
| `stripe` | `PAYMENT_SECRET_KEY`, optional `PAYMENT_WEBHOOK_SECRET` |
| `polar` | `PAYMENT_SECRET_KEY`, optional `PAYMENT_WEBHOOK_SECRET` |

## Reporting

`AGENCY_PORTAL_REPORTING_ADAPTER` is optional. Use `windsor` for the first-party reporting path. Windsor AI is treated as a reporting/data-source adapter, not as the database. The starter keeps persistence selected by `AGENCY_PORTAL_DATA_ADAPTER`.

The intended Windsor pattern is:

1. Connect Windsor AI through the Growthub GH app/MCP bridge.
2. Use Windsor's blended data support to publish or sync blended marketing datasets into Google Sheets when spreadsheet-backed reporting is preferred.
3. Read normalized connection state through the integration adapter rather than storing Windsor, Google Analytics, Shopify, or Meta credentials in the starter app.

## Integrations

`AGENCY_PORTAL_INTEGRATION_ADAPTER` selects how Settings resolves data sources and workspace integrations:

| Value | Required env | Authority |
|---|---|---|
| `growthub-bridge` | `GROWTHUB_BRIDGE_BASE_URL`, `GROWTHUB_BRIDGE_ACCESS_TOKEN` | Growthub GH app MCP connection authority |
| `byo-api-key` | `AGENCY_PORTAL_BYO_CONNECTIONS_JSON` or `WINDSOR_API_KEY` for Windsor-only setup | Workspace-owned explicit provider setup |
| `static` | none | Local starter catalog for development and exported workspaces without hosted authority |

The bridge adapter is intentionally thin. It expects a JSON endpoint configured by `GROWTHUB_BRIDGE_INTEGRATIONS_PATH` (default `/api/mcp/accounts`) and normalizes the response into two lanes:

- **Data sources**: Windsor AI, Google Sheets blended data, Google Analytics, Shopify, Meta Facebook/Instagram.
- **Workspace integrations**: Asana, Slack, GoHighLevel, Google Drive, Notion.

The GH app authority pattern observed in `/Users/antonio/gh-app` is CMS catalog rows plus active `mcp_connections` rows. The starter does not query that database directly. It consumes the bridge API so the hosted app keeps ownership of user auth, tokens, verification, account IDs, scopes, and provider metadata.

The kit-local primitive for this is `apps/agency-portal/lib/adapters/integrations/growthub-connection-normalizer.js`. It accepts the SDK/profile-style integration shape:

```json
{ "integrations": [{ "provider": "slack", "label": "Slack", "connectedAt": "...", "scopes": [], "handle": "...", "ready": true }] }
```

It also accepts the GH app MCP accounts shape returned by `/api/mcp/accounts`:

```json
{ "success": true, "accounts": [{ "id": "...", "provider": "slack", "connectionName": "Slack", "connectionType": "oauth_first_party", "isActive": true, "isVerified": true, "metadata": {}, "createdAt": "...", "updatedAt": "...", "appSlug": "slack" }] }
```

Both shapes normalize into the same `AgencyPortalIntegration` object used by the BYO path. Unknown connected providers are preserved as discovered workspace integrations instead of being dropped.

The BYO path uses the same normalized object shape, but expects the workspace operator to provide the connection metadata and secret env names explicitly. Windsor is first-class: when `WINDSOR_API_KEY` is set with `AGENCY_PORTAL_INTEGRATION_ADAPTER=byo-api-key`, the app marks the Windsor AI data pipeline object as connected without requiring a larger JSON payload. The hosted Growthub bridge remains the lower-friction first-party path for user-owned MCP connections.
