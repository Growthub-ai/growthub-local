# Output Standards — Postiz Social Scheduler v1

This document defines the output contract for every artifact produced by this kit.

---

## OUTPUT FOLDER STRUCTURE

```text
output/
└── <client-slug>/
    └── <campaign-slug>/
        ├── <ClientSlug>_CampaignBrief_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_ContentCalendar_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_PostDrafts_Instagram_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_PostDrafts_LinkedIn_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_PostDrafts_TikTok_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_PostDrafts_Twitter_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_CaptionMatrix_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_HashtagMatrix_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_QAChecklist_v<N>_<YYYYMMDD>.md
        └── <ClientSlug>_PlatformReadyExecutionHandoff_v<N>_<YYYYMMDD>.md
```

---

## REQUIRED OUTPUT TYPES

Every full package must include:
- campaign brief
- content calendar
- post drafts (one file per platform)
- caption matrix
- hashtag matrix
- QA checklist
- platform-ready execution handoff

---

## REQUIRED SECTIONS

### Campaign brief
1. Campaign objective and KPIs
2. Target audience and platform alignment
3. Brand voice and content rules
4. Content pillar allocation
5. Posting cadence and timeline
6. Media asset requirements
7. Output package summary

### Content calendar
1. Calendar grid (date, platform, pillar, format, topic, status)
2. Weekly theme arc
3. Platform distribution balance
4. Scheduling window per post
5. Dependencies and approval gates

### Post drafts (per platform)
1. Post metadata (date, platform, pillar, format)
2. Hook line
3. Body copy
4. CTA
5. Hashtag block
6. Media brief (image/video description or asset reference)
7. Postiz scheduling notes (workspace, queue priority)

### Caption matrix
1. Caption set metadata
2. One row per post
3. Hook variant
4. Body variant
5. CTA variant
6. Platform adaptation notes
7. A/B test variants where applicable

### Hashtag matrix
1. Hashtag strategy overview
2. Per-platform hashtag sets
3. Niche / medium / broad distribution
4. Branded and campaign hashtags
5. Rotation schedule

### QA checklist
1. Brand voice review
2. Platform compliance review
3. Hashtag audit
4. Scheduling conflict check
5. Media asset verification
6. Link and CTA validation
7. Handoff sign-off

### Platform-ready execution handoff
1. Runtime mode (local-fork / browser-hosted / api-direct)
2. Repo inspection summary
3. Postiz workspace and organization setup
4. Exact scheduling steps
5. API payload examples (if api-direct mode)
6. Expected outputs and analytics tracking
7. Open questions

---

## FILE NAMING RULES

Pattern:

```text
<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md
```

Rules:
- `ClientSlug` is PascalCase
- never overwrite an existing version
- keep one artifact per file (post drafts grouped by platform)
- Markdown only

---

## QUALITY BAR

An output is complete when:
- no placeholder text remains
- the platform mix is explicit and justified
- content pillars are mapped to every calendar slot
- captions are paste-ready for Postiz post editor
- hashtag sets are appropriately sized per platform
- scheduling windows are timezone-aware
- execution handoff names the runtime mode
- QA checklist is filled, not empty
