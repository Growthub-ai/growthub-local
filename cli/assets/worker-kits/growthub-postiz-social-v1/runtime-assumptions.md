# Runtime Assumptions

**Frozen at kit creation: 2026-04-15. Update when upstream Postiz behavior changes.**

---

## Execution modes

| Mode | Requirements | Fork used? | Accuracy |
|---|---|---|---|
| `local-fork` | Node 22.x, pnpm, Postiz clone, Postgres + Redis per Postiz docs | Yes | Highest |
| `agent-only` | None | No | Good — planning only |
| `hybrid` | Fork for inspection + agent drafting without running servers | Partial | High |

### Choosing a mode

- **`local-fork`** when validating API routes, env var names, or queue behavior against real code.
- **`agent-only`** when producing calendars and copy packs without a clone.
- **`hybrid`** when the fork exists but operators are not starting Docker services.

---

## Postiz upstream snapshot (conceptual)

**Repo:** https://github.com/gitroomhq/postiz-app  
**License:** AGPL-3.0

| Area | Assumption |
|---|---|
| Package manager | pnpm workspaces (`packageManager` in root package.json) |
| Runtimes | Node 22.x per upstream `engines` at time of writing |
| Apps | `apps/backend`, `apps/frontend`, `apps/orchestrator`, optional `apps/extension` |
| Data | Prisma schema under `libraries/nestjs-libraries/src/database/prisma/` |
| Infra | PostgreSQL + Redis + Temporal (per upstream stack — confirm in fork) |

Always prefer the fork's `README.md` and official quickstart over this table.

---

## AEO / SEO scope boundary

This kit assumes **distribution and repurposing** workstreams. Technical GEO audits belong in `growthub-geo-seo-v1`. Cross-link pillar URLs and measurement, but do not restate GEO scoring formulas here.

---

## Compliance

Postiz positions itself around OAuth and non-scraping automation. Plans must not recommend violating platform Terms or scraping private data.
