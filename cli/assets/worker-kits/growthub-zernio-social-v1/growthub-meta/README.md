# Growthub Meta — growthub-zernio-social-v1

---

## Kit Identity

| Field | Value |
|---|---|
| Kit ID | `growthub-zernio-social-v1` |
| Version | `1.0.0` |
| Schema Version | `2` |
| Type | `worker` |
| Family | `studio` |
| Factory family (adapter core) | `operator` |
| Execution Mode | `export` |
| Activation Modes | `["export"]` |
| Visibility | `public-open-source` |
| Source Repo | `growthub-local` |
| Frozen At | `2026-04-15T00:00:00.000Z` |
| Kernel packet | [Hosted SaaS Kit Kernel Packet `v1`](../../../../docs/kernel-packets/KERNEL_PACKET_HOSTED_SAAS_KIT.md) — this kit is the canonical reference implementation |

---

## What This Kit Does

The Growthub Zernio Social Media Studio is a worker kit that wraps the [Zernio](https://zernio.com) REST API — a unified social media API for developers and AI agents — to produce AI-assisted social media campaigns, content calendars, caption copy decks, Zernio-shaped scheduling manifests, and recurring queue definitions across 14 social platforms.

The kit provides a self-contained local execution environment. An operator exports the kit, points Claude Code's Working Directory at the kit root, and the `zernio-social-operator` worker handles the complete 10-step social media campaign workflow.

Zernio is a hosted SaaS: there is no docker image or local fork to clone. The kit works against the hosted `https://zernio.com/api/v1` endpoint using an API key, and the exported `studio/` workspace is the user-facing UI shell.

---

## Folder Structure

```
growthub-zernio-social-v1/
  kit.json                              ← Kit manifest (schemaVersion: 2)
  QUICKSTART.md                         ← Setup guide
  .env.example                          ← Worker-kit environment template
  skills.md                             ← Master methodology doc (read at every session)
  output-standards.md                   ← Output naming, structure, quality bar
  runtime-assumptions.md                ← Frozen upstream assumptions
  validation-checklist.md               ← Pre-session + kit validation checklists
  bundles/
    growthub-zernio-social-v1.json      ← Bundle manifest
  workers/
    zernio-social-operator/
      CLAUDE.md                         ← Agent operating instructions (entrypoint)
  brands/
    _template/
      brand-kit.md                      ← Blank client brand kit template
    growthub/
      brand-kit.md                      ← Growthub internal reference example
    NEW-CLIENT.md                       ← Instructions for adding new clients
  setup/
    setup.mjs                           ← One-command cross-platform bootstrap (Win/Mac/Linux)
    verify-env.mjs                      ← Verifies API key, profile, reachability
    check-deps.sh                       ← Legacy Unix bash dep check
    check-deps.mjs                      ← Cross-platform Node dep check (Windows parity)
    install-mcp.mjs                     ← Prints per-IDE MCP server config JSON
  output/
    README.md                           ← Output directory structure and naming
  templates/                            ← 7 production-quality campaign templates
    social-campaign-brief.md
    content-calendar.md
    platform-publishing-plan.md
    caption-copy-deck.md
    scheduling-manifest.md
    analytics-brief.md
    client-proposal.md
  examples/                             ← 4 filled samples for reference
    social-campaign-sample.md
    content-calendar-sample.md
    analytics-brief-sample.md
    client-proposal-sample.md
  docs/                                 ← 6 technical reference documents
    zernio-api-integration.md
    platform-coverage.md
    ai-caption-layer.md
    posts-and-queues-layer.md
    growthub-agentic-social-platform-ui-shell.md ← Exported UI-shell workflow and setup truth
    local-adapters.md                   ← Per-IDE matrix (Claude/Codex/Cursor/Gemini/OpenCode/…)
  growthub-meta/
    README.md                           ← This file
    kit-standard.md                     ← Kit rules and required-files contract
```

---

## Activation

This kit is activated in `export` mode:

1. CLI exports the kit to a local folder
2. User points Claude Code's Working Directory at the exported folder root
3. `workers/zernio-social-operator/CLAUDE.md` is the agent entrypoint

No server-side activation is required. The kit is fully self-contained.

---

## Upstream API

| Field | Value |
|---|---|
| Provider | Zernio |
| Site | https://zernio.com |
| Docs | https://docs.zernio.com |
| API base | `https://zernio.com/api/v1` |
| Auth | Bearer API key (`sk_` + 64 hex) via `Authorization` header |
| Env vars used | `ZERNIO_API_KEY`, `ZERNIO_API_URL`, `ZERNIO_PROFILE_ID`, `ZERNIO_TIMEZONE` (optional), `ANTHROPIC_API_KEY` (optional) |
| Supported platforms | 14 — see `docs/platform-coverage.md` |

---

## Supported Output Categories

| Category | Templates | Examples |
|---|---|---|
| Social Campaign Briefs | `templates/social-campaign-brief.md` | `examples/social-campaign-sample.md` |
| Content Calendars | `templates/content-calendar.md` | `examples/content-calendar-sample.md` |
| Platform Publishing Plans | `templates/platform-publishing-plan.md` | — |
| Caption Copy Decks | `templates/caption-copy-deck.md` | — |
| Scheduling Manifests | `templates/scheduling-manifest.md` | — |
| Analytics Briefs | `templates/analytics-brief.md` | `examples/analytics-brief-sample.md` |
| Client Proposals | `templates/client-proposal.md` | `examples/client-proposal-sample.md` |

---

## Related Kits

| Kit | Family | Purpose |
|---|---|---|
| `creative-strategist-v1` | workflow | Campaign strategy and creative briefs |
| `growthub-email-marketing-v1` | operator | Email marketing campaigns |
| `growthub-open-higgsfield-studio-v1` | studio | AI video generation via Open Higgsfield |
| `growthub-geo-seo-v1` | studio | GEO + SEO auditing |
| `growthub-zernio-social-v1` | studio | Social media via hosted Zernio REST API (this kit) |

### Exported Workspace Truth

The exported worker kit is the only user-facing workspace. Inside that exported folder, `studio/` is the Vite UI shell and the rest of the kit provides the Zernio operator law, templates, setup scripts, and API contract. The CLI is responsible only for exporting this workspace cleanly.
