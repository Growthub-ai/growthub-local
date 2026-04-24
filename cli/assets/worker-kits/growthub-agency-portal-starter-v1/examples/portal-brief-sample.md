# Portal Brief Sample

Client: Acme Growth Studio  
Workspace: agency-portal-v1  
Goal: operate client reporting, task follow-up, and campaign visibility from a governed Growthub worker-kit fork.

## Runtime Choice

- Local operator shell: `studio/`
- Deployable app: `apps/agency-portal/`
- Vercel root: `apps/agency-portal`
- GitHub/Vercel deployment: connected through the user's normal GitHub and Vercel project flow.

## Adapter Choice

- Persistence: `provider-managed`
- Auth: `provider-managed`
- Payments: `none`
- Integrations: `growthub-bridge`
- Reporting: `windsor`

## Data Pipeline Objects

- Windsor AI: connected through Growthub bridge.
- Google Sheets blended data: enabled as the Windsor blended data destination.
- Google Analytics: active through GH app MCP connection authority.
- Shopify: active through GH app MCP connection authority.
- Meta Facebook/Instagram: active through GH app MCP connection authority.

## MCP Connection Integrations

- Asana: active.
- Slack: active.
- GoHighLevel: pending.
- Google Drive: active.
- Notion: pending.

## Production Readiness

- `node setup/verify-env.mjs` passes.
- `studio/` builds.
- `apps/agency-portal/` builds.
- `/settings/integrations` shows active badges for bridge-returned connections.
- `growthub kit fork status <fork-id>` has been captured in `output/acme/agency-portal-v1/trace-summary.md`.
