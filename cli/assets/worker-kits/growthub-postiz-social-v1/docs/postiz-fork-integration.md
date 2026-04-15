# Postiz Fork Integration

**Source repo:** https://github.com/gitroomhq/postiz-app  
**License:** AGPL-3.0 (verify compliance before redistributing modified stacks)

---

## What Postiz Is

Postiz is an open-source, self-hosted social media scheduling and automation platform (NestJS backend, Next.js frontend, Prisma/PostgreSQL, Redis, Temporal). It targets multi-workspace teams, queue-backed publishing, analytics, media workflows, and programmatic control via a public API and CLI.

The Growthub Postiz Social + AEO Studio wraps Postiz with:

- A brand kit system (per-client voice, channels, compliance)
- Structured planning templates (calendar, channel mix, launch packs, analytics readouts)
- Documentation for how agents should reason about the fork without inventing APIs
- Clear separation between **kit outputs** (Markdown in `output/`) and **running Postiz** (clone + env + database)

---

## Monorepo Layout (typical)

```
postiz-app/
  apps/
    backend/       # NestJS API
    frontend/      # Next.js app
    orchestrator/  # worker/orchestration processes
    extension/     # browser extension (optional for local dev)
    sdk/           # published SDK
  libraries/       # shared NestJS libraries, Prisma schema under nestjs-libraries
  package.json     # pnpm workspaces root — Node engines often 22.x
```

Always read the fork's `README.md` and https://docs.postiz.com/quickstart for authoritative setup. This kit does not replace those docs.

---

## Local fork bootstrap

1. Run `bash setup/clone-fork.sh` (clones to `POSTIZ_FORK_PATH` or `~/postiz-app`).
2. Configure database, Redis, and environment variables per Postiz quickstart.
3. Run development servers using the scripts in the fork's root `package.json` (for example `pnpm run dev` or filtered `dev:*` scripts).

---

## Agent rules when the fork is present

- Treat `apps/backend`, `apps/frontend`, and Prisma schema paths as **source of truth** for any integration claim.
- Do not invent REST paths, env var names, or queue names — inspect the fork or cite Postiz public docs.
- Never paste OAuth tokens, API keys, or session cookies into kit outputs.

---

## AEO / SEO adjacency

Postiz is not a GEO audit tool. For AI-search visibility audits, use `growthub-geo-seo-v1`. This kit focuses on **distribution**: channel calendars, post variants, UTM discipline, repurposing long-form into social, and measurement readouts that complement SEO/AEO programs.
