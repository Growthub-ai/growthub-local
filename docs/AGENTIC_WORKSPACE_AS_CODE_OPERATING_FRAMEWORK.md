# Agentic Workspace as Code Operating Framework

Official operating guide for the Growthub Local governed workspace.

This guide explains the mental model, user workflow, agent workflow, and applied use cases for Agentic Workspace as Code (AWaC). It should be read with:

- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md)
- [`docs/WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md)
- [`docs/WORKSPACE_STARTER_ACTIVATION_PATH.md`](./WORKSPACE_STARTER_ACTIVATION_PATH.md)
- [`docs/WORKSPACE_HELPER_CONTRACT_V1.md`](./WORKSPACE_HELPER_CONTRACT_V1.md)
- [`docs/WORKSPACE_WORKFLOWS_FOLDER_ITEM_V1.md`](./WORKSPACE_WORKFLOWS_FOLDER_ITEM_V1.md)
- [`docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`](./CAUSATION_ITT_ELIGIBILITY_DRIVERS.md)
- [`docs/GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md)

## The Mental Model

Growthub Local is an Agent Workspace as Code system.

AWaC means the workspace is the owned artifact. The product is not only a web app, a CLI, a dashboard, an agent chat, or a workflow runner. The product is the complete governed workspace folder:

- `growthub.config.json`
- `apps/workspace`
- `.growthub-fork/`
- Data Model objects
- source records
- helper receipts
- workflow and sandbox rows
- resolver files
- skills, helpers, templates, docs, and trace

Everything important should be inspectable, exportable, forkable, and recoverable from the workspace artifact.

The browser is the no-code operating surface. The API is the governed mutation boundary. The Data Model is the local business-object surface. Source records are the evidence layer. Workflows are executable orchestration rows. The helper is a proposal engine. Workspace Lens is the readiness and handoff surface.

The product rule is:

```text
state -> eligibility -> guidance -> action -> evidence -> next state
```

The workspace starts with raw state: objects, dashboards, API rows, source records, workflows, helper receipts, persistence mode, adapter readiness, and run evidence. The product derives eligibility from that state, shows the user the next action, records evidence after the action, and recomputes the next view.

This is why Growthub work should never be completed by fake rows, hidden UI flags, or direct JSON hacks when a governed surface exists. The workspace must prove its state through persisted evidence.

## The Core Surfaces

### Builder

Builder is the main workspace creation surface. It organizes dashboards, sites, workflow items, and workspace setup. A dashboard opens a dashboard canvas. A workflow opens the orchestration canvas. Builder is where a user sees what exists and creates the next workspace artifact.

Use Builder to:

- create dashboards
- create or open workflow items
- finish onboarding
- inspect workspace progress
- navigate to governed creation surfaces

### Data Model

Data Model owns governed business objects. Objects and rows live inside the workspace config and are validated by the workspace schema. Data Model creation does not automatically create dashboard widgets. Binding data to a dashboard is a separate user action.

Use Data Model to:

- define business objects
- manage rows
- inspect API Registry rows
- manage Data Source objects
- inspect sandbox environment rows
- open record sidecars and cockpit flows

### API Registry Cockpit

The API Registry cockpit is the guided setup lane for an API row. It turns API configuration into a governed workflow:

1. register the API
2. configure auth reference when needed
3. test the API server-side
4. profile the response
5. optionally create a scoped resolver
6. create a governed Data Source
7. refresh source records
8. confirm sandbox automation can call the API

The cockpit should only show completion when workspace evidence exists. A tested API response, linked Data Source, persisted source records, resolver readiness, and automation readiness are real evidence. Click state alone is not evidence.

### Workspace Helper

The helper is a governed planning engine. It drafts proposals and requires explicit apply before mutation.

Use the helper for:

- building dashboards
- creating widgets
- registering APIs
- creating objects
- editing views
- repairing workspace issues
- explaining objects
- proposing response resolvers

