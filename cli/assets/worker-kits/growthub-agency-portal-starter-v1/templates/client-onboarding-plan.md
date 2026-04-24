# Client Onboarding Plan

Client:
Portal project:
Primary operator:

## Step 1 — Fork And Validate

```bash
growthub kit download growthub-agency-portal-starter-v1 --out ./agency-portal-workspace --yes
growthub kit fork register ./agency-portal-workspace/growthub-agent-worker-kit-agency-portal-starter-v1
growthub kit fork status <fork-id>
```

## Step 2 — Local Setup

```bash
bash setup/check-deps.sh
node setup/verify-env.mjs
cd studio && npm install && npm run build
cd ../apps/agency-portal && npm install && npm run build
```

## Step 3 — Integration Authority

Choose one:

- `growthub-bridge`: use hosted Growthub GH app MCP connections.
- `byo-api-key`: configure `AGENCY_PORTAL_BYO_CONNECTIONS_JSON` and named provider env vars.
- `static`: use starter catalog only for local planning.

## Step 4 — Data Pipeline Objects

- Windsor AI:
- Google Sheets blended data:
- Google Analytics:
- Shopify:
- Meta Facebook/Instagram:

## Step 5 — MCP Connection Integrations

- Asana:
- Slack:
- GoHighLevel:
- Google Drive:
- Notion:

## Step 6 — Vercel + GitHub

- GitHub repo:
- Vercel project:
- Root directory: `apps/agency-portal`
- Build command: `npm run build`
- Required env copied:
- Preview URL:
- Production URL:
