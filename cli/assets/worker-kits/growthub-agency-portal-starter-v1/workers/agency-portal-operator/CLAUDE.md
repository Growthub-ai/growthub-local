# Agency Portal Operator — Agent Operating Instructions

**Kit:** `growthub-agency-portal-starter-v1`  
**Worker ID:** `agency-portal-operator`  
**Version:** `1.0.0`

## Role

You operate the Agency Portal Starter as a governed workspace built from the custom workspace starter primitive. Keep the Growthub local-first Vite shell in `studio/`; operate the deployable Vercel/serverless portal under `apps/agency-portal/`.

## Source Of Truth

1. `.growthub-fork/project.md`
2. `SKILL.md`
3. `skills.md`
4. `docs/governed-workspace-primitives.md`
5. `docs/adapter-contracts.md`
6. `docs/vercel-serverless-deployment.md`
7. `docs/vite-ui-shell-guide.md`
8. `validation-checklist.md`

## Hard Rules

- Do not collapse the kit into the Vercel app. The kit root is the governed workspace; `studio/` is the local-first Vite operator shell; `apps/agency-portal/` is the serverless app payload.
- Do not hardcode one database provider into the worker-kit contract. Persistence is selected by adapter env: `postgres`, `qstash-kv`, or `provider-managed`.
- Do not hardcode payments. Payments are selected by `AGENCY_PORTAL_PAYMENT_ADAPTER`.
- Do not move third-party provider tokens into source. Growthub bridge mode consumes hosted GH app connection state; BYO mode references env names and normalized metadata only.
- Do not place integration lists on the home dashboard. Use the dedicated sidebar route `/settings/integrations`.
- Do not collapse data pipelines and operational integrations into one opaque bucket. Data pipeline objects and MCP connection integrations stay distinct under the unified integrations page.
- Do not treat cloud deployment as the local runtime. Local Growthub operation stays first; Vercel is the clean serverless deployment lane.
- Every material change in a governed fork records to `.growthub-fork/project.md` and `.growthub-fork/trace.jsonl`.

## Integration Model

Model the GH app primitive without importing the GH app runtime:

- Catalog metadata: `id`, `provider`, `name`, `description`, `category`, `authType`.
- User connection state: `isConnected`, `isActive`, `connectionId`, `connectionMetadata`.
- Worker-kit lane: `lane`, `objectType`, `authPath`, `setupMode`.

Data pipeline objects:

- Windsor AI
- Google Sheets blended data
- Google Analytics
- Shopify
- Meta Facebook/Instagram

MCP connection integrations:

- Asana
- Slack
- GoHighLevel
- Google Drive
- Notion

`growthub-bridge` means hosted GH app authority resolves active connections. `byo-api-key` means the exported workspace owns explicit setup through env vars and `AGENCY_PORTAL_BYO_CONNECTIONS_JSON`.

## Verification

```bash
bash setup/check-deps.sh
node setup/verify-env.mjs
cd studio && npm install && npm run build
cd apps/agency-portal && npm install && npm run build
```

CLI export/fork verification:

```bash
growthub kit list --family studio --json
growthub kit download growthub-agency-portal-starter-v1 --out /tmp/agency-portal-qa --yes
growthub kit fork register /tmp/agency-portal-qa/growthub-agent-worker-kit-agency-portal-starter-v1
growthub kit fork status <fork-id>
```
