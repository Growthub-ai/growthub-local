# Governed Creation Release Snapshot V1

Canonical snapshot for the governed creation release branch.

This release turns API Registry rows, Data Sources, helper proposals, workflow persistence, and Workspace Lens signals into one operator journey inside the exported workspace app. The user path is no longer a set of disconnected tables and buttons; it is a governed cockpit that exposes real runtime state, uses existing mutation paths, and closes only when the workspace has evidence.

## Scope

This snapshot covers the feature work landed on branch `claude/governed-creation-0139-t3uo49` across the exported `growthub-custom-workspace-starter-v1` workspace app.

Feature commits in this branch cover:

- Create Data Source from a tested API Registry row.
- Governed creation cockpit inside the API Registry drawer.
- Runtime-backed cockpit truth from env status, source records, last test results, and existing Data Source rows.
- API response profiling, resolver recommendation, activation score, and receipts.
- Data Source preview before create.
- Structured creation error recovery.
- Shared cockpit grammar for workflow serverless, scheduler, and persistence upgrade.
- Orchestration graph workflow surface upgrade path.
- Thin adapter visibility for runtime env and persistence gaps.
- Helper fast path for `register_api` and governed `resolver.create` proposals.
- Activation deep links, helper setup modal layering, and cockpit UX polish.

## User-Facing Surfaces

### API Registry Cockpit

The API Registry drawer now renders a governed creation cockpit for a selected API row. It derives the journey from live workspace state:

1. Register the API.
2. Configure auth reference when needed.
3. Test the API server-side.
4. Optionally shape the response with a resolver.
5. Create a governed Data Source.
6. Refresh source records into the sidecar.
7. Confirm sandbox automation can call the API.

The cockpit is intentionally evidence-driven. It reads the row, runtime env-status signal, workspace source records, linked Data Source objects, and test response profile. It does not infer completion from UI clicks alone.

### Data Source Creation And Refresh

The Data Source action uses the existing governed Data Model path. It creates a live-backed Data Source object that links back to the API Registry row by registry id and source id. Refresh uses `POST /api/workspace/refresh-sources` and persists normalized records into the workspace source-record sidecar under the Data Source object id.

Final QA proof from the live workspace:

- `growthub-workspace-smoke-api-source` refreshed successfully.
- `recordCount` was `11`.
- `skipped` was empty.
- Stored records persisted in `workspaceSourceRecords`.
- The cockpit hid after completion.
- The success result rendered through cockpit receipts instead of unstyled loose text.

### Resolver Pipeline

The resolver pipeline supports runtime-created resolver files. Resolver files under `lib/adapters/integrations/resolvers/` register through the shared source resolver registry. The loader now rescans the resolver directory on route invocation and imports only newly discovered files, preserving the one-registration-per-file behavior while allowing helper-created resolver files to work without a full app rebuild.

Both source routes use the same loader entrypoint before lookup:

- `POST /api/workspace/test-source`
- `POST /api/workspace/refresh-sources`

Final QA proof from the live workspace:

- `test-source` returned `ok: true` for `growthub-workspace-smoke-api`.
- `refresh-sources` returned `refreshed` with `11` records.
- The resolver stayed scoped to the selected integration id.
- No credentials were written into Data Model rows, source records, resolver payloads, browser state, or exported templates.

### Workspace Helper Fast Path

The helper can open directly from the API Registry cockpit to create a scoped response resolver proposal. Proposal rendering uses the same clean chat grammar as the helper tool-call output surface:

- compact proposal rows
- selected proposal count
- tool-call style output cards
- concise apply outcome
- no warning-card clutter for normal assistant text

The apply lane supports governed `resolver.create` as a server-file operation and `dataModel.object.update` for the existing Data Source linkage. The helper remains propose-then-apply; it does not silently mutate workspace config without an explicit apply action.

### Workflow Persistence Upgrade

The workflow surface now uses the same cockpit grammar for the sandbox serverless upgrade path. The workflow operator can move from local execution to persistent scheduled execution through real fields:

- `runLocality`
- execution adapter
- `schedulerRegistryId`
- scheduler auth resolution
- durable persistence adapter readiness
- local run and scheduled run actions

The cockpit is collapsible and coexists with the workflow canvas so the operator can review the upgrade state without losing the graph mental model.

Final QA proof from the live workspace:

- Workflow creation in onboarding produced a real scaffolded workflow.
- Local workflow run path was exercised.
- Workflow state reached `live`.
- Onboarding checklist reached complete state after the workflow run.
- Workspace Lens reflected the active workspace state after the workflow and helper paths.

### Workspace Lens And Activation

Workspace Lens remains the cross-workspace cockpit for readiness and handoff. This release tightens the relationship between:

- builder onboarding completion
- helper setup
- API Registry creation state
- Data Source records
- workflow persistence status
- agent-assignable workspace capabilities

The activation panel and helper setup modal now layer correctly over Data Model and other pages. Active modals own the overlay and page shell interaction, preventing background surfaces from visually competing with setup steps.

## Runtime Contracts

The release keeps these contracts intact:

- Secrets stay server-side and are referenced by slug only.
- Data Model changes go through the workspace config validator and PATCH boundary.
- Source-record refresh writes into the governed sidecar instead of mutating widgets directly.
- Resolver files register through the source resolver registry.
- Workflow upgrade state is derived from sandbox row fields, scheduler row status, env-status, and persistence adapters.
- Helper proposals remain reviewable before apply.

## Verification Completed

Live browser QA completed on `http://localhost:3000`:

- API Registry cockpit modal and drawer rendering.
- Helper setup modal overlay behavior.
- Helper fast path from API Registry row to resolver proposal.
- Apply proposal UI cleanup and tool-call style output.
- Data Source creation from tested API Registry row.
- Source refresh from the visible cockpit button.
- Source-record sidecar persistence.
- Cockpit completion hide behavior.
- Workflow creation from onboarding.
- Local workflow run and checklist completion.
- Workflow serverless/persistence cockpit rendering.
- Workspace Lens opened after the feature paths and reflected current workspace state.

Focused unit coverage added for:

- API Registry creation flow derivation.
- API response profiling.
- Creation error recovery.
- Data Source creation from registry.
- Env-status runtime signal.
- Sandbox serverless flow derivation.
- Serverless upgrade helpers.
- Workspace resolver proposal generation.

## Release Boundary

This is a workspace-starter asset release. The changed product surface lives under:

`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`

The CLI package and guided installer versions must move in lockstep for the release that carries these workspace assets. The committed CLI dist bundle remains a Phase B super-admin artifact as defined in `docs/AGENT_DIST_REBUILD_GUIDE.md` and `docs/RELEASE_DIST_REBUILD_WORKFLOW.md`.
