# Platform Coverage

**Supported Postiz integration IDs, format specs, and character limits.**

**Frozen at kit creation: 2026-04-15. Update when Postiz adds new platform integrations.**

---

## Platform Reference Table

| Platform | Postiz ID | Auth Method | Post Types | Char Limit | Image Spec | Video Spec |
|---|---|---|---|---|---|---|
| Instagram | `instagram` | Meta OAuth | image, video, reel, story, carousel | 2,200 | 1080×1080 (square), 1080×1350 (portrait) | 1080×1920 (reels), MP4, ≤90s |
| LinkedIn | `linkedin` | LinkedIn OAuth | text, image, video, document/carousel | 3,000 | 1200×627, PNG/JPG | MP4, ≤10 min |
| TikTok | `tiktok` | TikTok OAuth | video only | 2,200 | — | 1080×1920, MP4/MOV, 15s–10min |
| X (Twitter) | `twitter` | Twitter OAuth 2.0 | text, image, video, thread | 280 | 1200×675, ≤5MB | MP4/MOV, ≤2min 20s |
| YouTube | `youtube` | Google OAuth | video (long-form), shorts | N/A | Thumbnail: 1280×720 | MP4, any length; Shorts ≤60s, 1080×1920 |
| Pinterest | `pinterest` | Pinterest OAuth | image, video, idea pin | 500 | 1000×1500 (2:3 ratio) | MP4, 4s–15min |
| Reddit | `reddit` | Reddit OAuth | text, image, video, link | — subreddit rules | Varies by subreddit | MP4, ≤15min |
| Facebook | `facebook` | Meta OAuth | text, image, video, reel, story, carousel | 63,206 | 1200×628, PNG/JPG | MP4, ≤240min |
| Bluesky | `bluesky` | AT Protocol credentials | text, image, video | 300 | Up to 4 images, 1×1 to 3×4 | MP4, ≤60s |
| Mastodon | `mastodon` | OAuth (instance-specific) | text, image, video, poll | 500 (instance-configurable) | PNG/JPG/GIF/WebP | MP4/WebM/MOV |
| Slack | `slack` | Slack OAuth | text, image, file | — | PNG/JPG/GIF | MP4 |
| Telegram | `telegram` | Telegram Bot API token | text, image, video, document | 4,096 | JPEG, ≤10MB | MP4, ≤50MB |
| Discord | `discord` | Discord Bot token | text, image, video, embed | 2,000 | PNG/JPG/GIF, ≤8MB | MP4, ≤8MB |
| Threads | `threads` | Meta OAuth | text, image, video | 500 | 1:1 square; 4:5 portrait | MP4, ≤5min |
| Dribbble | `dribbble` | Dribbble OAuth | image, video | — | PNG/JPG/GIF, ≤30MB | — |
| Tumblr | `tumblr` | Tumblr OAuth | text, image, video, audio | — | PNG/JPG/GIF | MP4 |
| Medium | `medium` | Medium OAuth | article (long-form markdown) | — | Embedded images | — |
| DEV.to | `devto` | DEV API key | article (markdown) | — | Embedded images | — |
| Hashnode | `hashnode` | Hashnode API key | article (markdown) | — | Embedded images | — |
| Lemmy | `lemmy` | Lemmy credentials | text, image, link | — | PNG/JPG | — |
| Nostr | `nostr` | Nostr keypair | text, image | — | URLs (no direct upload) | — |

---

## Platform Selection Guidance

### Audience Demographics (2026 data — update when brand kit specifies more precise data)

| Platform | Primary Demographic | Dominant Use Case |
|---|---|---|
| Instagram | 18–34 (55% female) | Visual branding, lifestyle, product showcase |
| LinkedIn | 25–55 (professional) | B2B, thought leadership, hiring |
| TikTok | 18–34 | Short-form entertainment, product discovery |
| X/Twitter | 18–49 (male-skewed) | News, opinion, live commentary |
| YouTube | All ages (18–49 core) | Education, reviews, entertainment |
| Pinterest | 25–44 (female-skewed 70%) | Discovery, DIY, home, fashion, recipes |
| Reddit | 18–49 (male-skewed) | Community discussion, niche interests |
| Facebook | 35–65 | Community groups, local business, events |
| Bluesky | 18–40 (tech-forward) | Open protocol social, tech and media |
| Mastodon | 25–45 (tech-forward) | Open source, decentralized, privacy-aware |
| LinkedIn | — | — |

---

## Post Type Compatibility Matrix

| Post Type | instagram | linkedin | tiktok | twitter | youtube | pinterest | reddit | facebook | bluesky |
|---|---|---|---|---|---|---|---|---|---|
| Static Image | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Video | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Carousel / Slides | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| Text Only | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Story | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Reel / Short | ✓ | ✗ | ✓ | ✗ | ✓ (Shorts) | ✗ | ✗ | ✓ | ✗ |
| Long-form Article | ✗ | ✓ (newsletter) | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |

---

## Hashtag Best Practices by Platform

| Platform | Recommended Count | Strategy |
|---|---|---|
| Instagram | 3–5 | Mix niche + medium-volume (avoid over-tagging) |
| LinkedIn | 3–5 | Professional and industry-specific |
| TikTok | 3–6 | Mix trending sounds + niche tags |
| X/Twitter | 1–2 | In-text placement, campaign hashtags |
| Pinterest | 2–3 | Keyword-based for discoverability |
| Bluesky | 0–2 | Contextual only, rarely used |
| Mastodon | 2–4 | CamelCase for accessibility |
| Reddit | 0 | Subreddit flair instead |

---

## Posting Time Recommendations

*Based on general industry data. Override with client's own analytics if available.*

| Platform | Weekday Best Times (ET) | Weekend |
|---|---|---|
| Instagram | Mon–Fri: 9–11am, 6–8pm | Sat: 10am–12pm |
| LinkedIn | Tue–Thu: 8–10am, 12pm | Minimal weekend activity |
| TikTok | Mon–Fri: 7–9am, 7–9pm | Sat–Sun: 11am–1pm |
| X/Twitter | Mon–Fri: 8–10am, 12–2pm | Limited |
| Facebook | Tue–Thu: 9am–12pm | Sat: 12–1pm |
| Pinterest | Sat–Sun: 2–4pm, 8–11pm | All day |
