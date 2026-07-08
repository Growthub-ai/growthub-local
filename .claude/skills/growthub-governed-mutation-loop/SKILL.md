---
name: growthub-governed-mutation-loop
description: >
  Operate a governed Growthub workspace as an agent through the canonical
  loop — read state → reason with causal tools → dry-run preflight →
  governed hand-off through a sanctioned route → re-read. Use for ANY
  workspace-config change, sandbox/swarm execution, workflow publish, or
  helper apply inside a governed workspace or exported fork. This skill is
  how mutations happen; it never invents a third mutation path.
triggers:
  - change the workspace config
  - patch the workspace
  - run a sandbox / swarm
  - publish a workflow
  - apply helper proposals
  - governed mutation
  - preflight this change
helpers: []
subSkills:
  - name: governed-workspace-mutation
    path: ../oss-investigative-architecture/skills/governed-workspace-mutation/SKILL.md
selfEval:
  criteria:
    - Every mutation routed through one of the four governed lanes (PATCH /api/workspace on an allowlisted key, POST /api/workspace/sandbox-run, POST /api/workspace/workflow/publish, POST /api/workspace/helper/apply) — no direct file writes, no invented routes.
    - POST /api/workspace/patch/preflight (or MCP preflight_patch) ran before every PATCH, and its verdict is quoted in the work log.
    - The success envelope of each governed call was confirmed by a re-read (GET /api/workspace or the relevant intelligence route) before any dependent step.
    - Rejections (400 allowed[], 422 violations[], AppScopeViolation) were treated as navigation — the repairPlan was followed, never bypassed.
    - No secret value appeared in any patch body, prompt, receipt, or logged response.
  maxRetries: 3
---

# growthub-governed-mutation-loop

Contract docs (read before first mutation in a session):
**[`docs/OPERATING_THE_GOVERNED_UNIVERSE_V1.md`](../../../docs/OPERATING_THE_GOVERNED_UNIVERSE_V1.md)** (three-layer control plane) and
**[`docs/GOVERNED_MCP_CONSOLE_V1.md`](../../../docs/GOVERNED_MCP_CONSOLE_V1.md)** (agent console).
The runtime-verified request/response card is the sub-skill
`governed-workspace-mutation` (ships inside every exported workspace at
`skills/governed-workspace-mutation/SKILL.md`) — load it before the first call.

## The loop

```
READ → REASON → DRY-RUN → GOVERNED HAND-OFF → RE-READ
```

1. **READ** — `GET /api/workspace` (or MCP `describe_workspace` /
   `get_workspace_topology`). In `--live` MCP mode every call rehydrates;
   never act on remembered state.
2. **REASON** — use the causal tools before shaping the change:
   `simulate_causal_impact`, `find_downstream_dependencies`,
   `trace_lineage` (full recipe: `growthub-causal-impact-analysis`).
3. **DRY-RUN** — `POST /api/workspace/patch/preflight` (or MCP
   `preflight_patch`, which proxies it in `--live` and forwards
   `x-growthub-app-scope`). It uses the write path's exact merge step
   (`applyWorkspaceConfigPatch`), so it can never disagree with the real
   PATCH. A red preflight is an answer, not an obstacle.
4. **GOVERNED HAND-OFF** — emit only sanctioned routes:
   - `PATCH /api/workspace` — ONE allowlisted key per patch
     (`dashboards` | `widgetTypes` | `canvas` | `dataModel`)
   - `POST /api/workspace/sandbox-run` — all sandbox / agent-swarm
     execution (draft proofs via `useDraft: true`)
   - `POST /api/workspace/workflow/publish` — the only draft → live
     transition (server-verified `draftSha256` lineage)
   - `POST /api/workspace/helper/apply` — human-reviewed proposals only
   MCP `next_actions` emits the exact governed call; MCP itself never
   mutates.
5. **RE-READ** — confirm the success envelope, then re-read state (and the
   receipt via `growthub-outcome-receipts-bootstrap`) before any dependent
   step.

## Hard rules

- The 4-key PATCH allowlist is the permanent ceiling; unknown top-level
  keys get 400 + `allowed[]`. Policy violations get 422 + structured
  `violations[]` with `repairPlan[]` — follow the plan, never work around
  the policy (`apps/workspace/lib/workspace-patch-policy.js` is
  runtime-enforced).
- Live workflow fields (`orchestrationGraph`, `version` bumps,
  `lifecycleStatus: "live"`) are publish-owned. Never PATCH them.
- Read-modify-one-key: read the full config, modify exactly one allowlisted
  key, PATCH only that key.
- Every governed action receipts to `workspace:agent-outcomes` — including
  blocked attempts. That is a feature; do not retry blindly to "clean" the
  ledger.
- Prefer existing governed objects (scheduled jobs, api-registry rows,
  sandbox-environment rows, data views) over new code.
- Secrets are env-ref names on every surface; credential-shaped values in
  a patch body are a 422 by design.
