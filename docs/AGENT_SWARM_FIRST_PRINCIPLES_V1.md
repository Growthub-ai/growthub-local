# Agent Swarm First Principles V1

First-principles derivation of the `0.14.1` governed agent swarm release — what it is, why its architecture is self-referential, and where the roadmap visibly goes next. Every claim is traceable to a file in this repository.

Companion docs: [`SWARM_RUN_CONTRACT_V1.md`](./SWARM_RUN_CONTRACT_V1.md) (normative contract), [`GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md`](./GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md) (value map), [`GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md) (release snapshot), [`ROADMAP_IMPACT_ITEMS_V1.md`](./ROADMAP_IMPACT_ITEMS_V1.md) (the generalization roadmap).

All workspace-kit paths below are relative to `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`.

---

## The release thesis, derived

The pre-`0.14.1` workspace already contained two mature, independently shipped systems:

1. **A governance loop** — proposal → human review → apply → receipt → source-record lineage — that governs every workspace mutation (dashboards, widgets, canvas, Data Model rows) through one PATCH allowlist (`dashboards | widgetTypes | canvas | dataModel`).
2. **A swarm runtime** — `lib/orchestration-agent-swarm.js` plus the `sandbox-run` executor — capable of orchestrator-planned, parallel, reward-evaluated multi-agent execution.

`0.14.1` did not build a swarm system. It made the governance loop **govern the orchestration engine itself**: a swarm became a canonical `sandbox-environment` row carrying an `agent-swarm-v1` graph, created and edited only through the same propose/review/apply primitives that govern every other workspace object. That is the self-referential move — the same object-governance machinery that governs data now governs the machinery that coordinates agents. The release snapshot states the boundary explicitly: **no new runtime, no new persistence layer, no new PATCH field, no new swarm object model, no new visual grammar** (`GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md`, "No-new-authority confirmation").

## Axioms the code enforces

1. **A swarm is a row, not a runtime.** The artifact is a `sandbox-environment` row in the well-known `swarm-workflows` object whose `orchestrationConfig` serializes an `agent-swarm-v1` graph (`lib/workspace-swarm-proposal.js`, `buildSandboxRowFromSwarmProposal`). Same well-known-id pattern as `helper-threads`; same row schema as every other sandbox row, validated by `validateSandboxEnvironmentRow`.
2. **No mutation without a reviewed proposal.** Three proposal types — `swarm.run.propose`, `swarm.workflow.save`, `swarm.run.resume` — all ride the existing `dataModel` patch lane, following the `resolver.create` precedent of routing special lanes inside `helper/apply` without widening the PATCH surface.
3. **Query proposes, apply writes, only sandbox-run executes.** Helper query mutates nothing (proven: zero config writes at query time). Apply upserts the row (de-duped by `Name`, run stamps preserved) and returns a receipt with an artifact target. Execution happens only through `POST /api/workspace/sandbox-run` — never from chat, slash commands, or cockpit UI.
4. **The model is never trusted to author the final graph.** Intent is reduced through `buildDefaultAgentSwarmGraph`; a payload-supplied `orchestrationGraph` is honored only when it independently passes `validateAgentSwarmGraph` (`orchestration-graph.js:928`), otherwise it is discarded and rebuilt from intent.
5. **Telemetry is truthful or absent.** Per-task `tokens / tools / startedAt / endedAt / phaseId` come only from adapter-reported metadata (`local-intelligence` completion `usage`, supported `local-agent-host` CLI footers); unreported values stay `null` and render as `—`, never `0` or an estimate. Unit-tested (`scripts/unit-orchestration-agent-swarm-events.test.mjs`).
6. **Credentials never enter the loop.** Credential-shaped payload fields reject the whole proposal; rows carry env-ref slugs only; transcripts pass through `redactSecretsFromText`; verified adversarially (an injected `apiKey` value confirmed absent from config and source records).
7. **Lineage is structural.** Every graph node carries `sandboxRecordRef { objectId, rowName, nodeId }`, so canvas delta tags, prompt/model/output changes, and run evidence resolve back to the owning row and node. The Background Tasks tool-output view is thread-bounded to the exact `{ objectId, name }` target; the canvas redirect opens the exact record — no fallback row.

## The closed loop, end to end

```
intent (chat or /swarm)
  → helper query                      propose-only; swarm intent → swarm.run.propose
  → reviewed apply                    eligibility gate (helper execution target inherited,
                                      first-run readiness), upsert sandbox-environment row,
                                      receipt with artifact target
  → POST /api/workspace/sandbox-run   the ONLY executor; additive NDJSON deltas
                                      (swarm_run_start … swarm_run_complete, 7 types)
  → orchestration-agent-swarm.js      Plan (thinAdapter orchestrator)
                                      → Dispatch (ai-agent subagents, pool bounded by
                                        swarm.maxConcurrency)
                                      → Synthesize (tool-result node; parses OUTCOME_SCORE)
  → reward telemetry                  weighted parallel / finish / outcome
                                      (defaults 0.25 / 0.35 / 0.40); evaluated-v1 when
                                      OUTCOME_SCORE parses, structural fallback otherwise
  → persistence                       source records (sandbox:<objectId>:<slug>), row stamps
                                      (status, lastTested, lastRunId, lastSourceId,
                                      lastResponse) — the runtime itself never writes config
  → projection                        deriveSwarmRunProjection (pure: no React, fetch,
                                      writes, storage, CSS) → swarmRun on normalized records
  → observability                     SwarmRunCockpit in the HelperSidecar (Background Tasks:
                                      phase accordions, per-agent tokens/tools/time,
                                      transcript drill-in, live NDJSON hydration)
                                      + Workflow Canvas (pan/zoom/fit, editable graph,
                                      sandboxRecordRef identity)
  → next proposal                     edits re-enter the same loop
```

Self-improvement is real and Gödel-style at the artifact layer: an agent reads its own run evidence, synthesis, and rewards, then proposes graph changes — but every change re-enters propose → review → apply. No path bypasses the gate.

## What the release shipped (full surface)

Per the release snapshot, by phase:

- **Contract** (`packages/api-contract`): `swarm` intent; 3 proposal types mapped to `dataModel`; 7 additive `swarm_*` NDJSON event types with runtime guard; existing types unchanged, consumers ignore unknowns.
- **Proposal builder + apply lane**: `workspace-swarm-proposal.js` (new, pure) — validate/build/normalize/find/summarize; apply-lane upsert with run-stamp preservation; `swarm.run.resume` as a non-mutating governed pointer.
- **Truthful telemetry spine**: `deriveSwarmRunProjection` attached to every normalized record; adapter-meta-only task telemetry; the `intelligenceSandbox` envelope fix that made default-adapter swarm rows actually executable; additive `objectId`/`name` identity on persisted run records.
- **Cockpit, expand mode, slash commands**: `SwarmRunCockpit.jsx` (Running/Finished, phase dot strips, agent rows, transcript drill-in); `SidecarExpandView` (full-width takeover, Esc collapse, no modal stack); `helper-commands.js` (pure registry + fuzzy matcher; menu engages only on leading `/`); `HelperSidecar` view routing (`chat | swarm-list | swarm-detail | tool-output`) with chat, setup, review, receipts, and drag width preserved.
- **Closeout hardening**: helper execution-target inheritance into applied rows; first-run eligibility blocking Play on unrunnable targets; thread-bounded tool-output Open; exact-record canvas redirect; live NDJSON cockpit hydration; CLI-footer telemetry parsing; canvas pan/wheel-zoom/fit/tall-graph polish.
- **DUI/UX conformance, test-enforced**: the swarm CSS block is layout-only; every color/border/background/shadow and icon comes from existing primitives — pinned by `unit-swarm-run-console.test.mjs` (no hex colors, gradients, keyframes, shadows, foreign icons, or browser storage).
- **Proof**: end-to-end API smoke — propose (zero writes) → apply (1 row, duplicate apply updates in place) → six adversarial applies all rejected with reasons → run (`ok: true`, reward `evaluated-v1 (1.0)`, truthful per-task telemetry, persisted source records, projected `plan/dispatch/synthesize` phases). Gates green: version-sync, cli-package, release-check, contract `tsc`, workspace `next build`, 28 new + 23 pre-existing focused tests.

## The other half: configuration is causal, and swarms are its consumers

The swarm cockpit is one side of a shipped pair. The roadmap's keystone primitive (`ROADMAP_IMPACT_ITEMS_V1.md`) is the **pure-derivation lens layer**: typed state derived from config deltas where the next action is *computed, never authored*. Already shipped in-repo:

- `WORKSPACE_LENS_REGISTRY` + `deriveWorkspaceState()` (keystone), plus persistence, observability, deploy, task, and app-build lenses — all pure, no fetch, no mutation, never throw on partial input.
- **`deriveSwarmConditionPacket()` + read-only `GET /api/workspace/swarm-condition`** — every lens state composes into an assignable packet: `{ goal, currentState, nextAction, blockedStep, prerequisite, availableTools, expectedEvidence }`.
- The **Workspace Lens** surface (`/workspace-lens`): aggregate-first post-activation operating surface, unlocked at activation 5/5, where the human card and the machine packet read the identical derived state.

This is the bridge that makes the swarm release compound: any workspace state — a failing workflow, a blocked deploy, an unpersisted runtime — is simultaneously a human nudge and a machine-readable swarm assignment. The governed swarm artifact is the execution vehicle for those packets. The two declared value destinations of the entire roadmap are exactly: **high-impact agent-swarm orchestration** and **full custom applications born swarm-operable** (Item 7 scaffolds new apps through the same helper apply path, each shipping its own activation adapter so a swarm can be handed its condition immediately).

The visible trajectory, in dependency order (no dates): lens registry generalization → durable persistence + orchestration health (what swarms need to accumulate cross-run evidence) → multi-app fleet management + self-describing deploy (the super-admin layer: metering, confinement, per-app dashboards) → governed task objects (swarms propose, humans govern, on one surface) → full application lanes → the swarm condition packet composing all of it. Every step stays inside the existing PATCH boundary and the pure-derivation guardrail.

## Value, by persona (from the value map)

- **Operators** ask for a swarm in chat, review the agents, apply once, and run from Background Tasks — no manual object creation, no execution-settings repair.
- **Builders** open the generated record in the canvas; every node maps to its owning row and node id, so prompt/model/output deltas are traceable.
- **Admins** get one executor path, one record source of truth, one run-history surface — swarm execution never leaves the governed contract.
- **Agents** resume safely because everything is readable workspace state: the row, the graph, `sandboxRecordRef`, run history, receipts, the cockpit projection, canvas URL params — and now the swarm-condition packet.

## Source of truth

| Concern | Source |
| --- | --- |
| Workflow record | `dataModel.objects[].objectType === "sandbox-environment"` |
| Agent swarm graph | `orchestrationGraph.executionMode === "agent-swarm-v1"` |
| Proposal/apply | `workspace-swarm-proposal.js` + helper apply route |
| Execution | `POST /api/workspace/sandbox-run` |
| Runtime | `orchestration-agent-swarm.js` |
| Telemetry | adapter-reported metadata or supported output footer |
| UI projection | `orchestration-run-console.js` |
| Background cockpit | `SwarmRunCockpit.jsx` |
| Canvas identity | `sandboxRecordRef` on graph node config |
| Swarm assignment | `deriveSwarmConditionPacket()` / `GET /api/workspace/swarm-condition` |

## Limits, stated at their correct layer

- The 24-agent ceiling (`SWARM_MAX_AGENTS`, `workspace-swarm-proposal.js:58`) applies to the intent-shaped `payload.agents` array in the helper lane — a guardrail on conversational intent. The graph layer (`validateAgentSwarmGraph`) and the runtime impose no agent-count ceiling; `swarm.maxConcurrency` is clamped positive with no upper bound (runtime default 4). Large graph-authored swarms and concurrent rows are inside the contract; scale is bounded by host and adapter.
- Exactly two prompt-capable adapters (`local-agent-host`, `local-intelligence`), enforced at proposal and runtime; code-execution adapters rejected at both.
- Reward shaping records telemetry; nothing trains a model.
- Stop aborts the active client request only — durable cancel requires its own governed proposal (contract §9). Partial resume of failed subagents requires a future additive contract version (§10).
- Telemetry is only as rich as the adapter reports.

## Reproduction lane (temp export)

The sanctioned disposable-workspace lane is the agnostic seed export (the swarm-specific smoke export was deliberately deleted):

```bash
node scripts/export-seed-workspace.mjs --no-dev   # export → seed → validate
```

Exports `growthub-custom-workspace-starter-v1` to `${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}/feature-work-<ts>/`, seeds a super-admin-ready state (activation 5/5, API-registry cockpit score 100), and validates with the exported kit's own `validateWorkspaceConfig`. Swarm rows are then created inside that export through the governed loop — never by hand-editing seed files mid-session. Contract: `scripts/export-seed-workspace.md`.

## Behaviors pinned by tests

- `scripts/unit-swarm-proposal.test.mjs` (12) — validation gates, credential rejection, adapter gating, invalid model-authored graphs discarded, row normalization, upsert semantics.
- `scripts/unit-orchestration-agent-swarm.test.mjs` — graph detection/validation, default scaffold uses only existing node types, end-to-end phase pipeline, reward upgrade to `evaluated-v1` on parsed `OUTCOME_SCORE`.
- `scripts/unit-orchestration-agent-swarm-events.test.mjs` (4) — additive event contract; null-not-estimated telemetry.
- `scripts/unit-swarm-run-console.test.mjs` (6) — pure projection; DUI/UX conformance (layout-only CSS, inherited icon grammar, no browser storage).
- `scripts/unit-helper-command-registry.test.mjs` (6) — slash commands are read-only or proposal-seeding; no execute hooks, no fetch, no direct patch.
- `scripts/unit-workspace-lenses.test.mjs` (30) — lens registry, pure derivation invariants, swarm condition packet.
