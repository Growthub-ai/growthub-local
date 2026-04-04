# Paperclip Primitive Integration Plan (DX + Inbox)

## Context and objective

This document captures a **surgical, low-risk, backward-compatible** plan to reuse the existing paperclip/attachment primitive in:

1. DX interface main tab pages for agents.
2. Inbox issue workflows.

Goal: improve DUINUX (DX UI/UX) and interactivity without introducing schema breaks, route changes, or behavior regressions.

## Critical workflow constraints (from repo docs)

- Use `scripts/runtime-control.sh` as canonical local runtime entrypoint.
- Avoid direct `main`; work in feature branches/worktrees.
- Preserve CI contract expectations (`smoke`, `validate`, `verify`) and run `bash scripts/pr-ready.sh` before pushing.
- Treat this repo as source of truth for local runtime and package boundaries.

## Current primitive inventory (already in source)

### Attachment primitive and APIs

- Client API already supports listing/upload/deletion:
  - `issuesApi.listAttachments`
  - `issuesApi.uploadAttachment`
  - `issuesApi.deleteAttachment`
- Server already exposes issue attachment routes and content streaming under `/issues/:id/attachments` and `/attachments/:attachmentId/content`.

### Existing UI usage of paperclip primitive

- `IssueDetail` already includes:
  - upload button with paperclip icon
  - drag/drop handling
  - attachment list + deletion
  - markdown image upload hooks in document/comment editors
- `NewIssueDialog` already stages files before issue creation using paperclip flow.
- `CommentThread` visually surfaces attachment affordances.

### Gap to solve

- Paperclip primitive is strong in issue detail/new issue flows, but **not consistently discoverable** from:
  1. agents list/detail “main tabs” pathways,
  2. inbox issue triage actions.

## Surgical implementation strategy

### Phase 0 — no-risk prep (types + shared helpers only)

1. Add small shared utility in `ui/src/lib` to normalize attachment affordance behavior (accepted file types, max size messaging, upload state labels).
2. Keep all existing issue API contracts untouched.
3. Add unit tests for helper normalization and fallback behavior.

### Phase 1 — Inbox integration (lowest risk, highest value)

1. Add an **Attach** quick action in inbox rows that deep-links to issue detail with `#attachments` anchor (no inline mutation yet).
2. Add optional “Attach & comment” flow in inbox that opens the existing issue detail comment composer context, reusing upload path.
3. Preserve existing Inbox tabs and filtering semantics.

Safety:

- No server/API changes.
- No DB migrations.
- Uses existing issue authorization model.

### Phase 2 — Agents main tab integration (controlled enhancement)

1. Add “Create issue with attachment” CTA from Agents list and Agent detail tabs.
2. Route CTA to `NewIssueDialog` with preset assignee agent + staged file picker enabled.
3. Reuse existing staging/upload logic in `NewIssueDialog`; do not duplicate upload code.

Safety:

- Works as additive UI only.
- Existing “Ask CEO” and advanced configuration paths remain unchanged.

### Phase 3 — polish + guardrails

1. Unified microcopy and iconography for paperclip actions across Inbox / Agent pages / Issue pages.
2. Add lightweight telemetry hooks (UI-only) for click-through and upload success/failure (if telemetry infrastructure already present).
3. Add accessibility pass (focus order, aria-labels for attachment controls).

## Proposed file edit plan (for implementation PR)

### Likely UI files

- `ui/src/pages/Inbox.tsx`
  - add quick action surface linking to attachment workflow.
- `ui/src/pages/Agents.tsx`
  - add “Create issue w/ attachment” action.
- `ui/src/pages/AgentDetail.tsx`
  - add same action at detail tab level for consistency.
- `ui/src/components/NewIssueDialog.tsx`
  - expose a stable optional entrypoint prop/handler for immediate file staging from launching context.
- `ui/src/pages/IssueDetail.tsx`
  - no contract changes; optional anchor/scroll affordance hardening for `#attachments` landing.

### Supporting/shared files

- `ui/src/lib/inbox.ts`
  - if needed, support new inbox action metadata while preserving current tab logic.
- `ui/src/lib/queryKeys.ts`
  - unchanged expected, but verify no extra invalidation keys required.
- `ui/src/api/issues.ts`
  - no endpoint shape change required.

### Tests

- `ui/src/lib/inbox.test.ts`
  - ensure inbox filters unaffected by new action metadata.
- `ui/src/components/...` test additions where present for new CTA wiring.
- Add focused unit tests for any new attachment helper in `ui/src/lib`.

## Backward compatibility and risk controls

1. **No data model changes**: attachments remain issue-scoped exactly as today.
2. **No API shape changes**: reuse existing endpoints and payloads.
3. **No route breakage**: additive deep-linking only.
4. **Feature flag option**: gate new inbox/agent paperclip actions behind a small UI flag if desired.
5. **Progressive rollout path**: Inbox first, agents second.

## Security considerations

- Keep existing server-side content-type and size validation authoritative.
- Do not trust client MIME checks as enforcement.
- Preserve existing auth/access checks for attachment upload/read/delete.
- Ensure no attachment URLs are rendered in a way that bypasses existing session/company scoping.

## Approval-ready draft scope

### In scope

- Additive UI entrypoints to existing attachment primitive from Inbox and Agents.
- Reuse existing issue attachment infrastructure.
- Tests for helper logic and routing/CTA behavior.

### Out of scope

- New storage backends.
- New attachment schema fields.
- Cross-entity attachment ownership (non-issue attachments).
- Any changes to private monorepo components.

## Suggested PR breakdown

1. PR A: helper + tests only.
2. PR B: Inbox attach affordance.
3. PR C: Agents attach affordance.
4. PR D: UX polish + accessibility pass.

This sequencing keeps blast radius low and makes rollback straightforward.
