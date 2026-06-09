# Governed Creation Sprint Retrospective V1

Future-agent context for the governed creation release.

This document synthesizes the governed workspace topology, Causation ITT theory, Workspace Helper contract, and Agent Workspace as Code product model for the v0.14.0 governed creation release. It is a retrospective and customer-facing feature explanation, not a new architecture.

Primary source docs:

- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md)
- [`docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`](./CAUSATION_ITT_ELIGIBILITY_DRIVERS.md)
- [`docs/WORKSPACE_HELPER_CONTRACT_V1.md`](./WORKSPACE_HELPER_CONTRACT_V1.md)
- [`docs/GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md)
- [`docs/AGENT_SKILLS_TOOLS_UNIFICATION.md`](./AGENT_SKILLS_TOOLS_UNIFICATION.md)

## Executive Summary

The governed creation release turns API Registry rows, Data Sources, helper proposals, workflow persistence, onboarding, and Workspace Lens state into one evidence-driven operator journey inside the exported workspace app.

Before this release, a user could see the primitives: Data Model rows, workflow rows, helper chat, source records, and workspace activation state. The product gap was that the user still had to connect those primitives mentally. This release closes that gap by adding a governed cockpit that derives the next eligible action from real workspace state, exposes the action in the right surface, and closes only when the workspace has persisted evidence.

Customer-facing, the release means a user can:

1. Register or select an API row.
2. Test it server-side.
3. Profile the response.
4. Optionally create a scoped resolver through the helper.
5. Create a governed Data Source.
6. Refresh real source records.
7. Confirm sandbox automation can call the API.
8. Upgrade workflow execution from local draft mode toward persistent scheduled execution.
9. See the resulting readiness in Workspace Lens.

The outcome is a no-code path from "I have an API" to "this workspace can use the API as governed data and automation evidence."

## Customer-Facing Feature Explanation

Growthub Local now makes API setup feel like a product workflow instead of a sequence of disconnected configuration chores.

The API Registry cockpit appears in the record drawer for a selected API row. It guides the user through the real setup lifecycle: register, configure auth reference when needed, test, shape response, create Data Source, refresh records, and automate. Each step is derived from runtime truth. The cockpit does not mark work complete because a button was clicked. It marks work complete when the row, source records, linked Data Source object, test result, and automation state prove that the workspace is ready.

The helper fast path lets the user ask for a response resolver directly from the API Registry journey. The helper remains review-first: it proposes changes, renders them in the same clean chat and tool-call grammar as the rest of the helper, and applies only the proposals the user accepts. Resolver creation is handled as a server-file operation, while Data Model linkage remains a governed Data Model update. The user sees a simple proposal and apply experience, while the workspace keeps the correct architectural boundary.

The Data Source refresh path is the customer proof point. Refresh calls the real source route, runs the resolver when configured, normalizes the response, and persists source records into the governed sidecar. The UI no longer has to fake state or leave loose success text in the drawer. If records refresh successfully, the cockpit can hide because the workspace evidence exists.

The workflow upgrade path brings the same cockpit language to workflow persistence. A workflow can start as a local draft and then expose the path to persistent scheduled execution through real fields: run locality, adapter, scheduler registry linkage, auth readiness, durable persistence readiness, and run actions. The workflow canvas remains the user's mental model, and the cockpit explains what must be finished without replacing the graph.

Workspace Lens is the holistic readiness surface. It reflects onboarding, helper setup, API Registry completion, Data Source records, workflow state, and workspace capabilities from derived evidence. It is not a duplicate agent or hidden workflow. It is the workspace reading itself.

## AWaC Product Interpretation

Agent Workspace as Code means the workspace is the owned artifact. The source of truth is not a SaaS session, a temporary browser state, or a generated chat transcript. The artifact includes:

- `growthub.config.json`
- `apps/workspace`
- `.growthub-fork/`
- Data Model objects
- source records
- helper receipts
- sandbox environment rows
- workflow rows
- resolver files
- docs, skills, helpers, and templates

This release strengthens AWaC because the product journey now writes and reads those artifact surfaces coherently. The browser edits the governed workspace. The helper drafts and applies proposals through the governed helper path. Source refresh writes source records. Workflow execution uses sandbox and adapter boundaries. Workspace Lens reads the resulting evidence.

The release does not introduce a parallel product model. It makes the existing topology usable as a guided customer journey.

## Causation ITT Interpretation

Causation ITT frames the workspace as a live causal graph:

```text
state -> eligibility -> guidance -> action -> evidence -> next state
```

The workspace starts as high-entropy state: objects, rows, source records, workflow status, helper receipts, persistence modes, adapters, and runtime test results can exist in many combinations. Pure eligibility drivers reduce that state into low-entropy guidance: complete, blocked, next, optional, done, and available action.

The governed creation cockpit is the product expression of that rule. It reads workspace state without side effects, computes the next eligible action, and shows the action to the user. The user acts through the no-code surface. The workspace changes. The cockpit recomputes.

This is why completion is evidence-driven:

- API test completion comes from a server-side test result.
- Data Source completion comes from a linked governed object.
- refresh completion comes from persisted source records.
- resolver readiness comes from scoped resolver proposal and loader behavior.
- workflow persistence readiness comes from sandbox row fields, scheduler linkage, env status, and persistence adapter signals.
- onboarding completion comes from real workflow state and workspace evidence.

No future agent should replace this with hidden UI flags, duplicate rows, fake data, or direct JSON edits when a governed surface can perform the same action.

## Architecture Detail

The release keeps the topology boundary intact:

- `PATCH /api/workspace` remains restricted to the allowed workspace config fields.
- Data Model rows remain governed config-backed objects.
- API Registry rows are Data Model rows, not a separate database table.
- Data Source objects link back to API Registry rows by stable ids.
- source records persist in the workspace source-record sidecar.
- helper proposals remain reviewable before apply.
- secrets remain server-side and are referenced by slug or auth reference.
- resolver files register through the source resolver registry.
- workflow execution remains behind sandbox and adapter boundaries.

Important implementation surfaces in the workspace starter include:

- `app/data-model/components/ApiRegistryCreationCockpit.jsx`
- `lib/api-registry-creation-flow.js`
- `lib/api-response-profile.js`
- `lib/creation-error-recovery.js`
- `lib/env-status.js`
- `lib/workspace-resolver-proposal.js`
- `lib/server-resolver-write.js`
- `lib/adapters/integrations/resolver-loader.js`
- `lib/sandbox-serverless-flow.js`
- `lib/serverless-upgrade.js`
- `app/workflows/WorkflowSurface.jsx`
- `app/data-model/components/HelperSidecar.jsx`
- `app/components/WorkspaceActivationPanel.jsx`

The runtime-created resolver loader is a critical release detail. Resolver files can be written at runtime by the governed helper apply lane, then discovered by the source routes without requiring a full app rebuild. The loader rescans the resolver directory and imports newly discovered files while preserving one registration per file. Both `test-source` and `refresh-sources` use the loader before lookup.

## QA And Release Proof

The final release proof covered the real localhost workspace, the merged source branch, the official release workflow, npm publication, and an exported workspace from the published package.

Verified outcomes:

- API Registry cockpit rendered in the drawer.
- helper setup modal layered correctly over Data Model and other pages.
- helper fast path opened from the API Registry row.
- resolver proposals rendered in clean helper/tool-call style.
- proposals applied through the governed apply lane.
- Data Source was created from a tested API Registry row.
- source refresh pulled 11 records into source records.
- source refresh returned no skipped records.
- cockpit hid after completion.
- local workflow run path completed onboarding.
- workflow state reached live.
- workflow serverless/persistence cockpit rendered with the same grammar.
- Workspace Lens reflected the resulting workspace state.
- `@growthub/cli@0.14.0` and `@growthub/create-growthub-local@0.14.0` were published.
- an exported workspace from the published package contained the governed creation files.

## Future-Agent Rules

Future agents should treat this release as a completed topology-aligned product path.

Do:

- use the live workspace surface when validating behavior.
- compare UI state to `/api/workspace` and source-record evidence when persistence matters.
- preserve the API Registry cockpit as an evidence-driven driver.
- preserve the helper as propose-then-apply.
- preserve source refresh as the source-record proof point.
- preserve workflow persistence as a sandbox/serverless upgrade lane.
- preserve Workspace Lens as the derived readiness surface.

Do not:

- add fake fallback rows or duplicate registry paths.
- mark cockpit steps complete from click state alone.
- store credentials in Data Model rows, source records, resolver payloads, browser state, or exported templates.
- bypass helper apply for helper-originated mutations.
- mutate widgets or canvas as a side effect of Data Source refresh.
- treat Workspace Lens as a separate agent or competing workflow.

The durable mental model is:

```text
AWaC owns the artifact.
Topology owns the boundary.
ITT owns the derivation.
The cockpit owns guided creation.
The helper owns reviewed proposals.
Source records own refresh evidence.
The resolver loader owns runtime extraction.
The workflow cockpit owns persistence upgrade.
Workspace Lens owns holistic readiness.
```

