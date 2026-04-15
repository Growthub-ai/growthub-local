# Validation Checklist — growthub-zernio-social-v1

**Run through this checklist before starting every operator session and before delivering any artifact package.**

---

## Pre-Session Checklist

### Environment Gate

- [ ] Node.js 18+ is installed (`node --version` returns 18+)
- [ ] `curl` is installed (used for Zernio healthchecks)
- [ ] Git is installed (`git --version`)

### Api-Live Mode (skip if agent-only)

- [ ] `ZERNIO_API_KEY` is set in `.env` and matches `sk_` + 64 hex format
- [ ] `ZERNIO_API_URL` is set (default `https://zernio.com/api/v1`)
- [ ] `GET /api/v1/profiles` returns 200 with the API key
- [ ] `ZERNIO_PROFILE_ID` is set and exists on the account
- [ ] At least one platform account is connected on the profile (`GET /api/v1/accounts`)
- [ ] API key scope is `read-write` (required for scheduling)

### Agent-Only Mode (skip if api-live)

- [ ] Mode is confirmed with the user and documented as `agent-only` at the top of all outputs
- [ ] Scheduling manifests are marked as `"dryRun": true` in the manifest header
- [ ] Every `platforms[].accountId` is flagged as placeholder tagged with the account handle

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

- [ ] Shape matches `POST /api/v1/posts` body expectations (see `docs/posts-and-queues-layer.md`)
- [ ] All `scheduledFor` timestamps are ISO 8601 with explicit timezone offset
- [ ] All `clientPostId` values follow the naming convention
- [ ] `profileId` is present (or the manifest is `"dryRun": true`)
- [ ] `platforms[].platform` values all exist in `docs/platform-coverage.md`
- [ ] Every post in the manifest has a corresponding entry in the ContentCalendar

### Output Files

- [ ] All files follow the naming convention (`ClientSlug_OutputType_v<N>_<YYYYMMDD>.md`)
- [ ] All files are saved to `output/<client-slug>/<project-slug>/`
- [ ] Deliverable is logged in the brand kit DELIVERABLES LOG
- [ ] No API keys, tokens, or credentials appear in any output file
- [ ] No partial Zernio request responses with raw auth headers are included

---

## Kit Integrity Checklist (run after kit changes)

- [ ] `kit.json` is valid JSON with `schemaVersion: 2`
- [ ] All paths in `frozenAssetPaths` exist on disk
- [ ] All paths in `outputStandard.requiredPaths` exist on disk
- [ ] Bundle manifest `bundles/growthub-zernio-social-v1.json` exists and matches kit.json
- [ ] `bundle.kitId` in bundle manifest matches `kit.id` in kit.json
- [ ] `bundle.workerId` in bundle manifest matches `entrypoint.workerId` in kit.json
- [ ] All paths in `requiredFrozenAssets` in bundle manifest exist on disk
- [ ] `node scripts/check-worker-kits.mjs` passes
- [ ] `bash scripts/check-custom-workspace-kernel.sh` passes
