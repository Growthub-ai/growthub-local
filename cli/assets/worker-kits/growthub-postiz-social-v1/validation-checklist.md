# Validation Checklist — growthub-postiz-social-v1

**Run through this checklist before starting every operator session and before delivering any artifact package.**

---

## Pre-Session Checklist

### Environment Gate

- [ ] Node.js 18+ is installed (`node --version` returns 18+)
- [ ] Docker is installed and running (`docker --version`)
- [ ] `docker compose` command is available
- [ ] Git is installed (`git --version`)

### Local-Fork Mode (skip if agent-only)

- [ ] Postiz fork is cloned at `POSTIZ_FORK_PATH` (default: `~/postiz-app`)
- [ ] `docker compose ps` shows `postiz`, `postiz-postgres`, `postiz-redis` all running
- [ ] `curl http://localhost:3000/api/healthcheck` returns a 200 response
- [ ] At least one platform integration is connected and authorized in the Postiz admin UI
- [ ] `POSTIZ_WORKSPACE_ID` is set in `.env` (required for scheduling manifest submission)

### Agent-Only Mode (skip if local-fork)

- [ ] Mode is confirmed with the user and documented as `agent-only` at the top of all outputs
- [ ] Scheduling manifests are marked as `dry-run: true` in the manifest header

### Context

- [ ] Brand kit exists for the active client (`brands/<client-slug>/brand-kit.md`)
- [ ] Campaign objective is confirmed (one of: brand awareness / lead generation / engagement / product launch / community growth)
- [ ] Target platforms are confirmed and in the supported list (`docs/platform-coverage.md`)
- [ ] Campaign timeframe and posting cadence are confirmed

---

## Pre-Delivery Checklist

### Content Calendar

- [ ] All calendar rows have dates within the campaign window
- [ ] All platform slugs match `docs/platform-coverage.md`
- [ ] All post types are valid for their target platform
- [ ] Every row has a non-empty CTA
- [ ] Media asset notes are present for all image/video/carousel posts

### Caption Copy Deck

- [ ] All 3 variants (A/B/C) are present for every post entry
- [ ] All captions respect platform character limits
- [ ] Hashtag counts are within platform-recommended ranges
- [ ] No placeholder text remains (no `[INSERT CAPTION HERE]` style fragments)

### Scheduling Manifest

- [ ] All `scheduledAt` timestamps are ISO 8601 format with timezone offset
- [ ] All `postId` values follow the naming convention
- [ ] `workspaceId` is present (or `"placeholder"` with `dry-run: true` in agent-only mode)
- [ ] Every post in the manifest has a corresponding entry in the ContentCalendar

### Output Files

- [ ] All files follow the naming convention (`ClientSlug_OutputType_v<N>_<YYYYMMDD>.md`)
- [ ] All files are saved to `output/<client-slug>/<project-slug>/`
- [ ] Deliverable is logged in the brand kit DELIVERABLES LOG
- [ ] No API keys, tokens, or credentials appear in any output file

---

## Kit Integrity Checklist (run after kit changes)

- [ ] `kit.json` is valid JSON with `schemaVersion: 2`
- [ ] All paths in `frozenAssetPaths` exist on disk
- [ ] All paths in `outputStandard.requiredPaths` exist on disk
- [ ] Bundle manifest `bundles/growthub-postiz-social-v1.json` exists and matches kit.json
- [ ] `bundle.kitId` in bundle manifest matches `kit.id` in kit.json
- [ ] `bundle.workerId` in bundle manifest matches `entrypoint.workerId` in kit.json
- [ ] All paths in `requiredFrozenAssets` in bundle manifest exist on disk
