# Broadcast Vault — Growthub

> Growthub's live asset library for broadcast email campaigns.
> This vault is the content source. Broadcast formats in `templates/broadcast-formats/` are the containers.
>
> Agent workflow:
>   1. Load this vault (read the full file into context)
>   2. Identify campaign goal → match to a broadcast format in `templates/broadcast-formats/INDEX.md`
>   3. Select the specific vault asset(s) to feature in that broadcast
>   4. Fill the format template with vault content
>   5. Generate subject line matrix
>   6. Platform handoff via runtime-assumptions.md

---

## VAULT IDENTITY

```yaml
client:          "growthub"
local_version:   "1.0.0"
last_updated:    "2026-04-10"
vault_owner:     "Antonio"
```

---

## LEAD MAGNETS

> Free resources Growthub offers. Use in `value-delivery` and `lead-magnet-traffic` broadcast formats.
> Every lead magnet email should feel like a genuine gift — value first, no pitch required.

```yaml
lead_magnets:

  - id:          "lm-01"
    title:       "Winning Ads Playbook — Static Ads 2026"
    description: "Playbook breaking down what's working in static ad creative right now. Frameworks, formats, and examples for brands running paid media."
    url:         "https://www.growthub.ai/f/blog/static-ads-2026"
    type:        "playbook"
    pillar:      "Automation & AI / Education & Strategy"
    audience:    "Performance teams and brand marketers running Meta/TikTok ads"
    best_format: "value-delivery / lead-magnet-traffic"
    cta_text:    "Get the Winning Ads Playbook →"
    status:      "active"

  - id:          "lm-02"
    title:       "Winning Prompts Playbook"
    description: "Curated AI prompt systems for creative and marketing teams. Practical prompts for ideation, briefs, copy, and creative strategy."
    url:         "https://www.growthub.ai/f/playbook"
    type:        "playbook"
    pillar:      "Automation & AI / Education & Strategy"
    audience:    "Marketers and creative leads using AI tools in their workflow"
    best_format: "value-delivery / lead-magnet-traffic"
    cta_text:    "Get the Winning Prompts Playbook →"
    status:      "active"

  - id:          "lm-03"
    title:       "Nano Banana Starter Kit"
    description: "Starter kit for getting up and running with AI-assisted creative workflows. Practical toolkit for marketers new to AI production."
    url:         "https://v0-nano-banana-starter-kit.vercel.app/"
    type:        "tool / starter kit"
    pillar:      "Automation & AI"
    audience:    "Marketers just getting started with AI creative tools"
    best_format: "value-delivery / engagement-nudge"
    cta_text:    "Grab the Starter Kit →"
    status:      "active"

  - id:          "lm-04"
    title:       "4K+ Private SKOOL Community — AI Marketing & Growth"
    description: "Private community of 4,000+ marketers, founders, and operators learning AI marketing and growth. Free to join."
    url:         "https://www.skool.com/growthub/about"
    type:        "community"
    pillar:      "Growth System / Automation & AI"
    audience:    "Any marketer who wants peer learning, templates, and AI marketing resources"
    best_format: "engagement-nudge / activation-booking"
    cta_text:    "Join the free community →"
    status:      "active"

  - id:          "lm-05"
    title:       "Free Competitor Ads Report"
    description: "Free report showing what your competitors are running on Meta — top ads, hooks, formats, and creative angles in your niche."
    url:         "https://www.growthub.ai/f/winning-ads-signup"
    type:        "report / audit"
    pillar:      "Education & Strategy / Pipeline & Revenue"
    audience:    "Brand owners and performance marketers who want competitive intelligence"
    best_format: "lead-magnet-traffic / value-delivery"
    cta_text:    "Get my free competitor ads report →"
    status:      "active"

  - id:          "lm-06"
    title:       "SEO / LLM / GEO Mastersheet"
    description: "Comprehensive mastersheet covering SEO, AI search engine optimization (AEO), and GEO (generative engine optimization). Frameworks and tactics for visibility in AI-era search."
    url:         "https://www.notion.so/growthub/SEO-AEO-LLM-GEO-Mastersheet-2e4d28ab978380dbbff0e56e7ee28082"
    type:        "mastersheet / notion doc"
    pillar:      "Education & Strategy"
    audience:    "Marketers and founders who need to understand AI-era SEO and LLM visibility"
    best_format: "value-delivery / engagement-nudge"
    cta_text:    "Access the SEO / LLM / GEO Mastersheet →"
    status:      "active"

  - id:          "lm-07"
    title:       "Free SEO / AEO / LLM Audit Report"
    description: "Free automated audit showing how your brand performs in AI search engines and LLM-powered results. Identifies visibility gaps."
    url:         "https://www.growthub.ai/onboarding-agent"
    type:        "audit / tool"
    pillar:      "Education & Strategy / Growth System"
    audience:    "Brand owners and marketers who want to know how they appear in AI search"
    best_format: "lead-magnet-traffic / value-delivery"
    cta_text:    "Get my free LLM audit →"
    status:      "active"

  - id:          "lm-08"
    title:       "DTC Mega File"
    description: "Massive curated resource file for DTC brands — templates, frameworks, swipe files, and references covering creative, performance, and growth."
    url:         "https://growthub.notion.site/dtc-mega-file?source=copy_link"
    type:        "resource file / notion doc"
    pillar:      "Education & Strategy / Growth System"
    audience:    "DTC founders, operators, and performance teams"
    best_format: "value-delivery / engagement-nudge"
    cta_text:    "Access the DTC Mega File →"
    status:      "active"

  - id:          "lm-09"
    title:       "AI Batch Image Generation Mastery Guide"
    description: "Step-by-step guide to generating high-quality product and lifestyle images at scale using AI. Covers prompting, workflows, and quality control."
    url:         "https://www.notion.so/growthub/AI-Batch-Image-Generation-Mastery-Guide-303d28ab978380cc89ccef0fccff4d52"
    type:        "guide / notion doc"
    pillar:      "Automation & AI"
    audience:    "Creative teams, marketers, and founders using AI for visual content"
    best_format: "value-delivery / lead-magnet-traffic"
    cta_text:    "Get the AI Batch Image Guide →"
    status:      "active"

  - id:          "lm-10"
    title:       "500+ Proven Winning Hooks"
    description: "Database of 500+ proven ad hooks with structure templates. Searchable by niche, format, and hook type. The same library used internally for creative briefs."
    url:         "https://www.notion.so/growthub/2d7d28ab9783802aa48dcda105f8c63f?v=8e6120c3ec8e401daa8eaefad2de89d6"
    type:        "database / notion doc"
    pillar:      "Education & Strategy / Automation & AI"
    audience:    "Creative strategists, performance marketers, and copywriters"
    best_format: "value-delivery / engagement-nudge"
    cta_text:    "Access 500+ Winning Hooks →"
    status:      "active"
```

