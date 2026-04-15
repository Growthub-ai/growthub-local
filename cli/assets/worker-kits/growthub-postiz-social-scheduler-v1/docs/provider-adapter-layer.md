# Provider Adapter Layer Notes

Postiz is the reference platform for this kit because it provides a self-hosted, open-source social media scheduling backend with 28+ platform integrations. The adapter layer must remain pluggable.

---

## REFERENCE PROVIDER — POSTIZ

| Field | Value |
|---|---|
| Provider name | Postiz |
| Auth pattern | API key or OAuth session |
| Post creation | `POST /api/posts` |
| Scheduling | Timestamp parameter on post creation |
| Queue engine | BullMQ (Redis-backed) |
| Media upload | Multi-part form upload |
| Analytics | Built-in dashboard + API endpoints |
| Workspace | Multi-workspace, multi-organization |

---

## ADAPTER CONTRACT

Every scheduling provider adapter should support:
- `CREATE_POST`
- `SCHEDULE_POST`
- `UPLOAD_MEDIA`
- `LIST_PLATFORMS`
- `GET_POST_STATUS`
- `LIST_SCHEDULED`

Optional:
- `CANCEL_SCHEDULED`
- `GET_ANALYTICS`
- `LIST_WORKSPACES`
- `HEALTHCHECK`

---

## POST LIFECYCLE ASSUMPTION

The agent should assume this lifecycle:
1. Create post content (caption, media, hashtags)
2. Select target platform(s)
3. Set scheduling time
4. Submit to BullMQ queue
5. Queue processes at scheduled time
6. Platform adapter publishes to social network
7. Result status updated (success/failure)
8. Analytics collected post-publish

---

## MULTI-PLATFORM POST ASSUMPTION

Postiz supports creating a single post that targets multiple platforms simultaneously. The agent should:
- Plan platform-specific adaptations (character limits, hashtag counts)
- Note which platforms receive the same post vs. unique drafts
- Document any platform-specific media requirements

---

## FALLBACK MODES

When the Postiz platform path fails:
- fallback to manual scheduling via the Postiz UI
- fallback to direct platform posting (bypass Postiz)
- mark the handoff with the exact fallback trigger

---

## FUTURE PROVIDER EXTENSION PATH

New scheduling providers should be added by implementing the same contract and documenting:
- auth mechanism
- post creation API
- scheduling parameters
- media upload flow
- queue/processing behavior
- analytics availability

Do not rewrite this kit around one provider-specific API schema.
