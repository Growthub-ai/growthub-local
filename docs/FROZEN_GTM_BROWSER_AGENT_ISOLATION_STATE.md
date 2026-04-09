# Frozen Knowledge Snapshot — GTM Browser Agent Isolation

> Canonical source of truth for the browser-agent isolation work completed on `feat/paperclip-issue-stdin-context`.
> Frozen at: 2026-04-08
> Validation state: locally validated end to end on the GTM runtime at `http://127.0.0.1:5173/gtm/GHA/...`
> Published next:
> `@growthub/cli@0.3.33`
> `create-growthub-local@0.1.35`

---

## Agent / operator control plane (mandatory context)

- **Canonical source dev:** `scripts/runtime-control.sh` — `up-main`, `up-branch <name>`, `up-pr <n>`, `stop`, `status`, `url`
- **Canonical observability:** `scripts/observability/watch-agents.sh` and `scripts/observability/tail-run.sh`
- **Canonical dispatch path for browser agents:** issue assignment → heartbeat wakeup → issue-bound run context
- **Anti-pattern:** do not validate browser agents through bare GTM free-run invoke with no issue binding

---

## 1. Snapshot intent

This snapshot records the validated runtime pattern for concurrent GTM browser agents on the same machine.

This is not a speculative plan.
This is not a future architecture note.
This is the frozen implementation and validation state for how browser agents are supposed to run now.

---

## 2. What was wrong before

Two separate failure modes existed in the earlier branch state:

1. Browser isolation was treated as prompt-only guidance instead of a runtime contract.
2. GTM browser launches could be triggered through a manual invoke path without real issue context.

That combination allowed:

- behavior drift between agents
- agents picking up the wrong task shape
- ambiguous browser ownership despite separate labels

---

## 3. Correct runtime contract

### 3.1 Browser agents are issue-bound

For GTM browser agents, the authoritative dispatch path is:

1. create or update a real issue
2. assign it to the target browser agent
3. let heartbeat wake the assignee on `issue_assigned`

The GTM invoke route now resolves Chrome launches to an assigned runnable issue instead of allowing a free-run browser session.

File:

- `server/src/routes/gtm.ts`

### 3.2 Browser separation is injected at runtime

Heartbeat injects `paperclipBrowserIsolation` into the run context for Chrome-enabled Claude agents.

That context includes:

- `browserSlot`
- `tabGroupKey`
- `tabGroupLabel`
- `crossAgentTabPolicy`
- runtime ownership rules

The important runtime default that now ships:

- **Start browser work in your own separate browser context by default.**

Files:

- `server/src/services/heartbeat.ts`
- `packages/adapters/claude-local/src/server/execute.ts`

### 3.3 Slot identity remains per agent

Chrome lease tracking remains slot-aware, so concurrent browser agents can hold different slots simultaneously on the same machine.

Files:

- `server/src/services/chrome-lease.ts`
- `server/src/services/gtm-agent-lifecycle.ts`

---

## 4. Observability validation

### 4.1 Exact validated runs

Fresh real validation issues:

- `GHA-91` — Lead Hunter Sales Navigator prospecting
- `GHA-90` — LinkedIn SDR India 1st-degree sweep

Validated runs:

- Lead Hunter: `af14e196-53ab-4c22-9864-be63734e56df`
- LinkedIn SDR: `aa4a6d7a-f9e2-4192-bf46-daeed509c607`

### 4.2 Heartbeat state

Both runs were created by the issue-assignment path:

- `invocationSource: "assignment"`
- `triggerDetail: "system"`
- correct `issueId` in `contextSnapshot`
- correct `paperclipIssue`
- correct `paperclipBrowserIsolation`

### 4.3 Active browser leases

Observed simultaneously in `workspace-config.activeChromeLeases`:

- `lead-hunter-sales-nav`
- `linkedin-agent-connections`

### 4.4 Behavioral proof from observability

Observed via `tail-run.sh`:

- Lead Hunter opened Sales Navigator and worked the prospecting flow
- LinkedIn SDR stayed on LinkedIn connections / India 1st-degree filtering and sweep work

This proves:

1. the runs were not drifting into each other's issue context
2. the runtime was carrying distinct browser ownership identities
3. both browser workstreams could run concurrently

### 4.5 Observability hardening

During validation, `watch-agents.sh` failed on compressed/non-UTF8 logs and missed UTC-dated same-session runs.

That script was hardened to:

- read gzip-compressed log files
- decode invalid UTF-8 safely
- tolerate malformed lines
- include both local-day and UTC-day prefixes for `--today`

File:

- `scripts/observability/watch-agents.sh`

---

## 5. Files changed for this capability

- `server/src/routes/gtm.ts`
- `server/src/services/heartbeat.ts`
- `server/src/services/chrome-lease.ts`
- `server/src/services/gtm-agent-lifecycle.ts`
- `packages/adapters/claude-local/src/server/execute.ts`
- `scripts/observability/watch-agents.sh`
- `ui/src/api/gtm.ts`
- `ui/src/gtm/App.tsx`
- `ui/src/gtm/components/GtmAgentsKanbanView.tsx`
- `ui/src/gtm/components/GtmAgentsListView.tsx`
- `ui/src/gtm/components/GtmAgentsTableView.tsx`
- `server/src/__tests__/chrome-lease.test.ts`

---

## 6. Public contract

If you need two GTM browser agents to run safely on one machine:

1. create real issues
2. assign each issue to the correct browser agent
3. let heartbeat launch the runs
4. validate with `tail-run.sh` on the exact run ids and `workspace-config.activeChromeLeases`

Do not treat issue descriptions as the primary browser-isolation mechanism.
The issue describes the work.
The runtime carries the browser separation contract.

---

## 7. Release scope

This change affects published local runtime behavior and installer expectations.

Version alignment for release:

- `@growthub/cli` → `0.3.33`
- `create-growthub-local` → `0.1.35`
- installer pin `@growthub/cli` → `0.3.33`