---

## PROOF ASSETS

> Showcases, case studies, and testimonials. Use in `showcase-proof` and `activation-booking` formats.
> Only use approved proof — never fabricate results.

### SHOWCASES

```yaml
showcases:

  - id:          "sh-01"
    title:       "AI UGC Creative Examples — Showcase Formats & Best Work"
    description: "Gallery of Growthub's best AI UGC creative work for major brands. Shows formats, quality standards, and creative range across industries."
    url:         "https://app.air.inc/a/b94a95947"
    type:        "air-gallery"
    best_for:    "showcase-proof / activation-booking"
    cta_text:    "See the creative showcase →"
    status:      "active"

  - id:          "sh-02"
    title:       "Spend → Results → CPA / ROAS Performance Gallery"
    description: "Performance data gallery showing real ad account results — spend levels, CPA improvements, and ROAS outcomes across Growthub client campaigns."
    url:         "https://app.air.inc/a/ba34c4c47"
    type:        "air-gallery"
    best_for:    "showcase-proof / activation-booking"
    cta_text:    "See real performance results →"
    status:      "active"
```

### TESTIMONIALS & SOCIAL PROOF

```yaml
testimonials:

  - id:          "t-01"
    title:       "Customer Video Testimonial — Creative Strategy Proof"
    description: "Video testimonial from a Growthub client speaking to the impact of the creative strategy and results delivered."
    url:         "https://youtu.be/100kabrAXCg"
    format:      "video"
    best_for:    "showcase-proof / activation-booking"
    cta_text:    "Watch the testimonial →"
    status:      "active"
```

### CASE STUDIES

