---
name: growthub-agency-portal-starter-v1
description: First-party governed workspace starter for agency portals. Use when creating a composable agency operations portal that must run locally through the Growthub Vite workspace shell and deploy cleanly to Vercel with thin persistence/auth/payment adapters for Postgres, Qstash KV, or provider-managed backends.
triggers:
  - agency portal starter
  - agency operations portal
  - composable worker kit
  - vercel agency portal
  - multi database portal
  - fork growthub-agency-portal-starter-v1
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Governed workspace primitives remain present and declared in kit.json frozenAssetPaths.
    - Local-first Vite operator shell under studio/ remains runnable independently from Vercel deployment.
    - Vercel app under apps/agency-portal/ depends on adapter contracts, not provider-specific kit identity.
    - Persistence remains configurable through AGENCY_PORTAL_DATA_ADAPTER with Postgres, Qstash KV, and provider-managed options documented.
    - Integration settings remain configurable through AGENCY_PORTAL_INTEGRATION_ADAPTER with Growthub bridge authority and static local catalog options documented.
    - Windsor AI and Google Sheets blended data remain first-class data pipeline objects.
    - GH app integration primitives are represented as catalog metadata plus normalized user connection state; the starter consumes bridge output and does not query hosted databases directly.
    - Auth and payment surfaces remain thin adapter contracts selected by environment variables.
    - .growthub-fork/project.md and .growthub-fork/trace.jsonl receive records for material changes inside a governed fork.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers: []
subSkills: []
mcpTools: []
---

# Agency Portal Starter — Governed Workspace

This kit is built from the custom workspace starter primitive. It preserves the Growthub local-first workspace shape and adds an adapter-first agency portal app.

## Boundaries

- `studio/` — Vite + React local operator shell for Growthub Local.
- `apps/agency-portal/` — Vercel-ready serverless app payload.
- `lib/adapters/*` inside the app — thin persistence/auth/payment/integration contracts.
- `apps/agency-portal/app/api/settings/integrations/route.ts` — normalized Settings lanes for data sources and workspace integrations.
- `apps/agency-portal/app/settings/integrations/page.tsx` — dedicated integrations UI modeled after the GH app integration page primitive.
- `.growthub-fork/` in exported forks — identity, policy, session memory, trace, and optional authority.

## Integration primitives

Use the GH app mental model:

1. Catalog metadata describes what can be connected.
2. User connection state describes what is active for the signed-in user.
3. Provider tokens remain in hosted authority or explicit env vars, never in source.
4. The portal renders a single integrations page with separate object lanes.

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

## Read order

1. `.growthub-fork/project.md`
2. `SKILL.md`
3. `skills.md`
4. `docs/governed-workspace-primitives.md`
5. `docs/adapter-contracts.md`
6. `docs/vercel-serverless-deployment.md`
7. `workers/agency-portal-operator/CLAUDE.md`

## Execution verbs

- `growthub kit download growthub-agency-portal-starter-v1 --out <path>`
- `growthub kit fork register <path>`
- `growthub kit fork status <fork-id>`
- `growthub skills validate --root <path>`
- `bash setup/check-deps.sh`
- `node setup/verify-env.mjs`
- `cd studio && npm run dev`
- `cd apps/agency-portal && npm run dev`
