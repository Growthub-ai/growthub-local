# Governed Swarm Release Snapshot V1

Agent Swarm Cockpit — branch `feat/agent-swarm-cockpit-v1`.

## Design (final): zero new routes, zero new authority

The cockpit is a **pure read projection over the existing surface**. No
swarm-specific endpoints exist; nothing polls in the background.

| Need | Existing surface used |
| --- | --- |
| Run history + workflows | `GET /api/workspace` (config + source records, one fetch when the drawer opens) |
| Launch a swarm run | `POST /api/workspace/sandbox-run` (the existing governed runner; the in-flight POST is the live "running" signal) |
| Per-row history | `GET /api/workspace/sandbox-run?objectId&name` |

Swarm runs are sandbox-run records whose payload carries the `swarm` +
`logTree` blocks already produced by `lib/orchestration-agent-swarm.js`
(untouched). `lib/swarm-cockpit-projection.js` (pure, no fetch, no React)
maps those records onto the cockpit tree: run → phases (Plan / Dispatch /
Synthesize) → agents with label / tokens (estimated) / tools (blank when
unreported) / time.

## Network contract (hard rule)

- Docked: **zero requests.**
- Drawer open: one `GET /api/workspace`; refresh is explicit (↻).
- Launch: one `POST /api/workspace/sandbox-run`; on resolve, one refresh.

## UI (Background-tasks parity)

`app/components/swarm/` — `SwarmCockpit` drawer
(`docked | slideout | expanded`, Esc collapses a level), Workflows section
with Run, Running/Finished sections, `SwarmRunCard`, `SwarmPhaseGroup`,
`SwarmDotStrip`, `SwarmAgentRow` (Agent/Tokens/Tools/Time, blank — never
0 — for unreported values), drill-in output in a mono tool-output frame,
`SwarmRunChip`, `SwarmStatusLine`, `CommandKPalette` (Cmd-K + slash; commands
derived client-side from loaded workflows + static navigation; launches go
through sandbox-run). Styling reuses the `dm-` grammar; grey/blue only.

## Smoke seed (opt-in script, never auto-run)

`scripts/seed-swarm-smoke.mjs` (`npm run seed:swarm-smoke`) mutates only
the workspace it is executed in: seeds a `swarm-smoke-sandbox` row with an
agent-swarm-v1 graph, a `smoke-metrics` object, a live `Swarm Smoke QA`
dashboard with widgets, and a clearly-labeled seeded run fixture — every
blank-workspace activation driver reads complete, so QA skips onboarding.
`--live` executes the seeded workflow through the existing sandbox-run
route. The kit template itself ships unmodified.

## Authority boundary (unchanged)

The AWaC boundary from `GOVERNED_WORKSPACE_TOPOLOGY_V1.md` holds:
`growthub.config.json` writes flow only through existing governed routes;
agents dispatch only through the registered sandbox adapter registry;
secrets never enter prompts or stored outputs.
