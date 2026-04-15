# Output Standards

**All Zernio Social Media Operator outputs must meet these standards before being delivered to a client.**

---

## Output Directory Structure

```
output/
  <client-slug>/
    <project-slug>/
      SocialCampaignBrief_v<N>_<YYYYMMDD>.md
      ContentCalendar_v<N>_<YYYYMMDD>.md
      PlatformPublishingPlan_v<N>_<YYYYMMDD>.md
      CaptionCopyDeck_v<N>_<YYYYMMDD>.md
      SchedulingManifest_v<N>_<YYYYMMDD>.md    (if scheduling requested)
      AnalyticsBrief_v<N>_<YYYYMMDD>.md        (if analytics data available)
      ClientProposal_v<N>_<YYYYMMDD>.md        (if requested)
      scheduling-manifest.json                  (always when scheduling — powers Zernio POST /api/v1/posts)
```

---

## File Naming Convention

```
<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md
```

| Part | Rules | Example |
|---|---|---|
| ClientSlug | TitleCase, no spaces, no special chars | `UrbanCycle` |
| OutputType | CamelCase from the list below | `ContentCalendar` |
| Version | `v` + integer, starting at 1 | `v1` |
| Date | `YYYYMMDD` format | `20260415` |

**Output type names:**

| Artifact | OutputType string |
|---|---|
| Social Campaign Brief | `SocialCampaignBrief` |
| Content Calendar | `ContentCalendar` |
| Platform Publishing Plan | `PlatformPublishingPlan` |
| Caption Copy Deck | `CaptionCopyDeck` |
| Scheduling Manifest | `SchedulingManifest` |
| Analytics Brief | `AnalyticsBrief` |
| Client Proposal | `ClientProposal` |

---

## Required Sections Per Artifact

Each artifact must include all sections from its template. Incomplete sections must be marked `<!-- data-gap: reason -->` — never left blank without explanation.

| Artifact | Minimum Required Sections |
|---|---|
| SocialCampaignBrief | Project Overview, Campaign Objective, Target Platforms, Audience Profile, KPI Targets, Content Theme Pillars, Brand Voice |
| ContentCalendar | Calendar Header (client, period, platforms, profile id), Calendar Table (all rows with all columns), Posting Cadence Summary |
| PlatformPublishingPlan | Per-platform rows (all selected platforms), Format spec, Frequency, Best posting times, Content mix ratio |
| CaptionCopyDeck | Per-post entries (A/B/C variants each), Hashtag sets, Character counts, Media asset notes |
| SchedulingManifest | Manifest header (profileId, timezone, dryRun), All post entries (clientPostId, content, scheduledFor, platforms[], media[], status) |
| AnalyticsBrief | Period summary, Per-platform metrics table, Top 3 posts, Bottom 3 posts, Recommendations |
| ClientProposal | Campaign Overview, Platform Mix rationale, Content Strategy, Deliverables scope, Pricing (3 tiers), ROI Projection |

---

## Quality Bar

### Platform-Accurate

- All platform IDs must match the official list in `docs/platform-coverage.md`
- Character limits must be respected for every caption variant
- Post types must be valid for the target platform (e.g., no carousels on TikTok or X)

### Caption Quality

- Every caption must have an explicit CTA — "Learn more" is acceptable; blank is not
- All 3 variants (A/B/C) must be meaningfully different — not minor word swaps
- Hashtags must be relevant to the content — no generic filler unless platform context demands it

### Scheduling Manifest

- `scheduledFor` timestamps must be ISO 8601 format with timezone offset
- `clientPostId` must follow the naming convention: `<client-slug>-<YYYYMMDD>-<sequence>`
- All posts in the manifest must have a corresponding entry in the ContentCalendar
- `profileId` must be present (non-empty) — never hardcode to a placeholder string without also setting `dryRun: true`
- Every `platforms[].platform` value must exist in `docs/platform-coverage.md`
- Every `platforms[].accountId` must either be a real Zernio account id (live mode) or a documented placeholder tagged with the handle (agent-only mode)

### No Filler

- Every sentence must either present data, explain a constraint, or specify an action
- Remove phrases like "Great content is key" — replace with the actual content specification
- Recommendations must be specific: name the exact platform, posting time, content format, and expected impact

### Actionable

- Every post entry in the ContentCalendar must have a ready-to-use caption variant
- Every platform in the PlatformPublishingPlan must have a posting time recommendation
- Every finding in the AnalyticsBrief must have a corresponding action item

### Consistent

- Platform names in all artifacts must use the same slug format from `docs/platform-coverage.md`
- Dates must be consistent across all artifacts
- Client name must match the brand kit exactly

---

## Versioning Rules

| Scenario | Action |
|---|---|
| First campaign for a client | All files at v1 |
| Campaign revised post-approval | Increment all files to v2 |
| Partial update (one artifact revised) | Increment only the revised artifact's version |
| New campaign, same client | Start new project-slug, all files at v1 |

---

## scheduling-manifest.json

This file must always be written to the output directory when scheduling is requested. It is the machine-readable record required for:

- Zernio API scheduled post creation (one `POST /api/v1/posts` per entry or a batched sequence)
- Manual review before submitting to Zernio
- Campaign audit trail

See `templates/scheduling-manifest.md` and `docs/posts-and-queues-layer.md` for the complete format with all required fields.

Every write request to Zernio must include an `Idempotency-Key` header — the operator must instruct the downstream executor to use the `clientPostId` as that key so re-submissions are safe.
