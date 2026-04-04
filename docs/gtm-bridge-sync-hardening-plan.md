# GTM Growthub Bridge + Knowledge Two-Way Sync Hardening Plan

## Scope and intent

This document translates the requested scope into an implementation plan that can be reviewed before code changes land. It focuses on:

1. Hardening Growthub Local ↔ hosted Growthub connection and callback behavior.
2. Ensuring knowledge-table selection/creation happens through authenticated hosted APIs.
3. Preserving two-way synchronization semantics with metadata compatibility and item grouping.
4. Defining an end-to-end validation plan.

## Critical workflow constraints confirmed

- Development workflow must use the canonical runtime control script (`scripts/runtime-control.sh`) and avoid ad-hoc server/ui loops as the default path.
- Branch naming, pre-push checks, and CI expectations are standardized (`smoke`, `validate`, `verify`).
- Growthub Local is the source of truth for local runtime + installer boundary; hosted app code is separate.

## Missing requested documents

The following files were requested for analysis but are not present in this checkout:

- `infrastructure-first.md`
- `service-architecture-map.md`

Proceeding with available canonical documents and source code.

## Current state summary (from code)

### Connection and callback plumbing

- GTM routes already expose:
  - `GET /gtm/connection` with computed callback URL.
  - `POST /gtm/connection/config` for base URL persistence.
  - `POST /gtm/connection/test` for hosted probe (`/api/providers/growthub-local/probe`) using local token.
  - `POST /gtm/connection/disconnect` for local token/session field cleanup.
- UI already has a Growthub connection card with “Open configuration,” “Pulse,” and “Disconnect” flows.
- Hosted handoff URL currently targets `/integrations` with `return_url` callback.

### Knowledge data model and GTM view model

- Shared GTM knowledge metadata already includes table-oriented fields (`table_id`, `workspace_id`, `admin_id`, `origin`, `connector_type`, `share_config`) that align with differentiating table identity vs item identity.
- GTM view model currently supports one table group + item list summary; it does not yet model multiple hosted table options for an authenticated dropdown selection flow.

### Knowledge base explorer surface

- Local read-only DB explorer routes exist (`/gtm/knowledge-base/tables`, `/tables/:name`, `/query`) for local DB inspection.
- This surface is useful for diagnostics but is not yet the authenticated hosted-table selection layer requested for plus-icon table creation/import binding.

## Proposed implementation outline (for approval)

## Phase 1 — Contract hardening (types + API contracts)

### 1) Add explicit hosted bridge contract types

**Proposed edits:**

- `packages/shared/src/gtm.ts`
  - Add new types for hosted table binding lifecycle:
    - `GtmHostedKnowledgeTableSummary`
    - `GtmHostedKnowledgeTableBinding`
    - `GtmHostedKnowledgeSyncStatus`
  - Extend metadata helpers to normalize strict table/item linkage keys:
    - `table_id` (hosted table identifier)
    - `table_source` (`existing` | `created`)
    - `sync_binding_id`
    - `last_sync_cursor` (optional checkpoint)

### 2) Add GTM API methods for hosted table discovery + binding

**Proposed edits:**

- `ui/src/api/gtm.ts`
  - Add methods:
    - `listHostedKnowledgeTables()`
    - `createHostedKnowledgeTable()`
    - `bindHostedKnowledgeTable()`
    - `syncHostedKnowledgeTable()`
  - Add response types matching shared contract additions.

## Phase 2 — Server integration layer for hosted table auth + bridge callbacks

### 3) Add server routes for hosted table integration (authenticated via stored token)

**Proposed edits:**

- `server/src/routes/gtm.ts`
  - Add new endpoints under `/gtm/connection/knowledge/*`:
    - `GET /tables` (list user-visible hosted tables)
    - `POST /tables` (create hosted table via existing supported hosted API)
    - `POST /bind` (persist local binding selection before import)
    - `POST /sync` (manual sync trigger + status return)
  - Enforce:
    - token/base URL preconditions,
    - tenant/user scoping,
    - explicit error payloads for authorization or scope mismatch.

