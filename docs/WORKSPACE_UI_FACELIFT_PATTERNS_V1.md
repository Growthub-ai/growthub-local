# Workspace UI Facelift — Stabilized Patterns V1

The production patterns established by PR #254 (workspace OS UI facelift,
`@growthub/cli` 0.14.8). This is the architecture-truth record for the surgical
implementation: what each pattern is, where it lives, why it is truthful, and
the boundaries it must not cross. It is **additive** — no new runtime, no new
mutation lane, no new persistence, no new object authority.

Scope: `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace`.

---

## 1. Design-token + shared-primitive uplift (additive cascade)

**Pattern.** Polish the existing light `dm-*` surfaces by appending a single
facelift layer to `app/globals.css` — refining existing selectors via the
cascade (equal specificity, later wins) and adding a calm token set
(`--dm-line`, `--dm-hover`, `--dm-accent`, status colors, radii). **No token
renames, no parallel styling system.**

- Shared primitives keep their prop APIs so every caller is untouched:
  - `StatusPill` ({ value }) → one `dm-status-chip` with ok/bad/warn/**running**/waiting states.
  - `ToggleField` ({ checked, disabled, label, onChange, description }) → a real switch (`dm-switch-row`).
- **Rule:** every new class is used; no orphaned CSS (verified — the only
  run-timeline/canvas-chip blocks that became orphaned during iteration were
  removed).

## 2. Workspace Map — read-only projection, never a second data model

**Pattern.** `/workspace-map` (`WorkspaceDataModelCanvas.jsx`) renders the
workspace as a node canvas **derived** from `buildWorkspaceMetadataStore →
buildWorkspaceMetadataGraph`. It does **not** parse `workspaceConfig` ad hoc.

- Read-only: fetches `/api/workspace`, renders nodes/edges, navigates on click.
  No mutations, no localStorage.
- Edges are normalized **for display** to read source→object left-to-right
  (geometry anchoring + arrowheads); the graph contract is unchanged.
- Click-through uses the params the surfaces already read:
  `/data-model?object=<id>` and `/workflows?object=<id>&row=<row>&field=orchestrationConfig`.
- Zoom reserves the scaled footprint so dense maps scroll; search matches
  summary fields; selecting a node opens a read-only detail panel with an
  explicit "Open in …" CTA.

## 3. Data Model table — additive filter composition

**Pattern.** Quick-search is layered **on top of** the existing column filter
clauses in `DataModelShell` (`rowEntries` memo) — it never replaces the
field-filter model. Counts read truthfully: `X of Y records` when filtered,
explicit `0` for manual objects (zero is known) but no misleading `0` on
runtime-resolved live objects. Empty state distinguishes "No records yet" from
"No records match". No new table library, no client-side filter persistence.

## 4. General per-node orchestration run status (the correctness flagship)

The pattern that closes the live-run loop on the Workflow Canvas. It is
**general orchestration**, explicitly **not** the swarm primitive.

### Data flow (single source of truth)

```
runOrchestrationGraphIfPresent (orchestration-graph-runner.js)
  │  executes the native pipeline: input → api-registry-call → transform → tool-result
  │  emits per-stage deltas via the EXISTING onEvent hook:
  │    growthub-sandbox-run-delta-v1 / orchestration.node.{started,completed,failed,skipped}
  │  records a terminal nodeTrace[] on the run result
  ▼
sandbox-run route  ── streams the deltas as NDJSON (stream:true | accept x-ndjson)
  │                 ── buildRunResponse copies result.nodeTrace onto the saved record
  ▼
WorkflowSurface.runSandbox  ── reads the NDJSON stream (shared reader), accumulating
  │                            live deltas into liveRunEvents; persists lastResponse
  │                            (which carries nodeTrace)
  ▼
deriveOrchestrationNodeStatuses (orchestration-node-status.js)  ── pure, never throws
  │   live orchestration.node.* events take precedence  →  settled persisted nodeTrace
  ▼
OrchestrationGraphCanvas  ── per-node pill (Completed / Running / Failed / Skipped),
                             docked OUTSIDE the node top-right; click opens Run Console trace
```

### Invariants (truth, not fabrication)

- **Every pill corresponds to a real executed stage.** No pill renders without
  a real `orchestration.node.*` event or a persisted `nodeTrace` entry.
- **Terminal truth only from execution.** Downstream-of-failure nodes are
  `skipped` (never ran), not `failed`.
- **Live during the run**, settling on completion; on reopen/refresh it settles
  from the persisted `nodeTrace[]` (no live events present).
- **No second run-truth model.** Reuses the runner, the `onEvent` NDJSON stream
  (same shape `SwarmRunCockpit` consumes), and the persisted record.
- **No swarm mirroring.** Swarm graphs surface per-agent status in their own
  cockpit (`deriveSwarmRunProjection` / `deriveSwarmDeltaProjection`); these
  canvas pills are the general-orchestration signal.
- **No new config, no localStorage, no new mutation lane.** `nodeTrace` is an
  additive field on the run record (alongside `swarm` / `logTree`), written only
  by the server route.
- **Live deltas reset per workflow** so one run never bleeds onto another.

### Verified end-to-end

A direct runner invocation produced, with no network and no server:
`node-input completed → node-api failed → node-transform skipped → node-result skipped`
and the matching `nodeTrace[]`. 7 unit tests cover live precedence, failure +
skipped attribution, settle-from-trace, non-orchestration event filtering, and
malformed-input safety.

## 5. Boundaries (documented, not gaps)

- **Swarm workflows** do not show these api-pipeline pills — they have a richer
  per-agent cockpit. This is intentional separation, not a missing feature.
- **Adapter-only runs** (no native graph) produce no `nodeTrace` and render no
  canvas (no nodes) — nothing to surface.
- The canvas node `role="button"` wraps the pill `<button>`; click is isolated
  via `stopPropagation`. Interactive-in-interactive is accepted here for the
  single-purpose status affordance.

## 6. Governance & release

- Lockstep version bump 0.14.7 → 0.14.8 (`@growthub/cli` +
  `@growthub/create-growthub-local`).
- **Asset-only change** — ships from `cli/assets` via `files: ["assets"]`, read
  by `dist/index.js` at export time; `cli/src` untouched, `cli/dist` carries no
  kit copy → **no dist rebuild required**.
- Gates green: `freeze-check`, `version-sync`, `check-worker-kits`,
  `release-check`, `check-monorepo-boundary`; `export-seed-workspace` validates
  activation 5/5, cockpit 100.

## 7. Verification checklist (production bar)

- [x] No new runtime / mutation lane / persistence / object authority.
- [x] Pills render only from real execution signal; downstream-of-failure = skipped.
- [x] Live hydration during the run; settle on completion and on reopen.
- [x] Pill opens the Run Console trace (raw stdout/stderr/JSON/log tree preserved).
- [x] Single run-truth source; no swarm mirroring; no duplicate code.
- [x] All touched files parse; unit tests pass; export validates 5/5; gates green.
- [x] Super-admin interactive smoke passed on the booted feature workspace:
      Workflow Canvas run, real per-node pills, settled trace, Run Console raw
      proof, Workspace Map navigation/drag/connectors, and Data Model table
      search/filter behavior.

See also: [`AGENTIC_PRODUCT_PR_REVIEW_LOOP.md`](./AGENTIC_PRODUCT_PR_REVIEW_LOOP.md),
[`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md),
[`MONOREPO_PROVENANCE_MAP_V1.md`](./MONOREPO_PROVENANCE_MAP_V1.md).
