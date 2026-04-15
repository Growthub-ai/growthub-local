# Agentic Scheduler Stack Notes

This document frames how agents should talk about Postiz without over-claiming implementation details.

---

## Runtime components (conceptual)

| Layer | Role |
|---|---|
| API (NestJS) | Auth, workspaces, scheduling, integrations |
| Web (Next.js) | Operator UI, calendars, media |
| Data (PostgreSQL + Prisma) | Accounts, posts, schedules, analytics snapshots |
| Redis / queues | Background jobs, rate limits, fan-out |
| Temporal | Durable workflows for publishing pipelines (as shipped in upstream) |

---

## What "agentic" means in this kit

- Operators produce **plans and artifacts** (Markdown) that a human or automation can execute inside Postiz or adjacent tools.
- OpenClaw and similar agents can consume the same handoff format; the kit does not ship a Postiz plugin.

---

## Safety and compliance

Postiz emphasizes platform-approved OAuth and not scraping networks. Planning outputs must:

- Avoid advising credential sharing or bypassing OAuth
- Flag jurisdiction-specific ad disclosure requirements when relevant
- Recommend human review before high-stakes regulated posts
