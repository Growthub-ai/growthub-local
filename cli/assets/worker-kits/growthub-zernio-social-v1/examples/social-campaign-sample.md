# Social Campaign Brief — Growthub · Q2 2026 Agent-Native CLI Launch

**Kit:** `growthub-zernio-social-v1`
**Generated:** 2026-04-15
**Mode:** api-live
**Version:** `v1`

---

## Project Overview

| Field | Value |
|---|---|
| Client | Growthub |
| Project | Q2 2026 Agent-Native CLI Launch |
| Campaign window | 2026-05-01 → 2026-05-30 |
| Zernio profile id | prof_GRO_primary |
| Posting timezone | America/New_York |

---

## Campaign Objective

**Primary:** community growth with a strong secondary for lead generation

**Why this objective:** Growthub's flywheel is developer adoption. The CLI ships daily; every release earns a round of organic developer commentary on X, Bluesky, and LinkedIn. Q2 is the first window where the newly-shipped Agent Harness is production-ready, and the campaign goal is to convert that community interest into measurable open-source adoption (CLI downloads, GitHub stars, waitlist signups).

---

## Target Platforms

| Platform | Zernio ID | Account | Rationale |
|---|---|---|---|
| X/Twitter | `twitter` | acc_x_growthubai | Highest-signal developer community for agent tooling; lives for technical threads |
| LinkedIn | `linkedin` | acc_li_GrowthubPage | Hiring signal + thought leadership; partners and enterprise-adjacent audience |
| Bluesky | `bluesky` | acc_bsky_growthub | Tech-fluent early adopters; text-first format fits our voice |
| YouTube | `youtube` | acc_yt_GrowthubAI | Long-form CLI walkthroughs and shorts for each release |

Max 5 platforms. Fifth (Instagram) deferred — team capacity insufficient for sustained visual production this cycle.

---

## Audience Profile

### Primary

| Attribute | Value |
|---|---|
| Age range | 25–45 |
| Geography | North America + Europe, English-first |
| Interests | AI agents, developer tools, automation, local-first infra |
| Pain points | Agent orchestration sprawl, tool fatigue, SaaS lock-in |
| Content preferences | Technical threads, CLI walkthroughs, architecture posts, build-in-public behind the scenes |

### Secondary

| Attribute | Value |
|---|---|
| Age range | 18–25 |
| Platforms | X/Twitter, Bluesky, GitHub |
| Interests | Open source, indie hacking, learning agent development |

---

## KPI Targets

| KPI | Metric | Target | Timeline |
|---|---|---|---|
| Developer awareness | GitHub stars | +500 | By 2026-05-30 |
| Community growth | X followers | +400 | Rolling through Q2 |
| Thought leadership | LinkedIn impressions | 25,000 / month | May 2026 |
| Open-source adoption | CLI downloads (npm) | +2,000 / month | May 2026 |

---

## Content Theme Pillars

| Pillar | Description | % of calendar | Primary platforms |
|---|---|---|---|
| Product Builds | Behind-the-scenes of shipping kits and CLI features | 35% | X, LinkedIn, YouTube |
| Developer Tutorials | How to use kits, commands, workflows end-to-end | 30% | X, Bluesky, YouTube |
| Open Source | OSS culture, contributions, partner projects | 20% | X, Bluesky |
| Community | User projects, shoutouts, Q&A, polls | 15% | X, LinkedIn |

---

## Brand Voice Summary

| Attribute | Spec |
|---|---|
| Tone | Direct, technically credible, approachable. Explains without condescension. Ships without bragging. |
| Words to use | "build", "ship", "run", "local", "open", "agent", "workflow", "kit", "workspace" |
| Words to avoid | "disruptive", "AI-powered", "revolutionary", "hack" |
| Emoji rule | 0–1 on LinkedIn, 0–2 on X, none on Bluesky |
| CTA style | Action verbs with immediate value: "Try it now", "Clone and run", "Read the docs", "Star on GitHub" |

---

## Execution Notes

- Caption variants: 3 per post (A direct, B narrative, C question)
- Every `POST /api/v1/posts` call uses `Idempotency-Key = clientPostId` (shape `growthub-YYYYMMDD-NNN`)
- `dryRun` is `false` — api-live mode, profile `prof_GRO_primary`
- Manifest submission order: media uploads → posts → recurring `weekly-build-log` queue creation
- YouTube long-form videos scheduled via Zernio with premieres disabled; Shorts scheduled via queue
