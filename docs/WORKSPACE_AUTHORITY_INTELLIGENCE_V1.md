# Workspace Authority Intelligence V1

**Status:** shipped (converges the former PR #250 *Workspace Health + Agent
Context* and PR #251 *Governance Causation Cockpit* into one primitive).

Workspace Authority Intelligence V1 unifies **workspace health**, the **agent
context packet**, and **governance causation** as a single read-only operator
intelligence layer over the existing workspace config, source records, metadata
graph, and agent-outcome receipts. It answers one operator question:

> Is this workspace safe, healthy, understandable, and governed enough for
> agents to act?

It is a **derived read model**, never authority. It adds no mutation lane, no
PATCH allowlist field, no new object type, no persistence file, no new runtime,
and no new visual grammar.

## Why one primitive, not two releases

The two prior efforts were partial expressions of the same feature:

- **Health + Agent Context** built real state intelligence (stale widgets,
  missing/empty sources, dangling references, pipeline health, capabilities,
  entrypoints) — but its panel was never mounted, so it never closed the
  operator loop.
- **Governance Causation** built a disciplined cockpit, but it only saw receipt
  causation (route-shopping) — not health, context, or broader readiness.

Separately, each was incomplete. Converged, they are one read layer and one
cockpit.

## Architecture

```
growthub.config.json
growthub.source-records.json
workspace metadata store  ─┐
workspace metadata graph   │
agent-outcomes receipts   ─┘
        ↓  (pure derivation — no fetch / fs / mutation)
lib/workspace-health.js            → deriveWorkspaceHealth, deriveAgentContextPacket
lib/governance-causation-console.js → deriveGovernanceCausation (route-shopping)
lib/workspace-authority-intelligence.js → deriveWorkspaceAuthorityIntelligence
        ↓
GET /api/workspace/health           (machine-readable health read model)
GET /api/workspace/agent-context    (machine-readable agent context packet)
GET /api/workspace/agent-outcomes   (existing receipt stream — reused)
        ↓
WorkspaceAuthorityCockpit.jsx       (one operator surface)
  · /governance slash command  → activeView "authority"
  · CEO cockpit › Authority tab → same component
        ↓
Health · Agent Context · Governance Causation · one "Needs your attention"
        ↓
Open an EXISTING fix surface:
  /data-model · / (builder) · /workflows · swarm-run detail
```

### Pure derivers (source of truth logic)

| Module | Exports | Reads | Emits |
| --- | --- | --- | --- |
| `lib/workspace-health.js` | `deriveWorkspaceHealth`, `deriveAgentContextPacket`, `deriveCapabilities` | metadata store + graph | health summary (`status`/`issues`/`metrics`), agent context packet |
| `lib/governance-causation-console.js` | `deriveRouteShoppingSignals`, `deriveGovernanceCausation` | `workspace:agent-outcomes` receipts | route-shopping signals, governance status |
| `lib/workspace-authority-intelligence.js` | `deriveWorkspaceAuthorityIntelligence`, `deriveAuthorityStatus`, `deriveAuthorityNextActions` | the above derivers | the canonical combined packet |

The combiner returns:

```js
{
  kind: "growthub-workspace-authority-intelligence-v1",
  version: 1,
  status: "clear" | "watch" | "attention",
  health,        // deriveWorkspaceHealth(...)
  agentContext,  // deriveAgentContextPacket(...)
  governance,    // deriveGovernanceCausation(...)
  summary,       // compact rollup
  nextActions,   // normalized, prioritized action model
  generatedFrom: { metadataGraph, receipts, sourceRecords }
}
```

**Status rollup:**

- `health.status === "unhealthy"` OR `governance.status === "alert"` → `attention`
- `health.status === "degraded"` OR `governance.status === "watch"` → `watch`
- otherwise → `clear`

**Next-action priority** (one model across both lanes — `{ id, source,
severity, priority, label, reason, artifact }`):

1. High-severity governance signal (route-shop) — outranks everything.
2. Health error.
3. Medium / low governance signal (watch).
4. Health warning.

Every `artifact.surface` is one of the EXISTING surfaces only —
`data-model`, `builder`, `workflow-canvas`, `swarm-run`, `source-refresh`.

### Read models (machine-readable access)

`GET /api/workspace/health` and `GET /api/workspace/agent-context` are GET-only,
secret-free, never-throwing projections (the same shape and invariants as
`GET /api/workspace/metadata-graph`). They exist for agents and external
consumers. The cockpit reuses them plus the existing
`GET /api/workspace/agent-outcomes`; it never re-implements derivation.

### Cockpit (operator experience)

`WorkspaceAuthorityCockpit.jsx` is the single product surface. It is reachable
two ways, both rendering the same component over the same model:

- the **`/governance`** slash command (`mutates: false`, `view: "authority"`), and
- the **CEO cockpit › Authority tab** (alongside History and Agent Teams).

It is read-only: every "Open" hands off to an existing surface (a route-shop
signal opens the swarm-run detail; a health issue navigates to Data Model /
Builder / Workflows). It renders every state explicitly — loading, error +
retry, empty activity, clear, watch, attention — and never displays a false
"healthy" when a read failed or warnings exist.

## Authority boundaries

| Artifact | Authority |
| --- | --- |
| `growthub.config.json` | workspace config authority |
| `growthub.source-records.json` | source-record sidecar authority |
| metadata store / graph | derived topology |
| `workspace:agent-outcomes` | receipt / proof stream |
| `helper/apply` | reviewed mutation authority |
| `sandbox-run` | execution authority |
| workflow canvas | graph authority |
| **CEO / Authority cockpit** | **operator read/action lens (this primitive)** |

## Tests

- `scripts/unit-workspace-health.test.mjs` — health + agent-context derivation.
- `scripts/unit-governance-causation-console.test.mjs` — route-shopping detection.
- `scripts/unit-workspace-authority-intelligence.test.mjs` — combined status,
  next-action priority, purity, never-throw, no-secret, existing-surfaces-only.
- `scripts/unit-helper-command-registry.test.mjs` — `/governance` is read-only
  and aliases the authority view.
- `cli/src/__tests__/kit-custom-workspace-starter.test.ts` — file presence,
  frozen paths, GET-only routes, one cockpit (no orphan panels).
