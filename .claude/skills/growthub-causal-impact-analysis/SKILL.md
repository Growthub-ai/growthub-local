---
name: growthub-causal-impact-analysis
description: >
  Derive what a workspace change would actually affect BEFORE proposing it —
  blast radius, downstream dependencies, lineage, stale surfaces, workflow
  impact, app readiness, and patch impact — using the workspace metadata
  graph and the pure derivers. Use when asked "what breaks if I change
  this", before any PATCH/publish/remove, when triaging a broken widget or
  workflow, or when assessing whether an app surface is ship-ready.
triggers:
  - what breaks if I change this
  - blast radius
  - downstream dependencies
  - trace lineage
  - simulate impact
  - is this app ready to ship
  - stale surfaces
helpers: []
subSkills: []
selfEval:
  criteria:
    - Impact claims come from the derivers / MCP tools over the live metadata graph, never from guessing at config JSON by eye.
    - Every removal or rename ran derivePatchImpact (or MCP preflight_patch) and the remove-impact set is quoted before the change is proposed.
    - The analysis names concrete downstream node ids (widgets, dashboards, workflows, runs), not vague categories.
    - Read-only throughout — this skill performs zero mutations; the governed hand-off belongs to growthub-governed-mutation-loop.
    - Verdicts distinguish direct dependents (single hop) from transitive closure (full blast radius).
  maxRetries: 3
---

# growthub-causal-impact-analysis

Concept doc: **[`docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`](../../../docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md)** —
high-entropy workspace state → deterministic, read-only derivation →
low-entropy actionable guidance. The Intelligence layer contract is
[`docs/GOVERNED_MCP_CONSOLE_V1.md`](../../../docs/GOVERNED_MCP_CONSOLE_V1.md).

## Surfaces (pick the highest-authority one available)

1. **MCP console** — `growthub serve --mcp [--live <url>]`:
   `get_workspace_topology`, `describe_node`,
   `find_downstream_dependencies` (blast radius),
   `simulate_causal_impact` (stale surfaces + workflow impact),
   `trace_lineage` (direction: dependents | dependencies | both |
   ancestors | descendants), `app_readiness`. All read-only; `--live`
   rehydrates per call.
2. **Runtime route** — `GET /api/workspace/metadata-graph` (typed
   node/edge world model; also rendered by the Workspace Map).
3. **Pure derivers** (CLI bridge: `cli/src/runtime/workspace-derivations.ts`;
   source in the starter kit `apps/workspace/lib/`):
   `deriveBlastRadius` (`workspace-metadata-impact.js`),
   `deriveStaleSurfaces` (`workspace-stale-surfaces.js`),
   `deriveWorkflowImpact` (`workspace-workflow-impact.js`),
   `deriveProvenanceLineage` (`workspace-provenance-lineage.js`),
   `deriveAppReadiness` (`workspace-app-readiness.js`),
   `deriveContractCompliance` (`workspace-contract-compliance.js`),
   `derivePatchImpact` (`workspace-patch-impact.js` — the ONE shared
   add/modify/**remove** impact model used by the preflight route,
   `growthub patch`, and MCP alike).

## Recipe

1. Resolve the node id for the thing being changed
   (`get_workspace_topology` or `describe_node`).
2. Single-hop first: who directly depends on it (`findDependents`)?
3. Full closure: `find_downstream_dependencies` / `deriveBlastRadius` —
   this is the transitive reverse-dependency closure, the honest answer to
   "what breaks".
4. For edits: `simulate_causal_impact` → stale surfaces + workflow impact.
   For removals/renames: `derivePatchImpact` on the current-vs-merged pair —
   removal impact is the category agents most often skip.
5. For ship/no-ship questions: `app_readiness` → `{ready, blocking[],
   nextAction}`.
6. Attach the verdict to the proposal, then hand off to
   `growthub-governed-mutation-loop` (preflight will recompute the same
   impact server-side — the two must agree, since both use
   `derivePatchImpact`).

## Hard rules

- Derivers are pure: no fetch, no React, no mutation, never throw, secrets
  redacted. If a "deriver" you are about to write needs I/O, it is not a
  deriver.
- Validate against a live boot (`node scripts/export-seed-workspace.mjs`),
  not hand-built fixtures.
- This skill never mutates; if the user asks to apply the change, switch
  skills — do not shortcut.
