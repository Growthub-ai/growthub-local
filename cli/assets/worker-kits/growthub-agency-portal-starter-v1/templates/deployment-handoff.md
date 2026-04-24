# Deployment Handoff

Client:
Project:
Fork id:
GitHub repo:
Vercel project:

## Validated Commands

```bash
node setup/verify-env.mjs
cd studio && npm run build
cd apps/agency-portal && npm run build
growthub kit fork status <fork-id>
```

## Vercel Settings

- Root directory: `apps/agency-portal`
- Install command: `npm install`
- Build command: `npm run build`
- Framework preset: Next.js

## Environment

```text
AGENCY_PORTAL_DEPLOY_TARGET=vercel
AGENCY_PORTAL_DATA_ADAPTER=
AGENCY_PORTAL_AUTH_ADAPTER=
AGENCY_PORTAL_PAYMENT_ADAPTER=
AGENCY_PORTAL_REPORTING_ADAPTER=
AGENCY_PORTAL_INTEGRATION_ADAPTER=
```

Growthub bridge env, if used:

```text
GROWTHUB_BRIDGE_BASE_URL=
GROWTHUB_BRIDGE_INTEGRATIONS_PATH=/api/mcp/accounts
GROWTHUB_BRIDGE_ACCESS_TOKEN=<set in Vercel only>
GROWTHUB_BRIDGE_USER_ID=<set when the selected bridge endpoint requires explicit user scoping>
```

BYO env, if used:

```text
AGENCY_PORTAL_BYO_CONNECTIONS_JSON=<set in Vercel only>
WINDSOR_API_KEY=<set in Vercel only when BYO Windsor is used>
```

## Integration Validation

- `/settings/integrations` loaded:
- Data pipeline objects connected:
- MCP connection integrations connected:
- Active badges match Growthub bridge or BYO metadata:

## Handoff Notes

Record any remaining manual steps, provider-side OAuth actions, or client account permissions.