The helper must stay proposal-first. Normal query does not write workspace config. Apply validates and writes accepted proposals. Accepted changes create receipts. Credentials do not enter the prompt.

### Workflows

Workflows are Builder folder items that point at sandbox environment rows. They are not dashboard rows and not static shortcuts. They open a no-code orchestration canvas backed by a governed sandbox row.

Use workflows to:

- create local draft automations
- edit orchestration graphs
- test drafts through `POST /api/workspace/sandbox-run`
- publish only after the exact saved draft passes
- move local workflows toward persistent scheduled execution

The workflow upgrade cockpit exposes run locality, adapter, scheduler link, auth readiness, durable persistence, and run actions without replacing the canvas.

### Workspace Lens

Workspace Lens is the holistic readiness surface. It reads the workspace artifact and shows activation, progress, next actions, helper setup, workflow readiness, source-record evidence, contribution activity, and handoff signals.

Use Workspace Lens to:

- understand current workspace readiness
- find incomplete setup paths
- inspect evidence-driven next actions
- align human and agent work on the same state

Workspace Lens is not a duplicate agent. It is a derived cockpit for the same workspace artifact.

## How To Use The Workspace

### 1. Create or Open a Workspace

Use one of the official entry paths:

```bash
npm create @growthub/growthub-local@latest
growthub starter init --kit growthub-custom-workspace-starter-v1 --out ./my-workspace
growthub starter import-repo <owner/repo> --out ./my-workspace
growthub starter import-skill <owner/repo/skill> --out ./my-workspace
growthub kit download <kit-id> --out ./my-workspace
```

All supported paths should land at the governed workspace shape described by the topology doc.

### 2. Run the Workspace App

For an exported workspace:

```bash
cd ./my-workspace/apps/workspace
npm install
npm run dev
```

Open the local app and use the UI as the primary operating surface.

### 3. Create the First Business Objects

Open Data Model and create or inspect the objects that define the workspace. For a business workspace, this might be customers, deals, projects, tickets, campaigns, invoices, content, events, or source records.

Use objects for durable business data. Use dashboards for presentation. Do not collapse those responsibilities into one surface.

### 4. Create Dashboards

Open Builder and create a dashboard or apply a template. Use View widgets to display Data Model objects. Use charts and rich text for presentation. Keep dashboard configuration separate from the underlying object rows.

### 5. Register APIs and Create Data Sources

Open the API Registry object and select an API row. Use the cockpit:

- test the API
- create or apply a resolver only when response shaping is needed
- create a Data Source
- refresh source records
- confirm the cockpit closes after evidence exists

This is the canonical path for making external API data usable inside the workspace.

### 6. Use The Helper

Open the helper from Builder, Data Model, API Registry, or the rail. Ask for a scoped action. Review proposals. Apply only the proposals that match the intended workspace change.

The helper should make the user faster, but it should not bypass the workspace contract.

### 7. Build Workflows

Open Builder and create or open a workflow item. Edit the graph, save a draft, test it, inspect the run, and publish only after the exact saved draft passes.

For API-backed workflows, use the API Registry call and transform/result nodes. For business workflows, bind data-action nodes to governed Data Model objects.

### 8. Review Workspace Lens

Use Workspace Lens to confirm what is complete and what remains eligible. The Lens should reflect the workspace state from evidence, not from a separate checklist.

### 9. Export, Commit, or Deploy

When the workspace is ready, export or commit the artifact. The release should carry the app, config, docs, source records where appropriate, helper receipts, workflow rows, and resolver files needed for the next operator or agent to continue.

## Applied Use Cases

### Customer Portal

Create Customers, Projects, Documents, and Tasks objects. Build a dashboard that shows status, deliverables, and embedded resources. Use the helper to draft widgets or repair table bindings. Add workflows for status updates or document review. Workspace Lens tracks readiness and handoff.

### API-Backed Operations Dashboard

