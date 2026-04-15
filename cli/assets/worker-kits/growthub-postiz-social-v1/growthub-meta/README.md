# Growthub Meta — growthub-postiz-social-v1

---

## Kit Identity

| Field | Value |
|---|---|
| Kit ID | `growthub-postiz-social-v1` |
| Version | `1.0.0` |
| Schema Version | `2` |
| Type | `worker` |
| Family | `operator` |
| Execution Mode | `export` |
| Activation Modes | `["export"]` |
| Visibility | `public-open-source` |
| Source Repo | `growthub-local` |
| Frozen At | `2026-04-15T00:00:00.000Z` |

---

## What This Kit Does

The Growthub Postiz Social Media Studio is a worker kit that wraps the [Postiz](https://github.com/gitroomhq/postiz-app) open-source social media scheduling platform (~28,000 GitHub stars, MIT license) to produce AI-assisted social media campaigns, content calendars, caption copy decks, and scheduling manifests across 28+ platforms.

The kit provides a self-contained local execution environment. An operator exports the kit, points Claude Code's Working Directory at the kit root, and the `postiz-social-operator` worker handles the complete 10-step social media campaign workflow.

---

## Folder Structure

```
growthub-postiz-social-v1/
  kit.json                              ← Kit manifest (schemaVersion: 2)
  QUICKSTART.md                         ← Setup guide
  .env.example                          ← Environment template
  skills.md                             ← Master methodology doc (read at every session)
  output-standards.md                   ← Output naming, structure, quality bar
  runtime-assumptions.md                ← Frozen upstream assumptions
  validation-checklist.md              ← Pre-session + kit validation checklists
  bundles/
    growthub-postiz-social-v1.json     ← Bundle manifest
  workers/
    postiz-social-operator/
      CLAUDE.md                         ← Agent operating instructions (entrypoint)
  brands/
    _template/
      brand-kit.md                      ← Blank client brand kit template
    growthub/
      brand-kit.md                      ← Growthub internal reference example
    NEW-CLIENT.md                       ← Instructions for adding new clients
  setup/
    clone-fork.sh                       ← Clones Postiz, runs docker compose up
    verify-env.mjs                      ← Verifies fork, API, workspace ID, API key
    check-deps.sh                       ← Verifies Node, Docker, docker compose, git
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
  docs/                                 ← 4 technical reference documents
    postiz-fork-integration.md
    platform-coverage.md
    ai-caption-layer.md
    bullmq-queue-layer.md
  growthub-meta/
    README.md                           ← This file
    kit-standard.md                     ← Kit rules and required-files contract
```

---

## Activation

This kit is activated in `export` mode:

1. CLI exports the kit to a local folder
2. User points Claude Code's Working Directory at the exported folder root
3. `workers/postiz-social-operator/CLAUDE.md` is the agent entrypoint

No server-side activation is required. The kit is fully self-contained.

---

## Upstream Fork

| Field | Value |
|---|---|
| Fork Repo | https://github.com/gitroomhq/postiz-app |
| License | MIT |
| Default Clone Path | `~/postiz-app` |
| Env Var Override | `POSTIZ_FORK_PATH` |
| Services | Docker Compose: Postiz app (port 3000), Redis (6379), PostgreSQL (5432) |

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
