# Governed Swarm Release Snapshot V1

Release snapshot for the **Governed Agent Swarm Cockpit** — the `0.14.1`
governed creation extension.

Companion docs:

- [`docs/SWARM_RUN_CONTRACT_V1.md`](./SWARM_RUN_CONTRACT_V1.md)
- [`docs/GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md`](./GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md)

## Source-of-truth summary

The helper proposes. `helper/apply` mutates after review. `sandbox-run`
executes. Source records persist run history. `orchestration-run-console`
projects records for UI. `orchestration-agent-swarm` is the existing swarm
runtime. This extension exposes that existing spine inside the helper
sidecar, Background Tasks, and workflow canvas — it adds **no new runtime,
no new persistence layer, no new PATCH field, and no new swarm object model**.

## Files changed by phase

### Phase 1 — Contract and proposal types
- `packages/api-contract/src/helper.ts` — additive: `swarm` intent;
  `swarm.run.propose` / `swarm.workflow.save` / `swarm.run.resume` proposal
  types mapped to the existing `dataModel` patch field.
- `packages/api-contract/src/events.ts` — additive: seven `swarm_*`
  lifecycle event types (union + interfaces + runtime guard). Existing
  types unchanged.
- `…/apps/workspace/lib/workspace-helper.js` — swarm intent description,
  heuristic routing patterns, propose-only swarm prompt contract, proposal
  type registry + patch-field mapping.
- `…/apps/workspace/app/api/workspace/helper/query/route.js` — `swarm`
  added to valid intents (propose-only; no execution at query time).
- `docs/SWARM_RUN_CONTRACT_V1.md` — the full contract.

### Phase 2 — Swarm proposal builder and apply lane
- `…/apps/workspace/lib/workspace-swarm-proposal.js` (new, pure) —
  validate/build/normalize/find/summarize helpers; intent payload reduced
  through `buildDefaultAgentSwarmGraph`; model graph JSON never trusted
  unless it independently validates; credential-shaped payloads rejected;
  unknown agent hosts dropped; rows pinned to local prompt-capable adapters.
- `…/apps/workspace/app/api/workspace/helper/apply/route.js` — swarm lane:
  `normalizeSwarmRunProposal` validates and upserts (de-dupe by `Name`,
  run stamps preserved) the governed `sandbox-environment` row in the
  well-known `swarm-workflows` object; receipts carry an artifact target;
  `swarm.run.resume` is a non-mutating governed pointer.

### Phase 3 — Run-console projection and truthful telemetry
- `…/apps/workspace/lib/orchestration-run-console.js` —
  `deriveSwarmRunProjection(record)` (pure; no React/fetch/writes) attached
  as `swarmRun` to normalized records; null for non-swarm records;
  transcripts secret-redacted; unreported tokens/tools stay `null`.
- `…/apps/workspace/lib/orchestration-agent-swarm.js` — task/orchestrator/
  synthesis results gain `tokens`, `tools`, `startedAt`, `endedAt`,
  `phaseId` from adapter-reported metadata only (null when unreported);
  local-intelligence dispatch now passes the `intelligenceSandbox` envelope
  (row-configured model/endpoint slugs — fixes swarm rows on the default
  adapter never being executable).
- `…/apps/workspace/lib/adapters/sandboxes/default-local-intelligence.js` —
  additive `adapterMeta.tokens` (from the completion `usage` block) and
  `adapterMeta.tools` (tool-intent count). Never estimated.
- `…/apps/workspace/app/api/workspace/sandbox-run/route.js` — additive
  `objectId`/`name` identity on persisted run records.

### Phases 4–6 — Sidecar cockpit, expand mode, slash commands
- `…/app/data-model/components/SwarmRunCockpit.jsx` (new) —
  `SwarmRunList`, `SwarmRunCard`, `SwarmPhaseGroup`, `SwarmAgentRow`,
  `SwarmAgentTranscript`. Running/Finished sections, phase dot strips,
  Agent/Tokens/Tools/Time rows, transcript drill-in. Executes only via
  `POST /api/workspace/sandbox-run`; refreshes from
  `GET /api/workspace/sandbox-run` history; Stop aborts the active client
  request only; Clear hides local cards only.
- `…/app/data-model/components/SidecarExpandView.jsx` (new) — full-width
  takeover within the same sidecar; Esc/back collapse; no modal stack.
- `…/app/data-model/components/helper-commands.js` (new, pure) — command
  registry + fuzzy matcher + slash parser (menu engages only when "/" is
  the first character).
- `…/app/data-model/components/HelperSidecar.jsx` — `activeView`
  (`chat | swarm-list | swarm-detail | tool-output`), header back affordance,
  swarm artifact routing into the cockpit, slash menu (Arrow/Enter/Tab/Esc,
  Cmd+Enter intact), swarm proposal payload summaries. Chat, setup tab,
  proposal review, apply receipts, drag width, and close are preserved.
- `…/app/globals.css` — structural layout for the cockpit only; composes
  existing `dm-helper-toolcall`, `dm-run-console__tree-dot`, `dm-btn-ghost`,
  `dm-field-label/-hint` grammar. No new colors, icons, animations,
  gradients, or badges.

### Phase 8 — Tests and docs
- `scripts/unit-swarm-proposal.test.mjs` (12 tests)
- `scripts/unit-swarm-run-console.test.mjs` (6 tests)
- `scripts/unit-helper-command-registry.test.mjs` (6 tests)
- `scripts/unit-orchestration-agent-swarm-events.test.mjs` (4 tests)
- `docs/SWARM_RUN_CONTRACT_V1.md`, this snapshot.

