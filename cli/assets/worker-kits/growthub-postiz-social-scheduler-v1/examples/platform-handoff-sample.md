# Platform-Ready Execution Handoff — Growthub Q2 Product Launch

**Client:** growthub
**Date:** 2026-04-15
**Version:** v1

---

## Runtime Mode

```yaml
execution_mode: "local-fork"
postiz_url: "http://localhost:5000"
postiz_workspace: "growthub-main"
verification_status: "fork-verified"
```

## Repo Inspection Summary

```yaml
fork_available: true
platforms_enabled:
  - "Instagram"
  - "LinkedIn"
  - "Twitter/X"
  - "Facebook"
  - "TikTok"
  - "YouTube"
  - "Reddit"
  - "Mastodon"
  - "Bluesky"
bullmq_configured: true
ai_generation_available: true
media_upload_working: true
```

## Postiz Workspace Setup

```yaml
organization: "Growthub"
workspace: "growthub-main"
connected_accounts:
  - platform: "LinkedIn"
    account: "Growthub Company Page"
    status: "connected"
  - platform: "Instagram"
    account: "@growthub"
    status: "connected"
  - platform: "Twitter/X"
    account: "@growthub_ai"
    status: "connected"
```

## Scheduling Steps

### Local-fork mode

1. Open Postiz at `http://localhost:5000`
2. Select workspace "growthub-main"
3. Verify all 3 social accounts show "Connected" status
4. For each post in the content calendar (12 posts in week 1-2):
   a. Click "Create Post" in the Postiz dashboard
   b. Select the target platform from the calendar grid
   c. Paste the full caption from the corresponding post draft file
   d. Upload the media asset referenced in the media brief
   e. Set the scheduled date and time per the calendar
   f. Set queue priority (high for launch day, normal otherwise)
   g. Review the preview and confirm scheduling
5. After all posts are queued:
   - Navigate to the scheduling queue view
   - Verify all 12 posts show "Scheduled" status
   - Confirm no time conflicts exist
   - Verify media thumbnails loaded correctly

## Expected Outputs

| Post # | Platform | Scheduled time (EST) | Status |
|---|---|---|---|
| 1 | LinkedIn | 2026-04-15 09:00 | Queued |
| 2 | Instagram | 2026-04-15 11:00 | Queued |
| 3 | Twitter | 2026-04-15 12:00 | Queued |
| 4 | Instagram | 2026-04-16 11:30 | Queued |
| 5 | LinkedIn | 2026-04-16 09:00 | Queued |
| 6 | Instagram | 2026-04-17 19:00 | Queued |
| 7 | Twitter | 2026-04-17 12:00 | Queued |
| 8 | LinkedIn | 2026-04-18 09:00 | Queued |
| 9 | Instagram | 2026-04-18 11:00 | Queued |
| 10 | LinkedIn | 2026-04-21 09:00 | Queued |
| 11 | Instagram | 2026-04-21 11:00 | Queued |
| 12 | Twitter | 2026-04-22 12:00 | Queued |

## Analytics Tracking

```yaml
tracking_plan:
  - metric: "engagement rate per post"
    check_after: "24 hours"
  - metric: "follower growth (net)"
    check_after: "7 days"
  - metric: "website clicks from social"
    check_after: "7 days"
  - metric: "top performing post"
    check_after: "14 days"
postiz_analytics_url: "http://localhost:5000/analytics"
```

## Open Questions

- [ ] Confirm Instagram account has business profile enabled for analytics
- [ ] Verify LinkedIn page admin access for the campaign owner
- [ ] Test media upload for carousel posts (multi-image) before scheduling
