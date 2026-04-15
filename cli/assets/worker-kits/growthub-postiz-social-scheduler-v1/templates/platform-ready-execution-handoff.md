# Platform-Ready Execution Handoff — [CAMPAIGN NAME]

**Client:** [client-slug]
**Date:** YYYY-MM-DD
**Version:** v1

---

## Runtime Mode

```yaml
execution_mode: "[local-fork / browser-hosted / api-direct]"
postiz_url: "[instance URL]"
postiz_workspace: "[workspace name]"
verification_status: "[fork-verified / assumption-based]"
```

## Repo Inspection Summary

```yaml
fork_available: "[yes / no]"
platforms_enabled:
  - "[Instagram]"
  - "[LinkedIn]"
  - "[TikTok]"
bullmq_configured: "[yes / no / assumption-based]"
ai_generation_available: "[yes / no]"
media_upload_working: "[yes / no / untested]"
```

## Postiz Workspace Setup

```yaml
organization: "[org name]"
workspace: "[workspace name]"
connected_accounts:
  - platform: "[Instagram]"
    account: "[@handle]"
    status: "[connected / pending]"
  - platform: "[LinkedIn]"
    account: "[profile/page name]"
    status: "[connected / pending]"
```

## Scheduling Steps

### Local-fork / Browser-hosted mode

1. Open Postiz at `[POSTIZ_URL]`
2. Navigate to the target workspace
3. For each post in the content calendar:
   a. Click "Create Post"
   b. Select the target platform(s)
   c. Paste the caption from the post draft
   d. Upload or attach media per the media brief
   e. Set the scheduled date and time
   f. Add hashtags
   g. Review and confirm
4. Verify all posts appear in the scheduling queue
5. Monitor the BullMQ queue for any failed jobs

### API-direct mode

```bash
# Example: Create and schedule a post via Postiz API
curl -X POST "[POSTIZ_URL]/api/posts" \
  -H "Authorization: Bearer [POSTIZ_API_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "[post caption]",
    "platforms": ["instagram", "linkedin"],
    "scheduledAt": "YYYY-MM-DDTHH:MM:SSZ",
    "media": ["[media_id]"],
    "workspace": "[workspace_id]"
  }'
```

## Expected Outputs

| Post # | Platform | Scheduled time | Status |
|---|---|---|---|
| 1 | Instagram | YYYY-MM-DD HH:MM | Queued |
| 2 | LinkedIn | YYYY-MM-DD HH:MM | Queued |

## Analytics Tracking

```yaml
tracking_plan:
  - metric: "engagement rate"
    check_after: "24 hours"
  - metric: "reach / impressions"
    check_after: "48 hours"
  - metric: "click-through rate"
    check_after: "72 hours"
postiz_analytics_url: "[POSTIZ_URL]/analytics"
```

## Open Questions

- [ ] [Any unresolved questions about the execution environment]
- [ ] [Any platform-specific concerns]
- [ ] [Any scheduling dependencies]