Register an external API in the API Registry. Test it, profile the response, create a resolver if needed, create a Data Source, and refresh source records. Bind the Data Source into a dashboard table or chart. Add a workflow that refreshes or acts on those records.

### Internal Automation Hub

Create sandbox environment rows for local agents, API tools, and workflow execution. Use Builder workflow items to organize automations. Draft and test workflows locally before publishing. Upgrade workflows toward persistent scheduled execution when the scheduler and persistence signals are ready.

### Sales or CRM Workspace

Create Accounts, Contacts, Opportunities, Tasks, and Notes objects. Use dashboards to show pipeline stages, follow-up queues, and revenue summaries. Use helper proposals for dashboard setup. Use workflows for record updates, reminders, enrichment, or human approval steps.

### Content Operations

Create Campaigns, Assets, Reviews, Approvals, and Publishing Calendar objects. Use workflows for review routing, status changes, and publishing steps. Use Workspace Lens to show active branches, pending work, and recent contribution activity.

### Support or Issue Triage

Create Tickets, Customers, Incidents, SLA, and Runbook objects. Register APIs for support tools when needed. Refresh source records into governed objects. Use workflows for assignment, escalation, and response drafting. Keep run evidence and source records traceable.

### Agentic Research Workspace

Create Sources, Findings, Tasks, Evidence, and Reports objects. Use helper for synthesis proposals. Use workflows to fetch, filter, and normalize records. Use source records as the evidence layer. Use Workspace Lens to show what has been gathered and what remains open.

### Local-To-Hosted Upgrade Path

Start locally with filesystem persistence and local workflow tests. Use the cockpit to identify what is required for scheduled or durable execution. Move only the execution authority that needs hosted depth. Keep the workspace artifact as the source of truth.

## L1-L5 Operating Map

### L1 Input

Inputs are repos, kits, skills, API rows, helper prompts, Data Model rows, workflow nodes, source records, and human intent.

### L2 Parsing

Inputs normalize into the governed workspace shape: config, app runtime, fork state, Data Model, source records, helper receipts, workflows, skills, docs, and helpers.

### L3 Heuristics

The workspace derives eligibility: what is complete, blocked, optional, next, or ready. The user and agent choose the safest governed surface for the next action.

### L4 Execution

Actions persist through governed write paths: `PATCH /api/workspace`, helper apply, sandbox-run, source refresh, resolver registration, workflow publish, and fork trace.

### L5 Presentation

The workspace emits visible state through Builder, Data Model, helper sidecar, API cockpit, workflow canvas, Workspace Lens, docs, exports, and release packages.

## Agent Operating Rules

Agents working in a governed workspace must use the same product path the user sees.

Do:

- inspect the live app and `/api/workspace` for runtime truth
- use Data Model for object and row state
- use the cockpit for API Registry setup
- use helper query/apply for helper-originated changes
- use source refresh for source-record evidence
- use workflow test/publish for executable graph changes
- use Workspace Lens for holistic readiness
- preserve docs and release snapshots for future sessions

Do not:

- invent hidden state or fake rows
- duplicate API Registry or Data Source paths
- bypass the helper apply boundary
- write credentials into workspace rows or prompts
- mutate dashboards as a side effect of source refresh
- publish workflow changes without a passing draft test
- treat UI clicks as completion without persisted evidence

## Success Criteria

A workspace is operating correctly when:

- the user can explain what the workspace owns
- Data Model objects represent business state
- dashboards present data without owning object truth
- API Registry rows can become tested Data Sources
- source refresh persists records
- helper proposals are reviewable and receipt-backed
- workflows can be saved, tested, and published safely
- Workspace Lens reflects real readiness
- future agents can resume from docs, config, traces, records, and receipts

The shortest durable definition is:

```text
The workspace owns the artifact.
The artifact carries the evidence.
The evidence drives the next action.
The next action writes back through governed paths.
```

