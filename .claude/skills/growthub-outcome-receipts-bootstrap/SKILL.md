---
name: growthub-outcome-receipts-bootstrap
description: >
  Start every governed-workspace session from the agent-outcome receipt
  ledger and self-correct from structured rejections. Use at the start of
  any session in a governed workspace or exported fork, after any 400/422/
  AppScope rejection, when resuming interrupted work, or when auditing
  what agents actually did (blocked attempts, publishes, drafts awaiting
  proof). Receipts are the workspace's memory — read them before acting.
triggers:
  - new session in this workspace
  - what happened here before
  - why was my patch rejected
  - continue where the last agent left off
  - audit agent activity
  - read the receipts
helpers: []
subSkills: []
selfEval:
  criteria:
    - GET /api/workspace/agent-outcomes was read before the first mutation of the session, and the derived governance summary (blocked attempts, publishes, drafts awaiting test/publish) was surfaced.
    - Resumed work continued from the latest relevant receipt's nextActions / rollbackRef instead of re-deriving intent from scratch.
    - Every rejection was answered by following its repairPlan[] (bounded by maxRetries), never by retrying the identical call or bypassing the lane.
    - Lane classifications (untrusted-direct, execution-proof, server-authoritative, governed-proposal) were preserved — no attempt to relabel or launder a lane.
    - No secret value was echoed from receipts; receipts are secret-redacted by contract and stay that way in the work log.
  maxRetries: 3
---

# growthub-outcome-receipts-bootstrap

Contract: **[`AGENTS.md`](../../../AGENTS.md) §"Agent Outcome Loop V1"**.
Receipt builder source (starter kit):
`apps/workspace/lib/workspace-outcome-receipts.js`. Every mutation lane —
direct PATCH, preflight rejections, sandbox runs, workflow publishes,
helper applies — emits the same canonical, secret-redacted receipt into
the `workspace:agent-outcomes` source-record stream.

## Session bootstrap (do this before acting)

1. `GET /api/workspace/agent-outcomes` (or MCP `outcome_ledger`) → the
   receipt stream PLUS the derived governance summary: blocked attempts,
   publishes, drafts awaiting test/publish, live rows without proof.
2. Read the newest receipts for the surface you are about to touch. Each
   carries `receiptId`, lane, verdict, `nextActions`, `rollbackRef`.
3. If a prior session left `nextActions`, continue from them. If it left a
   failed/blocked outcome, its `repairPlan[]` is your first step — the
   rejection already encodes the navigation.
4. Only then move to `growthub-causal-impact-analysis` (reason) and
   `growthub-governed-mutation-loop` (act).

## Rejections are navigation, not noise

- **400 + `allowed[]`** — you used a non-allowlisted top-level key. Reshape
  to one of `dashboards` | `widgetTypes` | `canvas` | `dataModel`.
- **422 + `violations[]` + `repairPlan[]`** — the mutation policy caught a
  full-config body, credential-shaped field, oversized row/node-config,
  history blob, or live-workflow field. Apply the repair plan literally;
  each violation code names its fix.
- **`AppScopeViolation` + `repairPlan[]`** — the `x-growthub-app-scope`
  header disagrees with the target rows; preflight's `appScopeVerdict`
  mirrors it, so a scoped preflight would have shown this first.
- Blocked outcomes are receipted too — that is the audit trail working.
  Never spam retries of an unchanged call; change the call per the plan,
  bounded by this skill's `maxRetries`.

## Lane classification (report honestly)

`untrusted-direct` (direct PATCH) · `execution-proof` (sandbox-run) ·
`server-authoritative` (workflow/publish) · `governed-proposal`
(helper/apply — privileged, human-reviewed). When summarizing activity for
the user, name the lane; the same edit means different trust levels on
different lanes.

## Hard rules

- Never write to the receipt stream directly; receipts are emitted by the
  lanes themselves.
- Never treat an empty ledger as "no governance" — it means a fresh
  workspace; the loop still applies.
- Receipts reflect what was true when written; re-read live state before
  acting on an old `nextActions`.
