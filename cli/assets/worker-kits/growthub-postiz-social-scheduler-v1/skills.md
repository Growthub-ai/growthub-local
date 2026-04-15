# Postiz Social Scheduler Operator — Master Skill Doc

**Source of truth for methodology. Read this file completely before beginning any task.**

---

## QUICK REFERENCE TABLE

| Resource | Path |
|---|---|
| Agent operating law | `workers/postiz-social-scheduler-operator/CLAUDE.md` |
| Brand kit template | `brands/_template/brand-kit.md` |
| Growthub example brand kit | `brands/growthub/brand-kit.md` |
| Output contract | `output-standards.md` |
| Runtime assumptions | `runtime-assumptions.md` |
| Fork integration notes | `docs/postiz-fork-integration.md` |
| Provider adapter layer | `docs/provider-adapter-layer.md` |
| Campaign brief | `templates/campaign-brief.md` |
| Content calendar planner | `templates/content-calendar-planner.md` |
| Post draft | `templates/post-draft.md` |
| Caption matrix | `templates/caption-matrix.md` |
| Hashtag matrix | `templates/hashtag-matrix.md` |
| QA checklist | `templates/qa-checklist.md` |
| Execution handoff | `templates/platform-ready-execution-handoff.md` |
| Format library index | `templates/social-formats/INDEX.md` |
| Instagram feed format | `templates/social-formats/instagram-feed.md` |
| Instagram carousel format | `templates/social-formats/instagram-carousel.md` |
| Instagram reels format | `templates/social-formats/instagram-reels.md` |
| TikTok video format | `templates/social-formats/tiktok-video.md` |
| LinkedIn post format | `templates/social-formats/linkedin-post.md` |
| Twitter/X post format | `templates/social-formats/twitter-post.md` |
| Facebook post format | `templates/social-formats/facebook-post.md` |
| YouTube short format | `templates/social-formats/youtube-short.md` |
| Content modules index | `templates/content-modules/INDEX.md` |
| Viral hooks patterns | `templates/hooks-library/viral-hooks-patterns.csv` |
| Sample brief | `examples/campaign-brief-sample.md` |
| Sample calendar | `examples/content-calendar-sample.md` |
| Sample post draft | `examples/post-draft-sample.md` |
| Sample handoff | `examples/platform-handoff-sample.md` |

---

## STEP 0 — BEFORE ANY TASK, ANSWER THESE QUESTIONS

Before producing anything, confirm:

1. Which brand or client is this for?
2. What is the campaign objective?
3. Which platforms are primary targets?
4. What content pillars should drive the calendar?
5. What is the posting cadence (daily, 3x/week, weekly)?
6. Is the Postiz fork available for inspection?

If any of these are unknown after the 3-question gate, stop and ask.

---

## STEP 1 — LOAD THE BRAND KIT

Read `brands/<client-slug>/brand-kit.md` if it exists. Otherwise start from `brands/_template/brand-kit.md`.

Extract:
- audience and offer
- brand voice and tone
- content pillars
- approved phrasing
- no-go claims
- visual identity notes
- platform-specific personas
- hashtag preferences
- CTA language

This kit inherits the strongest brand-kit primitives from the existing Growthub creative and email kits: identity, audience, positioning, messaging guardrails, approved phrases, CTA language, and deliverables logging.

---

## STEP 2 — CHECK THE WORKING SUBSTRATE

If the user has a local Postiz fork, inspect it before planning.

### Source-of-truth file order

1. `README.md`
2. `docker-compose.yml`
3. `apps/frontend/` (Next.js frontend)
4. `apps/backend/` (NestJS backend)
5. `libraries/nestjs-libraries/src/integrations/` (platform integrations)
6. `libraries/nestjs-libraries/src/bull-mq-transport/` (job queue)
7. `prisma/schema.prisma` (data model)

### What to verify

- Which social platforms are enabled via integrations
- How posts are scheduled through BullMQ
- What API endpoints exist for post creation
- Whether AI content generation is configured
- Which media formats are accepted per platform
- How workspaces and organizations are structured
- Whether analytics endpoints are available

If the fork cannot be inspected, use the frozen upstream assumptions in this kit and label the output `assumption-based`.

---

## STEP 3 — PLATFORM SELECTION LOGIC

Choose the platform mix that matches the real campaign objective.

| Platform | Best for | Avoid when |
|---|---|---|
| Instagram | visual brands, lifestyle, product showcase, reels engagement | B2B-only audience, text-heavy content |
| LinkedIn | B2B, thought leadership, professional networking, hiring | consumer lifestyle, entertainment-first |
| TikTok | Gen Z/millennial reach, viral potential, short-form video | corporate B2B, long-form educational |
| X/Twitter | real-time engagement, thought leadership, community building | visual-first brands, long-form storytelling |
| YouTube | long-form education, tutorials, product demos, shorts | text-only campaigns, rapid iteration |
| Facebook | community groups, local business, broad demographic reach | Gen Z primary audience, niche professional |
| Reddit | community engagement, authenticity, niche targeting | polished brand content, hard selling |
| Pinterest | visual discovery, evergreen content, product inspiration | real-time engagement, conversation-driven |

