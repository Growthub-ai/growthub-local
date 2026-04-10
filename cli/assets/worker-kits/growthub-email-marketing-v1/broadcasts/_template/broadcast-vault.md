# Broadcast Vault Template

> Copy this file to `broadcasts/<client-slug>/broadcast-vault.md` and populate all sections.
> The broadcast vault is the CONTENT LIBRARY for broadcast campaigns.
> Broadcast formats (in `templates/broadcast-formats/`) are the EMAIL CONTAINERS that reference vault items.
>
> Agent workflow:
>   1. Load this vault
>   2. Identify the campaign goal (deliver value / drive traffic / show proof / warm up / activate)
>   3. Match to a broadcast format in `templates/broadcast-formats/INDEX.md`
>   4. Select the specific vault asset(s) to feature
>   5. Fill the format template with vault content
>   6. Generate subject line matrix
>   7. Platform handoff

---

## VAULT IDENTITY

```yaml
client:          "[client slug]"
local_version:   "1.0.0"
last_updated:    "YYYY-MM-DD"
vault_owner:     "[name or team]"
```

---

## LEAD MAGNETS

> Free resources that deliver value and drive opt-ins or engagement.
> Each item has: title, description, URL, content type, pillar fit, and best broadcast format.

```yaml
lead_magnets:

  - id:          "lm-01"
    title:       "[Lead magnet title]"
    description: "[1–2 sentence description of what it contains and who it's for]"
    url:         "[URL]"
    type:        "[guide / playbook / tool / checklist / video / community / template / audit]"
    pillar:      "[pillar name(s) this asset fits]"
    audience:    "[who this is most relevant for]"
    best_format: "[broadcast format ID from INDEX.md — e.g. value-delivery / lead-magnet-traffic]"
    cta_text:    "[exact CTA text to use when sharing this asset]"
    status:      "[active / draft / archived]"

  - id:          "lm-02"
    title:       "[Lead magnet title]"
    description: "[description]"
    url:         "[URL]"
    type:        "[type]"
    pillar:      "[pillar]"
    audience:    "[audience]"
    best_format: "[format]"
    cta_text:    "[CTA text]"
    status:      "active"

  # Add more entries as needed
```

---

## PROOF ASSETS

> Case studies, testimonials, results showcases, and before/after demonstrations.
> Used in showcase-proof and activation-booking broadcast formats.

```yaml
proof_assets:

  case_studies:
    - id:          "cs-01"
      title:       "[Case study title]"
      description: "[What this case study shows — outcome, industry, persona]"
      url:         "[URL]"
      type:        "[gamma / webpage / pdf / video]"
      persona_match: "[Which persona this is most relevant for]"
      key_result:  "[The headline result — specific, approved]"
      status:      "[active / draft]"

  testimonials:
    - id:          "t-01"
      person:      "[Name or description]"
      company:     "[Company or role]"
      format:      "[video / written]"
      url:         "[URL]"
      key_quote:   "[Best 1-2 sentence quote or summary]"
      persona_match: "[Who this testimonial resonates with most]"
      status:      "active"

  showcases:
    - id:          "sh-01"
      title:       "[Showcase title]"
      description: "[What this shows]"
      url:         "[URL]"
      type:        "[air-gallery / video / image-set]"
      use_in:      "[Which broadcast format to use this in]"
      status:      "active"
```

---

## CONTENT ASSETS

> YouTube videos, blog posts, educational content, community links.
> Used in engagement-nudge and education-focused broadcasts.

```yaml
content_assets:

  youtube_videos:
    - id:          "yt-01"
      title:       "[Video title]"
      url:         "[YouTube URL]"
      topic:       "[What this video covers]"
      pillar:      "[pillar fit]"
      runtime:     "[e.g. 12 min]"
      best_for:    "[nurture / activation / education / proof]"
      status:      "active"

  blog_posts:
    - id:          "bp-01"
      title:       "[Post title]"
      url:         "[URL]"
      topic:       "[What this covers]"
      pillar:      "[pillar]"
      status:      "active"

  community:
    - id:          "comm-01"
      platform:    "[SKOOL / Discord / Slack / Circle]"
      title:       "[Community name]"
      url:         "[URL]"
      description: "[What members get]"
      cta_text:    "[CTA text]"
      status:      "active"
```

---

## ACTIVE BROADCAST SCHEDULE

> Optional. Track upcoming and recent broadcasts to avoid overlap or over-sending.

```yaml
broadcast_schedule:

  upcoming:
    - date:      "YYYY-MM-DD"
      format:    "[broadcast format ID]"
      asset:     "[vault asset ID]"
      segment:   "[segment tag]"
      status:    "[planned / ready / approved]"

  recent:
    - date:      "YYYY-MM-DD"
      format:    "[broadcast format ID]"
      asset:     "[vault asset ID]"
      segment:   "[segment tag]"
      output:    "[path to output file]"
```

---

## BROADCAST CADENCE RULES

```yaml
cadence_rules:
  max_broadcasts_per_week:   "[e.g. 2]"
  min_days_between_sends:    "[e.g. 3]"
  preferred_send_days:       "[e.g. Tuesday, Thursday]"
  preferred_send_time:       "[e.g. 9–11am recipient local time]"
  segment_cooling_period:    "[e.g. do not re-send same asset to same segment within 60 days]"
```

---

## VAULT VERSIONING

> Update this section whenever vault content is added or changed.

```yaml
version_log:
  - version:   "1.0.0"
    date:       "YYYY-MM-DD"
    changes:    "Initial vault created"
```
