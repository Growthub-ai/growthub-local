# Agency Portal Starter — Validation Checklist

- [ ] `kit.json` is schema-v2 valid and identifies `growthub-agency-portal-starter-v1`.
- [ ] Every path in `kit.json.frozenAssetPaths` exists.
- [ ] `SKILL.md`, `templates/project.md`, `templates/self-eval.md`, `helpers/README.md`, and `skills/README.md` are present.
- [ ] `studio/` builds with `npm run build`.
- [ ] `apps/agency-portal/` builds with `npm run build`.
- [ ] `node setup/verify-env.mjs` validates the selected adapters.
- [ ] Vercel root is `apps/agency-portal`.
- [ ] Persistence adapter is documented as `postgres`, `qstash-kv`, or `provider-managed`.
- [ ] Auth and payment adapters are documented without provider lock-in.
- [ ] Integration adapter is documented as `static`, `growthub-bridge`, or `byo-api-key`.
- [ ] `/settings/integrations` renders a dedicated sidebar nav page, not home-page integration content.
- [ ] Data pipeline objects are explicit: Windsor AI, Google Sheets blended data, Google Analytics, Shopify, Meta Facebook/Instagram.
- [ ] MCP connection integrations are explicit: Asana, Slack, GoHighLevel, Google Drive, Notion.
- [ ] Growthub bridge mode shows active/connected status when normalized MCP account rows are returned by the bridge.
- [ ] `growthub-connection-normalizer.ts` accepts both SDK/profile-style `integrations[]` and GH app MCP `accounts[]` payloads.
- [ ] Unknown active MCP providers are preserved as discovered workspace integrations instead of being dropped.
- [ ] BYO API key mode works from `AGENCY_PORTAL_BYO_CONNECTIONS_JSON` using the same object shape.
- [ ] Windsor BYO mode works with `WINDSOR_API_KEY` alone and renders Windsor AI as connected.
- [ ] Windsor API key path is supported as `WINDSOR_API_KEY` and represented as a first-class data pipeline object.
- [ ] CLI discovery/list/export path succeeds:
  ```bash
  growthub kit list --family studio --json
  growthub kit download growthub-agency-portal-starter-v1 --out /tmp/agency-portal-qa --yes
  ```
- [ ] Fork registration/status path succeeds on an exported workspace:
  ```bash
  growthub kit fork register /tmp/agency-portal-qa/growthub-agent-worker-kit-agency-portal-starter-v1
  growthub kit fork status <fork-id>
  ```
- [ ] Governed forks record material changes to `.growthub-fork/project.md` and `.growthub-fork/trace.jsonl`.