### 4) Add metadata validation guardrails

**Proposed edits:**

- `server/src/routes/gtm.ts` and/or GTM service modules
  - Validate imported/created items include required linkage metadata.
  - Reject writes where `table_id` is missing for bound flows.
  - Ensure items are grouped by selected bound table in response shaping.

## Phase 3 — GTM UI integration for plus-icon flow and table chooser

### 5) Add authenticated dropdown for custom knowledge tables

**Proposed edits:**

- `ui/src/components/KnowledgeImportModal.tsx`
  - Add optional `HostedTableBindingSection` used in knowledge mode when connection is active.
  - UX states:
    - load hosted tables,
    - choose existing table,
    - create new table inline,
    - confirm binding before upload.

### 6) Wire GTM workspace/settings into binding lifecycle

**Proposed edits:**

- `ui/src/gtm/App.tsx`
  - In the existing connection/knowledge surfaces, add:
    - current bound table display,
    - bind/switch action,
    - sync status + last sync indicator,
    - hard block/warning when attempting knowledge upload without a selected binding in “hosted sync required” mode.

### 7) Connection URL hardening for callback consistency

**Proposed edits:**

- `ui/src/lib/growthub-connection.ts`
  - Preserve current `/integrations?return_url=...` behavior but add explicit optional parameters (if needed by hosted app) for:
    - `surface=gtm`
    - `workspace_label`
    - machine/session context keys approved by hosted side.
  - Keep backward compatibility by allowing hosted side to ignore unknown params.

## Phase 4 — End-to-end validation plan

### 8) Server tests

**Proposed new test files:**

- `server/src/__tests__/gtm-connection-knowledge-routes.test.ts`
  - unauthenticated token/base-url error paths.
  - hosted table list/create/bind/sync success + failure responses.
  - metadata guardrails (`table_id` required for bound sync writes).

### 9) UI tests

**Proposed new/updated test files:**

- `ui/src/components/__tests__/KnowledgeImportModal.hosted-binding.test.tsx`
  - dropdown render + loading/error states.
  - create-new-table flow.
  - block upload until binding selected (if required mode enabled).

- `ui/src/gtm/__tests__/GtmSettings.connection-sync.test.tsx`
  - bound table/status rendering.
  - manual sync action success/failure toasts.

### 10) Manual validation checklist

1. Configure local base URL and complete hosted auth callback.
2. Verify `Pulse` succeeds and returns hosted probe metadata.
3. Open knowledge import “plus” flow:
   - existing hosted table selection visible,
   - create new table works,
   - bind persists.
4. Upload knowledge items and verify:
   - metadata includes selected `table_id` and binding fields,
   - items appear grouped under selected table.
5. Trigger reverse sync (hosted → local) and verify local rendering updates.
6. Disconnect and ensure binding/sync actions are disabled or clearly error-scoped.

## Open decisions requiring maintainer approval

1. **Source of truth for binding persistence:** local config file vs DB table vs both.
2. **Sync mode:** user-triggered only vs background periodic sync.
3. **Conflict policy:** hosted wins, local wins, or field-level merge for edited items.
4. **Table creation authority:** always hosted API, or optional local-first staging table.
5. **Tenant scoping claims:** whether hosted API returns user-only, workspace-only, or admin-scoped tables.

## Recommended implementation order

1. Shared contract/types changes.
2. Server route additions with tests.
3. UI API client + plus-flow dropdown/create/bind UX.
4. Sync status UX and e2e/manual validation.

## Definition of done

- User can authenticate from local GTM and reliably return via callback.
- User can choose or create a hosted knowledge table before import.
- Every imported/synced item is metadata-linked to a table binding.
- Two-way sync operations are test-covered and error-scoped.
- CI gates pass (`smoke`, `validate`, `verify`) and pre-push checks pass.
