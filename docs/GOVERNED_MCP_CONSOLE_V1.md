# Governed MCP Console V1 — the agent-facing operating console for the universe

> **Canonical source of truth for how the MCP server (`growthub serve --mcp`) is
> meant to be used.** Every other doc that mentions MCP points here. Runtime route
> files and the in-workspace SKILL card win over this doc on exact shapes
> (`AGENTS.md` source-of-truth order); this doc owns the *pattern*.

## The one-line principle

**MCP is the agent-facing operating console *over* the governed universe — not a
separate feature, not a new backend, and not a mutation tool.**

It lets an agent **understand the workspace, simulate impact, check readiness,
dry-run against Law, and then hand off the exact governed mutation call** — while
the actual change still happens through the existing universe routes. That is the
correct tandem: the universe owns reality; MCP exposes understanding of it.

## The real operating loop

```
read → reason → dry-run → governed mutate → re-read → continue
```

1. **Read the universe.** `describe_workspace`, `get_workspace_topology`,
   `list_data_model`, `list_dashboards`, `list_workflows`, `list_integrations`,
   `outcome_ledger` → the real map: objects, fields, widgets, dashboards,
   workflows, integrations, sandboxes, source records, runs, artifacts,
   provenance, graph nodes + edges.
2. **Reason over dependencies.** Before touching anything: *what depends on this?
   what dashboards/widgets use it? what workflows read/write it? what backs it?
   what goes stale if it changes?* → `describe_node`,
   `find_downstream_dependencies`, `simulate_causal_impact`, `trace_lineage`.
3. **Dry-run the intended change.** `preflight_patch` tests the exact patch body
   before anything lands. In `--live` mode it **proxies the authoritative runtime
   preflight route, forwards `appScope`, and never writes** — it asks the real Law
   layer "would this pass, and what would it affect?" (incl. removals).
4. **Mutate only through the governed universe.** MCP never applies the change.
   `next_actions` emits the sanctioned path — `PATCH /api/workspace`,
   `sandbox-run`, `workflow/publish`, or `helper/apply`. **There is no third
   mutation path.**
5. **Re-read after the governed change lands.** In `--live` mode MCP rehydrates
   live state **per tool call**, so the agent reads the new truth, never a stale
   startup snapshot. That closes the loop.

## MCP as a universal reasoning layer over existing primitives

| Universe area | MCP use |
| --- | --- |
| Workspace identity | Orient with `describe_workspace` |
| Data model | Business objects, fields, row counts, live-backed status (`list_data_model`) |
| Dashboards / widgets | Customer-visible surfaces + bindings (`list_dashboards`) |
| Workflows | Automations, lifecycle, read/write object links (`list_workflows`) |
| Integrations / source records | Live-backed data + freshness (`list_integrations`) |
| Sandboxes | Auth/readiness status **without exposing secrets** (`list_integrations`, `app_readiness`) |
| Runs / artifacts / provenance | What happened + what proof exists (`outcome_ledger`) |
| Graph topology | Traverse dependencies across the full workspace (`get_workspace_topology`, `describe_node`, `find_downstream_dependencies`, `trace_lineage`) |
| Patch / preflight | Dry-run a change before it lands (`preflight_patch`) |
| App readiness | "Is this shippable?" without a manual checklist (`app_readiness`) |
| Next actions | Convert intelligence into governed route calls (`next_actions`) |

MCP is **not** the universe; it is the **agent-readable control surface over it.**

## Tool inventory (14 tools, by control-plane layer)

- **Layer 3 — Intelligence (read-only, no side effects):** `describe_workspace`,
  `get_workspace_topology`, `list_data_model`, `list_dashboards`,
  `list_workflows`, `list_integrations`, `outcome_ledger`, `describe_node`,
  `find_downstream_dependencies`, `simulate_causal_impact`, `trace_lineage`,
  `app_readiness`.
- **Layer 2 — Law (dry-run only):** `preflight_patch`.
- **Layer 1 — Mutation (hand-off only, never executes):** `next_actions`.

## Correct real-world use cases

1. **Before deleting or editing a business object** — "show me what depends on
   `customers`", then "dry-run deleting `customers`." MCP returns downstream
   widgets/dashboards/workflows/kits, stale surfaces, and **removal warnings**.
   The deletion still goes through governed `PATCH`. → no silent breakage.
2. **Before shipping a workspace/app** — `app_readiness` returns blockers + next
   actions (stale source, missing auth, draft workflow) without unsafe power.
3. **During feature development** — "what does this touch / what will break /
   what proof exists / what route performs the change?" then `next_actions` for
   the governed hand-off.
4. **During customer support** — "why is this dashboard broken / what backs this
   chart / what last produced this artifact / what is stale?" MCP becomes the
   read-only debug interface over the workspace graph.
5. **During autonomous agent work** — Codex / Claude Code operate safely because
   MCP gives **context + simulation, not direct power**. They inspect, reason,
   and preflight; they cannot secretly mutate.

## What MCP must NOT become

- a second backend
- a direct write API
- a hidden mutation lane
- a connector-discovery layer before that is actually built
- a secret/token interface
- a fake "agent can do everything" abstraction
- a random tool list detached from workspace topology

The shipped server stays on the correct side: **read + dry-run + governed
hand-off; Mutation = none; source-only Phase A.**

## The simplest internal rule

Use MCP whenever the agent needs to answer:

> *"What exists, what depends on what, what would break, is it ready, and what
> governed call should happen next?"*

Do **not** use MCP when the agent needs to actually change reality — that belongs
to the existing universe routes.

## Final framing

```
Universe owns reality.
Law validates change.
Graph explains impact.
MCP exposes understanding.
Governed routes perform mutation.
```

## Landed spec ↔ framing alignment (this feature release, 0.14.10)

Every code change maps to a role in the loop; nothing introduces a new
mutation/persistence/backend path.

| Landed artifact | Loop role | Confirms framing |
| --- | --- | --- |
| `workspace-stale-surfaces.js` | Reason — what goes stale | Intelligence, pure deriver over the graph spine |
| `workspace-workflow-impact.js` | Reason — outcome-level impact | Intelligence, pure |
| `workspace-provenance-lineage.js` | Reason — dependents/dependencies | Intelligence, pure (reuses blast-radius spine) |
| `workspace-app-readiness.js` | "Is it shippable?" | Intelligence, pure, secret-free |
| `workspace-contract-compliance.js` | Required proofs for a change | Intelligence predicate, pure |
| `workspace-patch-impact.js` | Dry-run impact incl. **removals** | Law-feeding, pure, one shared model |
| `serve --mcp` (`workspace-derivation-commands.ts`) | The console | read + dry-run + hand-off; Mutation = none; per-call live rehydrate; appScope forwarded |
| `metadata-graph` route (additive) | Read the universe | read-only projection; `staleSurfaces`/`readiness`/`impact`/`lineage` added |
| `preflight/route.js` (additive) | Dry-run against Law | returns scoped impact (added/modified/removed) before the write |
| CLI `plan` / `readiness` / `patch` / `capture` | Read/reason/dry-run from the terminal | offline-first; `patch --write` edits the repo artifact only, never live |

**Intentionally NOT in this release (kept honest):** a "minimal change set"
solver (was a heuristic, not exact) and a connector-discovery overlay (discovery
half not built) — both removed; the doc above lists connector-discovery as a
thing MCP must not pretend to be until it is real.

**Status:** Phase-A **source-only**. `cli/dist/**` rebuild is the Phase-B step
required before release. No PATCH allowlist change, no contract-version bump, no
token storage, no third mutation path.
