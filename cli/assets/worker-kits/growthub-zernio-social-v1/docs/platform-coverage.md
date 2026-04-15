# Platform Coverage

**Supported Zernio platform IDs, format specs, and character limits.**

**Frozen at kit creation: 2026-04-15. Confirm live with `GET /api/v1/platforms` when Zernio adds new integrations.**

---

## Platform Reference Table

| Platform | Zernio ID | Auth (Zernio-managed) | Post Types | Char Limit | Image Spec | Video Spec |
|---|---|---|---|---|---|---|
| X/Twitter | `twitter` | Twitter OAuth 2.0 | text, image, video, thread | 280 | 1200×675, ≤5MB | MP4/MOV, ≤2min 20s |
| Instagram | `instagram` | Meta OAuth | image, video, reel, story, carousel | 2,200 | 1080×1080 or 1080×1350 | 1080×1920 (reels), MP4, ≤90s |
| Facebook | `facebook` | Meta OAuth | text, image, video, reel, story, carousel | 63,206 | 1200×628, PNG/JPG | MP4, ≤240min |
| LinkedIn | `linkedin` | LinkedIn OAuth | text, image, video, document/carousel | 3,000 | 1200×627, PNG/JPG | MP4, ≤10 min |
| TikTok | `tiktok` | TikTok OAuth | video only | 2,200 | — | 1080×1920, MP4/MOV, 15s–10min |
| YouTube | `youtube` | Google OAuth | video (long-form), shorts | N/A (title + description) | Thumbnail: 1280×720 | MP4, any length; Shorts ≤60s, 1080×1920 |
| Pinterest | `pinterest` | Pinterest OAuth | image, video, idea pin | 500 | 1000×1500 (2:3) | MP4, 4s–15min |
| Reddit | `reddit` | Reddit OAuth | text, image, video, link | Subreddit-specific | Varies by subreddit | MP4, ≤15min |
| Bluesky | `bluesky` | AT Protocol | text, image, video | 300 | Up to 4 images, 1×1 to 3×4 | MP4, ≤60s |
| Threads | `threads` | Meta OAuth | text, image, video, thread | 500 | 1:1 square; 4:5 portrait | MP4, ≤5min |
| Google Business | `googlebusiness` | Google OAuth | update, offer, event | 1,500 | 720×720 minimum | MP4, ≤30s |
| Telegram | `telegram` | Bot API token | text, image, video, document | 4,096 | JPEG, ≤10MB | MP4, ≤50MB |
| Snapchat | `snapchat` | Snapchat Marketing API | image, video, story | 80 | 1080×1920 | MP4, ≤60s |
| WhatsApp | `whatsapp` | WhatsApp Business API | text, image, video, document | 1,024 | JPEG/PNG, ≤5MB | MP4, ≤16MB |

**Source for IDs:** Zernio platform id is the canonical slug used inside every `POST /api/v1/posts` body's `platforms[].platform` field and every `/api/v1/connect/<platform>` OAuth entrypoint.

---

## Platform Selection Guidance

### Audience Demographics (2026 data — refine per client brand kit)

| Platform | Primary Demographic | Dominant Use Case |
|---|---|---|
| X/Twitter | 18–49 (male-skewed) | News, opinion, live commentary |
| Instagram | 18–34 (55% female) | Visual branding, lifestyle, product showcase |
| Facebook | 35–65 | Community groups, local business, events |
| LinkedIn | 25–55 (professional) | B2B, thought leadership, hiring |
| TikTok | 18–34 | Short-form entertainment, product discovery |
| YouTube | All ages (18–49 core) | Education, reviews, entertainment |
| Pinterest | 25–44 (female-skewed 70%) | Discovery, DIY, home, fashion, recipes |
| Reddit | 18–49 (male-skewed) | Community discussion, niche interests |
| Bluesky | 25–45 (tech-skewed) | Tech commentary, open-source community |
| Threads | 18–34 | Text-first companion to Instagram audiences |
| Google Business | Local search audience | Local business discovery, reviews |
| Telegram | 18–44 (international) | Channels, bots, direct community |
| Snapchat | 13–34 | Short-form, ephemeral content |
| WhatsApp | 18+ (international, business) | Direct conversations, business messaging |

### Recommended posting cadence per platform

| Platform | Min / Max per week | Notes |
|---|---|---|
| X/Twitter | 5 / 30 | Highest-cadence platform. Multiple per day is acceptable. |
| Instagram | 3 / 10 | Feed posts 3–5/week; Stories daily acceptable. |
| Facebook | 3 / 10 | Mirror Instagram for B2C. |
| LinkedIn | 3 / 5 | Never post more than 1x/day for a brand. |
| TikTok | 3 / 21 | Daily posting drives algorithm signal. |
| YouTube | 1 / 3 | Long-form is weekly; Shorts can be daily. |
| Pinterest | 3 / 15 | Batch-pin from hero assets. |
| Reddit | 1 / 5 | Subreddit etiquette outranks brand cadence. |
| Bluesky | 3 / 14 | Text-forward; 1–2x/day is common. |
| Threads | 3 / 14 | Pair with Instagram rhythm. |
| Google Business | 1 / 3 | Updates + offers + events; don't over-post. |
| Telegram | 1 / 7 | Channels tolerate quality over quantity. |
| Snapchat | 3 / 14 | Short daily pulses work well. |
| WhatsApp | 0 / 2 broadcast | Direct conversation first; broadcast sparingly. |

### Carousel support

Carousel posts are supported on: `instagram`, `linkedin`, `pinterest`, `facebook`.
They are **not** supported on: `tiktok`, `twitter`, `bluesky`, `threads`, `youtube`, `googlebusiness`, `telegram`, `snapchat`, `whatsapp`, `reddit`.

### Thread support

Native thread posts are supported on: `twitter`, `bluesky`, `threads`. Everywhere else, use carousel or long-form caption.

### Messaging-only platforms

`telegram` and `whatsapp` require follower opt-in through the Zernio-connected account. Do not plan broadcast-style campaigns on these platforms without confirming consent flows with the client.

---

## Per-platform Tone Snapshot

| Platform | Tone | Opening-hook rule |
|---|---|---|
| `twitter` | Concise, punchy, declarative | First 80 chars decide re-share |
| `instagram` | Visual-first; caption secondary | First 150 chars above the "more" fold |
| `facebook` | Conversational, community-oriented | First sentence is the hook |
| `linkedin` | Professional, credibility-first | Lead with outcome or lesson, not greeting |
| `tiktok` | Casual, trend-aware | First 150 chars drive completion rate |
| `youtube` | Benefit + specificity in title; hook in first 8 seconds of video | Title carries the weight |
| `pinterest` | Descriptive, keyword-dense | Pin title is the hook |
| `reddit` | Subreddit-native — no marketing voice | First line must read like a genuine user post |
| `bluesky` | Honest, tech-fluent, link-sparse | Skip hashtags; context carries it |
| `threads` | Casual, text-forward | Treat as "tweets for Instagram audiences" |
| `googlebusiness` | Operational, benefit-first, local | Include location or offer specifics |
| `telegram` | Long-form friendly, channel voice | First two lines in notification preview |
| `snapchat` | Playful, immediate | Hook must work without audio |
| `whatsapp` | Direct, 1:1 voice | Treat as personal message, not broadcast |

---

## Cross-reference

For caption character limits and variant rules see `docs/ai-caption-layer.md`.
For scheduling + queue format see `docs/posts-and-queues-layer.md`.
For API auth, endpoints, rate limits, and error codes see `docs/zernio-api-integration.md`.