Default to 2-3 primary platforms. Secondary platforms appear only as repurpose targets.

---

## STEP 4 — CONTENT PILLAR MAPPING

Every post must map to a content pillar. No orphan posts.

### Standard pillar framework

| Pillar | Purpose | Typical share |
|---|---|---|
| Educational | Teach something valuable | 25-35% |
| Social proof | Testimonials, case studies, results | 15-20% |
| Behind-the-scenes | Process, culture, authenticity | 10-15% |
| Product/service | Direct showcase, features, launches | 15-25% |
| Entertainment | Trending, humor, relatable content | 10-15% |
| Community | Questions, polls, UGC, engagement bait | 10-15% |

Adjust percentages per client. The brand kit overrides these defaults.

### Pillar-to-format mapping

- Educational: carousels, threads, long captions, how-to reels
- Social proof: quote graphics, video testimonials, case study carousels
- Behind-the-scenes: stories, reels, candid photos, day-in-the-life
- Product: product shots, demo videos, feature highlights, launch posts
- Entertainment: memes, trending audio reels, relatable scenarios
- Community: polls, question posts, UGC reposts, AMAs

---

## STEP 5 — CAPTION PLANNING LOGIC

Caption work is not free-form writing. It is production planning.

Every caption must specify:
- hook (first line — the scroll-stopper)
- body (value delivery, story, or proof)
- CTA (engagement, traffic, or conversion)
- hashtag block (see hashtag matrix)
- platform-specific adaptations

### Hook types (use `templates/content-modules/hooks/`)

| Type | When to use | Example pattern |
|---|---|---|
| Curiosity | Educational, product reveals | "Most people don't know this about..." |
| Story | Behind-the-scenes, social proof | "Last month, we almost..." |
| Stat | Educational, social proof | "87% of marketers say..." |
| Question | Community, engagement | "What's the one tool you can't live without?" |
| Bold claim | Thought leadership | "Email marketing is dead. Here's what replaced it." |

### Body copy types (use `templates/content-modules/body-copy/`)

| Type | When to use |
|---|---|
| Value body | Educational posts, how-tos, tips |
| Story body | Behind-the-scenes, case studies, testimonials |

### CTA types (use `templates/content-modules/cta/`)

| Type | When to use |
|---|---|
| Engagement CTA | Community posts, polls, discussion starters |
| Conversion CTA | Product posts, launch posts, lead generation |

---

## STEP 6 — HASHTAG STRATEGY

Hashtags are not an afterthought. They are part of the distribution plan.

For every hashtag set, document:
- niche hashtags (10k-100k posts)
- medium hashtags (100k-500k posts)
- broad hashtags (500k+ posts)
- branded hashtags (owned)
- campaign-specific hashtags (time-bound)

Rules:
- Instagram: 5-15 hashtags per post (mix of sizes)
- LinkedIn: 3-5 hashtags (professional, specific)
- TikTok: 3-5 hashtags (trending + niche)
- Twitter/X: 1-2 hashtags (less is more)
- Facebook: 1-3 hashtags (minimal)

Use `templates/hashtag-matrix.md` to document the full strategy.

---

## STEP 7 — SCHEDULING LOGIC

Postiz uses BullMQ/Redis for job queue scheduling. Planning must account for this.

For every scheduling plan, document:
- posting timezone
- optimal posting times per platform
- queue priority (time-sensitive vs. evergreen)
- retry behavior for failed posts
- workspace assignment (if multi-workspace)

### Postiz scheduling assumptions

- Posts are queued via the API or UI
- BullMQ processes the queue at the scheduled time
- Failed jobs are retried based on queue configuration
- Multi-workspace support means posts can target different organizations
- Analytics are collected after posting for engagement tracking

---

## STEP 8 — OUTPUT ORDER

Produce artifacts in this order:

1. Campaign brief
2. Content calendar
3. Post drafts (per platform, per calendar slot)
4. Caption matrix
5. Hashtag matrix
6. QA checklist
7. Platform-ready execution handoff

---

## STEP 9 — QUALITY BAR

Good output looks like this:

- grounded in inspected repo files or clearly labeled assumptions
- platform mix justified with audience alignment
- content pillars mapped to calendar slots with clear rationale
- captions ready to paste into Postiz post editor
- hashtag sets sized appropriately per platform
- scheduling plan aligned with timezone and optimal posting windows
- handoff notes clear enough for direct Postiz UI or API execution
- QA checklist specific enough to catch tone drift, platform mismatch, hashtag spam, and scheduling conflicts