## Contract changes

- Proposal registry: +3 swarm types → existing `dataModel` lane. PATCH
  allowlist unchanged (`dashboards | widgetTypes | canvas | dataModel`).
- Intent registry: +`swarm`.
- Event union: +7 additive `swarm_*` types; consumers ignore unknown types.
- Run records: additive `objectId`, `name`, per-task telemetry fields,
  `swarmRun` projection on normalized records.
- Workflow canvas nodes: additive `config.sandboxRecordRef` values so
  node delta tags resolve to the owning sandbox object row and node id.

## 0.14.1 final closeout additions

- Helper apply inherits the active helper execution target into newly applied
  swarm workflow rows, including local-agent-host and local-intelligence
  paths.
- First-run eligibility blocks Play when the helper/widget execution target or
  swarm row execution target is not runnable.
- Background Tasks tool-output Open is thread-bounded: when a helper result
  targets `{ objectId, name }`, the cockpit renders only that exact swarm row.
- The Background Tasks header redirect opens the exact workflow canvas record;
  there is no fallback row.
- `sandbox-run` supports additive NDJSON deltas for live cockpit hydration.
- `local-agent-host` telemetry parses supported real CLI output footers; missing
  telemetry stays `null`, never `0` or estimated.
- Workflow canvas pan, wheel zoom, fit view, tall graph padding, one-line drawer
  titles, and record-level Execute affordance were finalized as UI polish.

## Proposal → apply → run → receipt proof (API smoke, dev runtime)

- Helper query (`intent: "swarm"`) returned `swarm.run.propose` →
  **zero config writes at query time** (row count unchanged).
- Apply created `swarm-workflows` (objectType `sandbox-environment`), one
  row, `orchestrationConfig` with `provider: growthub-native`,
  `executionMode: agent-swarm-v1`, nodes
  `thinAdapter, ai-agent×3, tool-result`. Duplicate apply updated in place
  (rows stayed at 1). Receipt:
  `artifact: { surface: "swarm-run", objectId: "swarm-workflows", name: "swarm-ui-smoke-test" }`.
- Adversarial applies all skipped with reasons: `affectedField: "swarm"`,
  unknown type `agent.run.direct`, empty agents, credential-shaped payload
  (`apiKey: sk-test-123` — value verified absent from config and source
  records), `adapter: local-process`, resume of a missing row.
- `POST /api/workspace/sandbox-run` executed the row through the existing
  swarm runtime (mock OpenAI-compatible endpoint):
  `ok: true · status: connected · adapter: orchestration-agent-swarm ·
  persisted: true · sourceId: sandbox:swarm-workflows:swarm-ui-smoke-test`;
  reward `evaluated-v1 (1.0)`; per-task truthful telemetry
  (`tokens=163, tools=0, phaseId=dispatch`). Row stamped with `status`,
  `lastRunId`, `lastSourceId`, `lastResponse`; `GET` history returned the
  appended records; `deriveSwarmRunProjection` produced
  `plan / dispatch / synthesize` phases with per-agent rows. With no
  telemetry reported, values stay `null` (unit-tested) and the UI renders
  `—`.

## Gates

- `npm run check:version-sync` ✓ · `npm run check:cli-package` ✓ ·
  `npm run release:check` ✓
- `packages/api-contract` `tsc --noEmit` ✓
- Workspace `next build` ✓ (compiled successfully)
- Focused unit tests: 28 new + 23 pre-existing (swarm runtime + resolver
  proposal) all passing.

## Known limitations

- Stop cancels the active client request only — no durable server-side
  cancel primitive exists yet.
- `swarm.run.resume` re-launches the whole workflow; partial resume of
  failed subagents requires a future contract version.
- Token/tool telemetry is only as rich as the adapter reports
  (`local-intelligence` reports completion usage; supported `local-agent-host`
  CLI footers are parsed; otherwise values render `—`).

## DUI/UX conformance hardening (post-review pass)

The swarm CSS block in `globals.css` is **layout-only** (display, grid,
spacing, overflow, typography size/weight). Every color, border, background,
and shadow comes from existing primitives composed in the JSX:
`dm-helper-toolcall(-row/-title/-chevron/-body/-json)`, `dm-helper-stream`,
`dm-helper-error`, `dm-run-console__hint`, `dm-run-console__tree-dot`,
`dm-btn-ghost`, `dm-sidecar-header`, `dm-helper-pill-menu`. The cockpit's
icon set is strictly inherited grammar — ArrowUpRight/ChevronDown/
ChevronRight from `HelperSidecar`, Play/Square from the existing run-console
surfaces (`OrchestrationRunTracePanel`, `SandboxRunPanel`). Both invariants
are enforced by a unit test
(`unit-swarm-run-console.test.mjs → "cockpit DUI/UX conformance"`): no hex
colors / color functions / keyframes / gradients / shadows in the swarm CSS
block, no lucide imports outside the inherited set, no browser storage in
the cockpit.

## No-new-authority confirmation

No new runtime (execution stays in `sandbox-run` + the existing swarm
runner). No new persistence layer (workspace config rows + source records
only; localStorage/sessionStorage untouched). No new PATCH allowlist
field. No direct mutation from chat, slash commands, or cockpit UI. No
secrets in prompts, rows, proposals, source records, or browser state. No
new visual grammar.
