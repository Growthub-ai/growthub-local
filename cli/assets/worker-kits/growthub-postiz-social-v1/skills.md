# Postiz Social Operator — Master Skill Doc

**Read completely before any task.**

---

## Quick reference

| Resource | Path |
|---|---|
| Agent operating law | `workers/postiz-social-operator/CLAUDE.md` |
| Brand kit template | `brands/_template/brand-kit.md` |
| Example brand kit | `brands/growthub/brand-kit.md` |
| Output contract | `output-standards.md` |
| Runtime assumptions | `runtime-assumptions.md` |
| Fork integration | `docs/postiz-fork-integration.md` |
| Stack notes | `docs/agentic-scheduler-stack.md` |
| Multi-workspace | `docs/multi-workspace-ops.md` |
| API / automation | `docs/api-and-automation.md` |
| Calendar template | `templates/calendar-week-plan.md` |
| Channel mix | `templates/channel-mix-matrix.md` |
| Sprint brief | `templates/content-sprint-brief.md` |
| Launch pack | `templates/launch-post-pack.md` |
| Analytics | `templates/analytics-readout.md` |

---

## Pre-task gate (answer before writing)

1. Client slug and project slug?
2. Execution mode: `local-fork`, `agent-only`, or `hybrid`?
3. Primary channels and objective for this engagement?
4. Do pillar URLs / AEO tie-ins exist?
5. Is the Postiz fork present at `POSTIZ_FORK_PATH` (default `~/postiz-app`)?

---

## Command → template mapping

| User intent | Primary templates (in order) |
|---|---|
| Weekly schedule | CalendarWeekPlan → ChannelMixMatrix |
| Launch / release | ContentSprintBrief → LaunchPostPack → CalendarWeekPlan |
| Performance review | AnalyticsReadout → ChannelMixMatrix (rebalance) |
| Automation design | ContentSprintBrief (automation section) → docs/api-and-automation.md |

---

## Fork inspection order (local-fork / hybrid)

1. `README.md`
2. `package.json` scripts (`dev`, `dev-backend`, `dev-frontend`)
3. `apps/backend` and `apps/frontend` top-level structure
4. Prisma schema path under `libraries/nestjs-libraries/src/database/prisma/`

If inspection fails, label outputs `repo-unverified` and stay in agent-only patterns.

---

## Critical rules

| Rule | Meaning |
|---|---|
| Templates are law | Do not invent new section schemas |
| No secrets | Never paste tokens or OAuth payloads |
| AGPL awareness | Remind stakeholders Postiz is AGPL-3.0 |
| GEO is separate | Defer technical AI-search audits to `growthub-geo-seo-v1` |
| Measure honestly | Use `<!-- data-gap -->` when metrics are unknown |
