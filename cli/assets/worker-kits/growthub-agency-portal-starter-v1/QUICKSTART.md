# Agency Portal Starter Kit — Quickstart

This kit is a governed Growthub workspace first. It contains two runtime surfaces:

- `studio/` — local-first Vite operator shell.
- `apps/agency-portal/` — Vercel-ready agency portal app.

## 0. Discover, export, and register the fork

From Growthub Local:

```bash
growthub discover
growthub kit list --family studio
growthub kit download growthub-agency-portal-starter-v1 --out ./agency-portal-workspace --yes
growthub kit fork register ./agency-portal-workspace
growthub kit fork status <fork-id>
```

Natural-language prompt for an agent after export:

```text
Read SKILL.md, skills.md, QUICKSTART.md, docs/adapter-contracts.md, and workers/agency-portal-operator/CLAUDE.md. Set up the local Vite shell, validate the Next/Vercel app, configure either Growthub bridge integrations or BYO API key integration metadata, then produce a deployment handoff for Vercel + GitHub.
```

The exported directory is the governed environment. Do not move `apps/agency-portal/` out of the workspace root; the fork primitives live beside it.

## 1. Verify the governed workspace

```bash
bash setup/check-deps.sh
node setup/verify-env.mjs
```

Set adapter env in `.env` or your shell. Defaults are documented in `.env.example`.

## 2. Run the local Growthub shell

```bash
cd studio
npm install
npm run dev
```

This validates local-first Vite support without requiring Vercel, database setup, Windsor, or third-party API credentials.

## 3. Run the Vercel app locally

```bash
cd apps/agency-portal
npm install
npm run dev
```

Open `/settings/integrations` to validate the dedicated integrations page. It renders:

- Data pipeline objects: Windsor AI, Google Sheets blended data, Google Analytics, Shopify, Meta Facebook/Instagram.
- MCP connection integrations: Asana, Slack, GoHighLevel, Google Drive, Notion.

## 4. Choose integration authority

Use the first-party Growthub bridge when the user already has connections in the hosted GH app:

```text
AGENCY_PORTAL_INTEGRATION_ADAPTER=growthub-bridge
GROWTHUB_BRIDGE_BASE_URL=<growthub-gh-app-url>
GROWTHUB_BRIDGE_INTEGRATIONS_PATH=/api/mcp/accounts
GROWTHUB_BRIDGE_ACCESS_TOKEN=<growthub-issued-bridge-token>
GROWTHUB_BRIDGE_USER_ID=<growthub-auth-user-id>
```

Use BYO API key setup only when the workspace owner wants explicit local/provider setup:

```text
AGENCY_PORTAL_INTEGRATION_ADAPTER=byo-api-key
WINDSOR_API_KEY=<set locally or in Vercel>
AGENCY_PORTAL_BYO_CONNECTIONS_JSON=[{"id":"slack","provider":"slack","status":"connected","secretEnvName":"SLACK_BOT_TOKEN"}]
```

Both paths normalize into the same integration object shape. The bridge path is lower friction because Growthub GH app owns user auth, provider tokens, account IDs, scopes, and MCP verification.

## 5. Deploy to Vercel

Use `apps/agency-portal` as the Vercel project root. Configure adapter env according to `docs/adapter-contracts.md`.

Production deployment checklist:

```bash
cd apps/agency-portal
npm install
npm run build
```

Then connect the GitHub repo to Vercel with root directory `apps/agency-portal`. Reuse the Growthub GH app connection bridge for user-owned integrations where available.

## 6. Governed operation

Read `SKILL.md`, `skills.md`, and `workers/agency-portal-operator/CLAUDE.md` before material changes. Inside a registered fork, record material changes to `.growthub-fork/project.md` and `.growthub-fork/trace.jsonl`.
