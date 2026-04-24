# Portal Brief

Client:
Project slug:
Owner:
Date:

## Desired Outcome

Describe the agency portal outcome in plain language.

## Runtime Surfaces

- Local-first operator shell: `studio/`
- Vercel app payload: `apps/agency-portal/`
- Vercel root directory: `apps/agency-portal`

## Adapter Decisions

- `AGENCY_PORTAL_DATA_ADAPTER`:
- `AGENCY_PORTAL_AUTH_ADAPTER`:
- `AGENCY_PORTAL_PAYMENT_ADAPTER`:
- `AGENCY_PORTAL_REPORTING_ADAPTER`:
- `AGENCY_PORTAL_INTEGRATION_ADAPTER`:

## Data Pipeline Objects

Mark each as `connected`, `available`, or `not used`.

- Windsor AI:
- Google Sheets blended data:
- Google Analytics:
- Shopify:
- Meta Facebook/Instagram:

## MCP Connection Integrations

Mark each as `connected`, `available`, or `not used`.

- Asana:
- Slack:
- GoHighLevel:
- Google Drive:
- Notion:

## Growthub Bridge Or BYO Setup

Bridge fields:

- `GROWTHUB_BRIDGE_BASE_URL`:
- `GROWTHUB_BRIDGE_INTEGRATIONS_PATH`:
- `GROWTHUB_BRIDGE_ACCESS_TOKEN`: set in env, never written here

BYO fields:

- `AGENCY_PORTAL_BYO_CONNECTIONS_JSON`: set in env, never write raw secrets here
- Named provider env vars:

## Acceptance Criteria

- Local Vite shell builds.
- Next/Vercel app builds.
- `/settings/integrations` renders a dedicated sidebar page.
- Active bridge/BYO connection rows show as connected.
- Deployment handoff is complete.