```yaml
case_studies:

  - id:          "cs-01"
    title:       "Meta Ads Growth Case Study #1"
    url:         "https://gamma.app/docs/vmgac08gnak7163"
    type:        "gamma"
    best_for:    "showcase-proof / activation-booking"
    status:      "active"

  - id:          "cs-02"
    title:       "Meta Ads Growth Case Study #2"
    url:         "https://gamma.app/docs/8ylbw6vp3e5zqqh"
    type:        "gamma"
    best_for:    "showcase-proof / activation-booking"
    status:      "active"

  - id:          "cs-03"
    title:       "Case Studies — Growthub Website"
    description: "Full case study library on the Growthub website. Multiple brands, industries, and outcomes."
    url:         "https://thegrowthub.com/pages/case-studies"
    type:        "webpage"
    best_for:    "showcase-proof / activation-booking"
    cta_text:    "See all case studies →"
    status:      "active"

  - id:          "cs-04"
    title:       "Meta Ads + Landing Page — Exceptional Growth Case Study"
    url:         "https://gamma.app/docs/Case-Study-Driving-Exceptional-Growth-with-Meta-Ads-and-Landing-P-n6nuaky968ejw7u"
    type:        "gamma"
    industry:    "Performance / E-commerce"
    best_for:    "showcase-proof"
    status:      "active"

  - id:          "cs-05"
    title:       "Vitamin Brand — Performance Scaling Overview"
    url:         "https://gamma.app/docs/Vitamin-Brand-Performance-Scaling-Overview-y9rqrgqp032mefx"
    type:        "gamma"
    industry:    "Supplements / Health"
    best_for:    "showcase-proof"
    status:      "active"

  - id:          "cs-06"
    title:       "Supplement Brand — Scaling with Creative Discipline"
    url:         "https://gamma.app/docs/Supplement-Brand-Case-Study-Scaling-with-Creative-Discipline-kjb4lnze66qoj6m"
    type:        "gamma"
    industry:    "Supplements"
    best_for:    "showcase-proof"
    status:      "active"

  - id:          "cs-07"
    title:       "Meta Ads Success Story"
    url:         "https://gamma.app/docs/GH-Case-Study-Meta-Ads-Success-Story-i0vpnkpwlppew4p"
    type:        "gamma"
    industry:    "Performance"
    best_for:    "showcase-proof / activation-booking"
    status:      "active"
```

---

## CONTENT ASSETS

> YouTube videos and educational content. Use in `engagement-nudge` and `lead-magnet-traffic` formats.

```yaml
youtube_videos:

  - id:          "yt-01"
    title:       "Antonio YouTube — Video 1"
    url:         "https://youtu.be/yACECplpWGU?si=cFtQCyG_k_98KTtl"
    pillar:      "Education & Strategy / Automation & AI"
    best_for:    "engagement-nudge / value-delivery"
    cta_text:    "Watch on YouTube →"
    status:      "active"

  - id:          "yt-02"
    title:       "Antonio YouTube — Video 2"
    url:         "https://youtu.be/IaqettczkPk?si=SWXFPmamkxRgYkJP"
    pillar:      "Education & Strategy / Automation & AI"
    best_for:    "engagement-nudge / value-delivery"
    cta_text:    "Watch on YouTube →"
    status:      "active"

  - id:          "yt-03"
    title:       "Antonio YouTube — Video 3"
    url:         "https://youtu.be/iuoz70zSfM8?si=3w1-epxmzG9ZJYy4"
    pillar:      "Education & Strategy / Growth System"
    best_for:    "engagement-nudge / value-delivery"
    cta_text:    "Watch on YouTube →"
    status:      "active"
```

---

## ASSET SELECTION GUIDE

> Quick reference: which vault asset works best for which broadcast goal.

| Campaign goal | Best asset types | Broadcast format |
|---|---|---|
| Deliver free value, build goodwill | Lead magnets (lm-01 through lm-10) | `value-delivery` |
| Drive traffic to a specific resource | Lead magnets with landing pages | `lead-magnet-traffic` |
| Build credibility, show results | Case studies (cs-01–07), showcases (sh-01, sh-02) | `showcase-proof` |
| Warm up cold/cool leads | YouTube videos (yt-01–03), community (lm-04), educational magnets | `engagement-nudge` |
| Nudge warm leads toward booking | Testimonial (t-01), case studies, showcases + CTA | `activation-booking` |

---

## BROADCAST CADENCE RULES

```yaml
cadence_rules:
  max_broadcasts_per_week:   2
  min_days_between_sends:    3
  preferred_send_days:       "Tuesday, Thursday"
  preferred_send_time:       "9–11am recipient local time"
  segment_cooling_period:    "Do not re-send same vault asset to same segment within 60 days"
  lead_magnet_rotation:      "Rotate across different magnets per segment — never send same LM twice in one month"
```

---

## VAULT VERSION LOG

```yaml
version_log:
  - version:  "1.0.0"
    date:     "2026-04-10"
    changes:  "Initial vault — 10 lead magnets, 2 showcases, 1 testimonial, 7 case studies, 3 YouTube videos"
```
