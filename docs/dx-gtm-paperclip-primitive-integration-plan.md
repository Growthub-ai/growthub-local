# DX/GTM Paperclip Primitive Integration Plan (Draft for Approval)

## Context and constraints reviewed

This implementation plan is grounded in the repo workflow and contribution guardrails documented in:

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `CONTRIBUTING.md`

Requested docs `infrastructure-first.md` and `service-architecture-map.md` were not found in this checkout as of 2026-04-04 (`find . -iname 'infrastructure-first.md' -o -iname 'service-architecture-map.md'` returned no matches).

## Product objective

Safely reuse the existing paperclip/attachment primitive in the **DX interface** and integrate it into the **GTM main tabs focused on Agents + Inbox issue workflows** with:

- strict backward compatibility,
- low regression risk,
- no schema-breaking behavior,
- secure file handling and permission boundaries preserved.

## Current source-of-truth primitives already in code

### Existing attachment API + validation + storage security

- Attachment APIs already exist in the frontend via `issuesApi.listAttachments/uploadAttachment/deleteAttachment`.
- Server-side upload route already enforces:
  - company/issue scoping,
  - content-type allowlist,
  - max file size,
  - metadata validation,
  - storage-backed retrieval with company access control,
  - activity logging.

### Existing UI primitive patterns

- `NewIssueDialog` already provides the paperclip upload UX with staged files, document vs attachment typing, and drag/drop.
- `IssueDetail` already includes attachment queries and upload mutation flows.
- GTM has dedicated pages/routes for Agents and Inbox inside `ui/src/gtm/App.tsx`.

## Surgical implementation strategy (lowest-risk)

### Principle: do not invent a new upload stack

Use a composition approach:

1. **Extract** a reusable, scope-limited attachment input/picker primitive from `NewIssueDialog` behavior.
2. **Reuse** the existing `issuesApi.uploadAttachment` and issue attachment server route.
3. **Attach only to existing issue records** in GTM Agents/Inbox flows (no standalone storage concepts).
4. **Gate all behavior with feature flags + graceful fallback** so old behavior remains default-safe.

## Proposed phased plan

### Phase 0 — discovery and contract hardening (no user-facing change)

- Confirm allowed MIME types + max bytes from server constants and environment behavior.
- Confirm issue-context invariants for GTM routes (always known `companyId` + target `issueId`).
- Add focused tests for utility logic only (no visual/UI regressions yet).

### Phase 1 — shared primitive extraction (internal refactor)

- Introduce a reusable component/hook (e.g., `IssueAttachmentPicker`) in `ui/src/components/`.
- Migrate `NewIssueDialog` to consume the shared primitive while keeping exact behavior parity.
- No routing/page behavior changes in this phase.

### Phase 2 — GTM Inbox issue integration

- In GTM Inbox issue cards/rows, add a low-emphasis “Attach” action that opens the shared picker.
- Upload directly to the selected issue using existing API.
- On success, invalidate only relevant query keys (`issues`, `attachments`, `gtm inbox`) to avoid broad cache churn.

### Phase 3 — GTM Agents tab integration

- In GTM Agents surface, expose “Attach to issue” where an issue association already exists (run-linked or selected issue).
- If there is no issue context, show explicit non-blocking guidance (“Select/Open issue first”) rather than creating new workflow branches.

### Phase 4 — DX parity and accessibility pass

- Ensure shared primitive works identically in DX route context.
- Verify keyboard, focus management, and screen-reader labels for paperclip action.

## Backward compatibility plan

- Keep existing endpoints and payloads unchanged.
- No DB schema change in first rollout.
- No mutation to existing `IssueAttachment` shape.
- Feature is additive only; existing issue/comment and inbox flows remain valid.
- If upload fails, preserve current UX state and show non-destructive error toast.

## Security and safety controls

- Rely on existing server enforcement for MIME/type + size limits.
- Do not bypass `assertCompanyAccess` or issue/company matching rules.
- Do not store raw file contents in client localStorage drafts.
- Preserve activity log emission for auditability (`issue.attachment_added`).
- Add explicit client-side preflight messaging for unsupported types to reduce noisy server retries.

## Risk matrix and mitigations

1. **Risk:** GTM page complexity increases.  
   **Mitigation:** compose shared primitive with minimal local state and no new global store.

2. **Risk:** regressions in NewIssueDialog existing upload flow.  
   **Mitigation:** extract first, verify parity, then adopt elsewhere.

3. **Risk:** query invalidation causes stale/overfetch behavior.  
   **Mitigation:** use targeted query keys only and keep mutation side effects narrow.

4. **Risk:** inconsistent behavior across DX vs GTM routes.  
   **Mitigation:** route-agnostic shared component API + tests for both route contexts.

## Proposed file edit map (for implementation PR after approval)

### Likely to edit

- `ui/src/components/NewIssueDialog.tsx`  
  Refactor to consume shared attachment primitive without behavior change.

- `ui/src/gtm/App.tsx`  
  Add attachment entry points for Inbox/Agents issue-context actions.

- `ui/src/pages/Inbox.tsx`  
  (If needed for DX parity) add optional attach action on issue work items.

- `ui/src/api/issues.ts`  
  Keep API contract; only adjust helper signatures if needed for stricter typing.

- `ui/src/lib/queryKeys.ts`  
  Add/normalize any missing keys needed for precise attachment cache invalidation.

- `ui/src/components/*` (new)  
  Add extracted shared primitive(s), e.g. `IssueAttachmentPicker.tsx` and optional hook.

### Possibly edit (only if necessary)

- `server/src/attachment-types.ts`  
  Only if approved MIME matrix changes are required (default should remain unchanged initially).

- `server/src/routes/issues.ts`  
  Only for non-breaking validation/error-message improvements.

### Tests to add/update

- `ui/src/lib/inbox.test.ts` (if Inbox behavior changes)
- New component tests for shared attachment picker behavior
- Optional API route tests if server-side messaging changes

## Definition of done (acceptance)

- Paperclip action available in approved GTM locations tied to real issue context.
- Upload succeeds with existing API and appears in Issue Detail attachment list.
- Unsupported file types and oversize files are gracefully handled.
- No route breakage for `/dx/*` or `/gtm/*` flows.
- No schema or migration required.
- Existing NewIssueDialog behavior remains unchanged from user perspective.

## Rollout and rollback

- Rollout behind a small UI feature flag (default off in first merge if preferred).
- Enable for internal testing first.
- Rollback path: disable flag; no data migration rollback required.

## Approval requested

If approved, the implementation PR will follow this exact sequence:

1. Primitive extraction + parity checks.
2. GTM Inbox integration.
3. GTM Agents integration.
4. DX parity + accessibility polish.
5. Final regression pass via `bash scripts/pr-ready.sh`.
