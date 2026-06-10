# Workspace New Reality Value Map V1

Official value map for the governed creation release.

This document explains what the v0.14 governed creation line unlocks for enterprise users, existing workspaces, and new users. It maps the new product reality to practical use cases and operating outcomes for Agentic Workspace as Code (AWaC).

Read with:

- [`docs/AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md`](./AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md)
- [`docs/GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md)
- [`docs/GOVERNED_CREATION_SPRINT_RETROSPECTIVE_V1.md`](./GOVERNED_CREATION_SPRINT_RETROSPECTIVE_V1.md)
- [`docs/GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md`](./GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md)
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md)
- [`docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`](./CAUSATION_ITT_ELIGIBILITY_DRIVERS.md)

## The New Reality

Growthub Local now has a complete governed creation loop:

```text
API Registry
  -> server-side test
  -> response profile
  -> optional helper resolver
  -> governed Data Source
  -> source-record refresh
  -> sandbox automation
  -> workflow persistence path
  -> Workspace Lens readiness
```

The release changes Growthub from a workspace with powerful primitives into a workspace that can guide a user through turning real external systems into governed data, governed automations, and evidence-backed readiness.

The high-level value is:

- Enterprise users get a safer way to bring APIs, data, workflows, and agents into an owned workspace artifact.
- Existing workspaces get upgradeable primitives they can pull into their current business objects, dashboards, and workflows.
- New users get more complete first-run paths with concrete use cases instead of abstract setup.
- Future agents get clearer docs, runtime evidence, and operating rules for continuing work without guessing.

## Unified Release Reality

The current product reality combines two recent release layers:

- `0.13.9` established Codex Sites as a governed workspace primitive. Real hosted site bindings are represented as Data Model rows, Builder Site items, and Workspace Settings state without storing private account data in the starter template.
- `0.14.0` added the governed creation cockpit. API Registry rows now have an evidence-backed path through server-side test, response profiling, resolver recommendation, Data Source creation, source-record refresh, workflow persistence readiness, and Workspace Lens readback.
- `0.14.1` adds the governed agent swarm cockpit. Helper-created swarm workflow rows now inherit the active helper execution target, open thread-bounded Background Tasks cockpits, execute through the same `sandbox-run` route, persist truthful subagent telemetry, and link canvas node delta tags back to the owning sandbox record.

Together they define the operating pattern for the platform: every useful external capability should enter as governed workspace state, become visible in the browser, leave receipts, and stay agent-readable.

Hosted account authority is C-tier in this model. It can add account-backed integrations, managed execution, or hosted agent binding later, but it is not the operating center of the workspace. The first-class loop remains local workspace state, browser evidence, helper proposals, source records, workflows, and Workspace Lens.

## Growthub Browser Agent Protocol

The Growthub Browser protocol is the agnostic agent-facing package for operating this reality. It is not tied to one private workspace, one provider, or one browser vendor. It is the rule that agents must prove workspace behavior on the same surface humans use, then corroborate that proof through the workspace artifact.

Agent proof order:

```text
in-app browser
  -> visible CUA action
  -> DOM readback
  -> workspace API or persistence corroboration
  -> concise human-facing summary
```

For Codex-hosted sessions, the preferred path is the Codex in-app browser backend (`iab`) through `browser-client.mjs`, with CUA as the live cursor/action layer and read-only Playwright DOM as the readback layer.

The browser protocol is production-grade when it proves:

- the current URL and visible route;
- the exact workspace surface being operated;
- the live action layer used;
- the DOM or snapshot readback after the action;
- the persistence or deployment source of truth when state changes;
- no leaked env values, cookies, bearer tokens, or provider secrets.

This makes browser QA part of the agent contract rather than an after-the-fact screenshot.

## Enterprise User Wins

### 1. Governed API Onboarding

Enterprise teams often have many internal tools, SaaS systems, partner APIs, reporting endpoints, and operational data feeds. The new API Registry cockpit gives those teams a governed path for onboarding those systems.

Instead of creating one-off scripts or undocumented integrations, the user can:

- register an API row
- keep auth as a reference instead of copying secrets
- test the API server-side
- profile the response shape
- create a governed Data Source
- refresh source records
- keep the evidence inside the workspace

This matters for enterprise adoption because the integration path is reviewable and repeatable. The workspace owns the integration evidence without turning the browser into an authority surface.

### 2. Safer Agent-Assisted Work

The helper is now useful inside production-like workflows because it remains propose-first and apply-second.

Enterprise teams can use the helper to draft dashboards, objects, API setup, resolver proposals, and repairs while still requiring explicit review before mutation. Accepted changes create receipts. Credentials are stripped from prompt context. Mutations stay inside governed apply paths.

This makes agentic work safer because the helper becomes a controlled planning surface, not an unbounded editor.

### 3. Source Records As Operational Evidence

Source records are now a central proof layer. A Data Source refresh pulls real records into the workspace sidecar, and those records can drive readiness, dashboards, workflows, and future agent decisions.

Enterprise teams need this because evidence-backed operations are easier to audit than chat claims or UI-only state. If a source refreshed, the workspace can show the record count and persisted rows. If it did not refresh, the workspace can keep the cockpit open and expose the next action.

### 4. Workflow Upgrade From Local To Persistent

Enterprise workflows usually start as local experiments but need a path to persistent scheduled execution. The workflow persistence cockpit makes that path explicit.

The user can see:

- whether the workflow runs locally or through a serverless-style scheduler path
- which adapter owns execution
- whether a scheduler registry link exists
- whether auth and persistence are ready
- whether the workflow has been tested and can be published

This lowers the risk of moving from prototype automation to durable operational automation.

### 5. Workspace Lens As Executive Readiness

Workspace Lens becomes the cross-workspace control surface for readiness and handoff. It can summarize setup, source evidence, helper readiness, workflow state, and activation status from the same workspace artifact.

For enterprise users, this becomes the way to answer:

- what is configured?
- what has real evidence?
- what can the helper safely do?
- what workflows are ready?
- what is blocked?
- what should happen next?

That is the difference between a workspace that stores configuration and a workspace that can explain operational readiness.

### 6. Agent-First Browser Operations

Enterprise teams need agents that can inspect and operate the same surface humans see. The Growthub Browser protocol turns browser use into a governed QA primitive:

- attach to the current in-app browser session;
- move the visible cursor with CUA when proof matters;
- read the visible DOM before and after the action;
- corroborate writes through the workspace API, source records, or configured persistence;
- keep secrets out of screenshots, prompts, docs, and logs.

This keeps agents aligned with the workspace artifact instead of letting them drift into static-file guesses or disconnected endpoint checks.

## Existing Workspace Upgrade Map

Existing workspaces can pull this release into their current state without changing the whole mental model.

### Existing Data Model Objects

Existing objects remain the business-state layer. The upgrade adds stronger ways to feed and operate those objects:

- API Registry rows can become Data Sources.
- Data Sources can refresh source records.
- helper proposals can create or repair object bindings.
- workflows can act on governed objects through data-action nodes.

The object stays the durable business concept. The release adds better ingestion, automation, and helper support around it.

### Existing Dashboards

Dashboards remain presentation. They do not become the source of truth.

Existing dashboards can benefit from:

- Data Sources created from tested APIs
- refreshed source records
- cleaner helper-generated widget proposals
- better table and chart inputs from governed objects
- Workspace Lens readiness signals

The key upgrade is that dashboards can be fed by better governed data without rewriting dashboard layout from scratch.

### Existing API Registry Work

Existing API rows gain a stronger lifecycle:

```text
row exists -> test -> shape -> Data Source -> refresh -> automate -> complete
```

Rows that were previously just configuration can now become operational data sources. The cockpit should keep showing only the missing next action until the row has evidence.

### Existing Workflows

Existing workflow rows gain a clearer upgrade path:

- continue local execution when local is enough
- save draft graph changes safely
- test through the sandbox-run route
- publish only after the exact draft passes
- use the persistence cockpit to identify what is required for scheduled execution

This makes old workflow work safer, not obsolete.

### Existing Helper Usage

Existing helper flows gain stronger output quality and stricter application boundaries. The helper can be used as a normal workspace assistant, but now it is also connected to concrete creation flows like API resolver proposals.

Existing teams should treat helper receipts as workspace evidence, not casual chat history.

## New User Use Case Map

### Founder Or Operator Building A Custom Ops Workspace

Start with the workspace starter. Create business objects like Customers, Projects, Tasks, Deals, or Campaigns. Use Builder to create dashboards. Register APIs for the systems the business already uses. Refresh records. Use workflows for repeatable actions.

New value:

- no-code business object modeling
- API-backed data ingestion
- helper-assisted setup
- local workflow automation
- clear readiness through Workspace Lens

### Agency Building Client Workspaces

Create one governed workspace per client or engagement. Use Data Model for client projects, deliverables, approvals, content, and reporting. Register client-specific APIs. Use dashboards for status. Use workflows for approval routing, report refreshes, and task updates.

New value:

- repeatable workspace artifact per client
- source-record evidence for reporting
- helper-assisted customization
- workflow safety before publish
- exportable/forkable workspace state

### Internal Tooling Team

Use Growthub as a local-first internal tool builder. Create objects for operational data, APIs for source systems, dashboards for monitoring, and workflows for automation. Use the cockpit to avoid raw integration drift.

New value:

- controlled API onboarding
- owned config and runtime artifacts
- local-to-persistent workflow path
- no browser-held secrets
- agent-readable docs and traces

### Sales, CRM, Or RevOps Workspace

Create Accounts, Contacts, Opportunities, Activities, and Follow-ups. Bring in external CRM or enrichment APIs through API Registry. Refresh source records. Build dashboards for pipeline and activity. Use workflows for follow-up, enrichment, or task creation.

New value:

- real source ingestion
- governed data objects
- dashboard presentation
- helper proposal support
- workflow automation over business records

### Support Or Customer Success Workspace

Create Tickets, Customers, Incidents, SLAs, and Notes. Register support-system APIs. Refresh ticket or customer records. Build triage dashboards. Use workflows for escalation, assignment, and response drafting.

New value:

- API-backed ticket/customer records
- visible source freshness
- safe workflow draft/test/publish
- Workspace Lens readiness for handoff

### Research Or Analyst Workspace

Create Sources, Findings, Reports, Evidence, and Tasks. Register APIs for search, databases, or internal knowledge endpoints. Refresh source records. Use helper proposals for synthesis and dashboard organization. Use workflows to normalize, filter, and summarize records.

New value:

- traceable evidence layer
- repeatable source refresh
- agent-friendly workspace memory
- governed outputs instead of unstructured notes

### Automation And Agent Operations Workspace

Create sandbox environment rows for tools, agents, and workflows. Register APIs that agents can call. Use workflows to chain API calls, transforms, data actions, and human input. Use Workspace Lens to see what is ready for handoff.

New value:

- governed tool creation
- API-backed sandbox automation
- local-to-scheduled upgrade lane
- helper proposals with receipts
- agent and human operators sharing the same workspace state

## Agent-First Workspace Examples

These examples are intentionally agent-first and human-second. Agents should collect stricter evidence; humans should receive the simplest summary of what is connected, incomplete, applied, and proven.

### Workspace Home And Builder

Agent evidence:

- current browser URL and title;
- Builder counts for dashboards, sites, and workflows;
- visible row titles, types, last update, and status labels;
- cursor movement proof when the user needs to see the agent is on the live surface.

Human summary:

```text
The workspace is open, authenticated, and showing the current Builder inventory.
```

### Governed Creation Cockpit

Agent evidence:

- activation banner and completed/pending/blocked steps;
- last test status and response-shape notes;
- resolver requirement;
- Data Source wiring;
- source-record refresh result after creation.

Human summary:

```text
The record is partially wired or complete, and the next earned action is visible in the cockpit.
```

### Helper Sidecar

Agent evidence:

- selected helper intent;
- proposal cards and selected count;
- explicit apply result;
- helper receipt and persisted workspace state.

Human summary:

```text
The helper proposed scoped changes, they were reviewed, applied, and verified.
```

### Workflow Builder

Agent evidence:

- lifecycle status, version, node count, edge count, and latest run state;
- Test action result;
- stdout or run evidence containing real rows rather than placeholders;
- draft/publish state after the exact saved draft is tested.

Human summary:

```text
The workflow is draft or live as shown, and the latest run proves whether it is safe to publish or scale.
```

### Dashboard Readiness

Agent evidence:

- visible widgets, gauges, table rows, timestamps, and statuses;
- widget source objects through workspace API or persistence;
- mismatch report if UI and source records disagree.

Human summary:

```text
The dashboard is a live operating cue backed by governed source objects.
```

### Production Smoke

Agent evidence:

- deployment source-of-truth status;
- browser-rendered production route;
- login/access behavior without exposing credentials;
- API/session status only when the endpoint is part of the contract.

Human summary:

```text
Production is reachable, gated correctly, and rendering the expected workspace surface.
```

## Product Impact Map

| Area | Before | New reality |
| --- | --- | --- |
| API setup | Manual row/config work | Guided cockpit with evidence-driven steps |
| API data | Hard to prove readiness | Data Source plus source-record refresh |
| Resolver work | Manual or rebuild-prone | Helper-proposed, runtime-loadable resolver lane |
| Helper | Chat/planning surface | Reviewable proposal and apply surface |
| Workflows | Local draft execution | Draft/test/publish plus persistence upgrade path |
| Agent swarms | Chat-only orchestration idea | Governed sandbox workflow row with cockpit, canvas trace, and source-record history |
| Onboarding | Setup checklist | Checklist grounded in real workflow and workspace evidence |
| Workspace Lens | Readiness surface | Holistic cockpit for state, evidence, and handoff |
| Browser agent QA | Manual screenshot or static-code claim | CUA action, DOM readback, and persistence corroboration |
| Existing workspaces | Static primitives | Upgradeable data, helper, workflow, and readiness paths |
| New users | Abstract workspace setup | Concrete use cases with guided creation loops |

## Operating Guidance For Future Releases

Future features should preserve this new reality:

1. New data paths should become governed objects or source records.
2. New helper capabilities should remain propose-first and apply-second.
3. New workflow capabilities should preserve draft/test/publish safety.
4. New readiness UI should derive from workspace evidence.
5. New enterprise functionality should strengthen the artifact, not bypass it.
6. New browser-agent patterns should be promoted only after live browser proof, state corroboration, and no-leak review.

The durable product claim is:

```text
Growthub Local lets teams create owned, agent-readable workspaces where APIs,
data, workflows, helper actions, and readiness evidence live together as one
governed artifact.
```

## Success Definition

This release is high-impact when:

- enterprise users can onboard real APIs without losing governance
- existing workspaces can pull in Data Source refresh and workflow upgrade paths
- new users can understand multiple concrete starting points
- agents can resume from docs and evidence without inventing state
- the workspace can explain what is ready, what is blocked, and what action is next
