# Starter Agentic Roadmap

> A compounding sprint plan for turning the Custom Workspace Starter Kit into a
> first-class agentic workspace on top of already-shipping primitives.
>
> No timelines. Each sprint strictly builds on the artifacts and invariants
> established by the previous one. Every item composes primitives that already
> exist — no new transport, no new storage locations, no new auth primitives.

## Grounding references (read before editing)

- `cli/src/starter/init.ts` — the starter orchestrator
- `cli/src/commands/starter.ts` — CLI surface for `growthub starter …`
- `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/` — bundled asset tree (kit.json, `studio/` Vite shell, `workers/custom-workspace-operator/CLAUDE.md`)
- `cli/src/kits/{fork-registry,fork-policy,fork-trace,fork-remote}.ts` — Self-Healing Fork Sync Agent surface
- `cli/src/runtime/cms-capability-registry/` — CMS node primitive discovery
- `cli/src/runtime/cms-node-contracts/` — introspect, normalize, validate, compile
- `cli/src/runtime/dynamic-registry-pipeline/` — DAG assembly + validation
- `cli/src/runtime/machine-capability-resolver/` — per-machine/user/org gating
- `cli/src/runtime/hosted-execution-client/` — `/api/execute-workflow`, `/api/sandbox/provider-report`, `/api/cli/{profile,capabilities}`
- `cli/src/runtime/artifact-contracts/` — local + hosted artifact store
- `cli/src/runtime/native-intelligence/` — Gemma planner / normalizer / recommender / summarizer (shapes only, never executes)
- `cli/src/runtime/open-agents/`, `cli/src/runtime/qwen-code/`, `cli/src/runtime/agent-harness/` — durable agent harness surfaces

## Canonical invariants (apply to every sprint)

1. Local runtime (`scripts/runtime-control.sh` at the repo level; `growthub starter …` at the workspace level) remains canonical.
2. CMS nodes remain the execution substrate. Nothing here replaces `hosted-execute` / `provider-assembly`.
3. Every significant workspace action lands in `<forkPath>/.growthub-fork/trace.jsonl` via `appendKitForkTraceEvent`.
4. Never bypass `policy.json` (`autoApprove`, `autoApproveDepUpdates`, `untouchablePaths`, `remoteSyncMode`).
5. Saved pipelines, artifacts, and any new fork-local state live under `<forkPath>/.growthub-fork/` so heal/trace covers them by default.
6. `native-intelligence` only plans, normalizes, recommends, summarizes — it never directly executes tools.
7. No new auth primitive. Hosted calls reuse `auth/session-store` + `client/http` + `auth/hosted-client` patterns.

---

## Sprint 0 — Narrate the autonomy surface (doc-only, zero code)

**Why first:** every later sprint assumes the agent knows these verbs exist. Landing the doc first means every subsequent change is immediately picked up by operators reading the contract.

**Artifacts:**

- `workers/custom-workspace-operator/CLAUDE.md` (in the bundled kit) grows to enumerate the full execution surface the operator is allowed to drive:
  - Fork Sync Agent verbs (already documented): `growthub kit fork status|heal|policy|trace`.
  - Discovery verbs: `growthub capability list|inspect`, `growthub workflow list|inspect`.
  - Assembly verbs: `growthub pipeline assemble|validate|execute` (and, after Sprint 2, `--from <file>`).
  - Harness verbs: `growthub open-agents create|resume`, `growthub qwen-code …`.
  - Native intelligence verbs: `growthub workflow recommend|plan` wrappers.
- `docs/starter-kit-overview.md` grows a "Command surface map" section cross-linking the above to the runtime modules.

**Success check:** an operator agent that only reads `CLAUDE.md` can name every execution verb without consulting any other file.

**Depends on:** nothing.

**Unlocks:** every later sprint's CLI additions are legible to the agent the moment they land.

---

## Sprint 1 — Promote `growthub starter` into a full lifecycle verb

**Why now:** Sprint 0 names verbs the agent can call. Sprint 1 adds the missing workspace-scoped verbs (`dev`, `build`, `doctor`, `status`) so every subsequent sprint can reference a canonical starter lifecycle instead of ad hoc `cd studio && npm …` loops.

**Artifacts (all in `cli/src/commands/starter.ts` + `cli/src/starter/`):**

- `growthub starter dev [--fork <path>]` — resolves fork path (current dir or explicit), `spawnSync("npm", ["run", "dev"], { cwd: path.join(forkPath, "studio") })`, streams output. Appends a `studio_dev_started` trace event.
- `growthub starter build [--fork <path>]` — same wrapper for `npm run build`. Appends `studio_built` trace event.
- `growthub starter serve [--fork <path>]` — wraps `node serve.mjs`.
- `growthub starter status [--fork <path>]` — thin composition over `readKitForkRegistration` + `readKitForkPolicy` + last N events from `trace.jsonl`. Pure read.
- `growthub starter doctor [--fork <path>]` — composes `gitAvailable`, `isGitRepo`, presence of `.growthub-fork/fork.json`, `kit.json`, `studio/package.json`. Non-destructive.

**Guardrails:**

- Each verb validates that the target path is a registered kit-fork (by reading `.growthub-fork/fork.json`) before doing any filesystem work. If not, it prints: `Not a registered kit-fork. Run \`growthub starter init\` first or pass --fork <path>.`
- `starter dev|build|serve` never mutate anything under `.growthub-fork/` except appending a trace event.

**Success check:** `growthub starter status` in any scaffolded workspace returns the same forkId / policy / latest events that `growthub kit fork status <forkId>` returns.

**Depends on:** Sprint 0.

**Unlocks:** Sprint 2 can rely on `starter status` to emit JSON describing the fork context for headless pipeline execution.

---

## Sprint 2 — Fork-local pipeline spec + headless execution

**Why now:** Sprint 1 gives us a canonical workspace lifecycle. Sprint 2 introduces the headless artifact an agent will author and re-run — a YAML pipeline spec that travels with the fork.

**Artifacts:**

- Bundle a new directory and a seed template in the starter tree:
  - `pipelines/` (empty, `.gitkeep`) at the fork root.
  - `templates/pipeline.sample.yaml` — the minimum viable DAG keyed on safe/common slugs (e.g. a 1-node `text` or `ops` capability). Add to `kit.json#frozenAssetPaths`.
- New CLI verb `growthub pipeline execute --from <file>`:
  - YAML loader (add `yaml` to `cli/package.json`) that parses `{ pipelineId?, executionMode?, metadata?, nodes: [{ id?, slug, bindings, upstreamNodeIds? }] }`.
  - Feeds straight into `createPipelineBuilder().addNode(...)` then `.validate()` then `.package()` → existing hosted execute path.
  - Fails closed on missing required bindings (`cms-node-contracts/validateNodeBindings`) with the same `renderPreExecutionSummary` the interactive assembler uses.
- Companion verb `growthub pipeline validate --from <file>` — validate only, no execution. Agent-first dry-run path.
- Trace event convention: `pipeline_executed` / `pipeline_validated` events appended to `trace.jsonl` with `{ pipelineSpecPath, pipelineId, nodeCount, route }` when run inside a fork.

**Guardrails:**

- `--from` rejects absolute paths outside the fork tree. All pipeline specs must live under the fork (so fork-sync heal governs them).
- `pipelineId` is derived from the spec path if omitted; same path always yields the same logical id.
- YAML parse errors never surface as raw exceptions; they route through the same `renderPreExecutionSummary` warnings channel.

**Success check:** after `growthub starter init`, an operator can run `growthub pipeline execute --from templates/pipeline.sample.yaml` without any interactive prompt and see a real hosted execution result.

**Depends on:** Sprint 0 (verb is named), Sprint 1 (fork lifecycle + trace convention).

**Unlocks:** Sprint 3's native-intelligence verb emits YAML into exactly this path; Sprint 4 anchors saved-pipeline storage against this convention.

---

## Sprint 3 — `growthub starter assist` (intent → pipeline YAML)

**Why now:** Sprint 2 gave agents a headless artifact to run. Sprint 3 teaches the workspace how to *author* that artifact from natural-language intent using only already-shipping primitives.

**Artifacts:**

- New CLI verb `growthub starter assist "<intent>" [--out pipelines/<slug>.yaml]`:
  1. Loads the effective capability set via `createCmsCapabilityRegistryClient().listCapabilities()` + `createMachineCapabilityResolver().resolveAll()` (filters to allowed slugs).
  2. Calls `createNativeIntelligenceProvider().planWorkflow({ intent, availableCapabilities })` — which already produces a structured plan.
  3. Serializes the plan through the same shape `pipeline execute --from` consumes in Sprint 2 (`{ nodes: [...] }`) and writes it under `pipelines/`.
  4. Runs `introspectNodeContract` + `normalizeNodeBindings` on every node and emits a pre-flight summary via `renderPreExecutionSummary`.
  5. Appends a `pipeline_drafted` trace event.
- Agent contract in `CLAUDE.md` gains the "Assist → Validate → Execute" loop as an explicit operator playbook.

**Guardrails:**

- `assist` never executes a pipeline. It only produces a YAML draft + pre-flight summary. Execution remains explicit (Sprint 2's verb).
- If `native-intelligence` is in stub mode (no backend configured), `assist` falls back to the deterministic planner (`buildDeterministicPlan`) so the flow is never auth-coupled.
- The drafted YAML is always written under `<forkPath>/pipelines/` so heal covers it.

**Success check:** `growthub starter assist "draft a weekly ops digest" --out pipelines/ops-digest.yaml` yields a YAML spec that passes `growthub pipeline validate --from pipelines/ops-digest.yaml` on the first try.

**Depends on:** Sprint 2 (YAML contract + validator).

**Unlocks:** Sprint 4 can treat these drafts as promotable saved workflows; Sprint 6 harnesses can kick `assist` off as a sandboxed step.

---

## Sprint 4 — Anchor saved pipelines + artifacts inside the fork

**Why now:** Sprints 2–3 put pipeline specs inside `pipelines/`. Sprint 4 closes the loop by moving the persistent state the runtime already writes (saved workflows, artifacts) into the fork so the whole workspace is self-contained and heal/trace/remote-sync cover it.

**Artifacts:**

- Add resolver helpers `resolveForkLocalWorkflowsDir(forkPath)` and `resolveForkLocalArtifactsDir(forkPath)` pointing at:
  - `<forkPath>/.growthub-fork/pipelines/` — persisted saved-workflow JSON.
  - `<forkPath>/.growthub-fork/artifacts/` — `GrowthubArtifactManifest` entries.
- `cli/src/commands/workflow.ts::resolveSavedWorkflowsDir()` and `cli/src/runtime/artifact-contracts/index.ts` gain a fork-aware branch: when invoked from within a kit-fork (detected by walking up from `process.cwd()` to find `.growthub-fork/fork.json`), they resolve to the fork-local dirs; otherwise they fall back to `~/.paperclip/{workflows,artifacts}/` exactly as today.
- New verbs:
  - `growthub starter register-pipeline <file> [--push-hosted]` — persists the YAML into `<forkPath>/.growthub-fork/pipelines/` and optionally calls `saveHostedWorkflow` with the compiled hosted config.
  - `growthub starter artifacts list|inspect` — wraps `createArtifactStore().listArtifacts({ forkId })`.
- Trace events: `pipeline_registered`, `pipeline_pushed_hosted`, `artifact_persisted`.

**Guardrails:**

- Fork-local resolution is strictly opt-in via presence of `.growthub-fork/fork.json`. Non-fork usage paths are unchanged.
- `register-pipeline --push-hosted` never force-overwrites hosted state; it uses the existing `saveHostedWorkflow` semantics (which already version workflows).
- Heal already honours `.growthub-fork/*`; the new subdirs inherit that behaviour automatically.

**Success check:** running `growthub workflow save` from inside a scaffolded workspace writes into `<forkPath>/.growthub-fork/pipelines/` and the next `growthub kit fork heal <forkId> --dry-run` reports *no* drift against upstream (because the new dirs live inside the per-fork envelope, not the frozen asset tree).

**Depends on:** Sprint 2 (pipeline spec shape), Sprint 3 (spec producers).

**Unlocks:** Sprint 5's studio panels can read fork-local pipelines + artifacts directly from the fork without needing a global path.

---

## Sprint 5 — Make `studio/` a live fork console

**Why now:** Sprints 1–4 gave us rich fork-local state (registration, policy, trace, pipelines, artifacts). Sprint 5 exposes it in the Vite shell that the operator already sees after `growthub starter dev`, replacing the placeholder `App.jsx`.

**Artifacts:**

- Add a `studio/serve-bridge.mjs` (or extend `studio/serve.mjs` + Vite middleware) that exposes **read-only** fork-local endpoints:
  - `GET /_fork/state` → `{ registration, policy, remote }` from the sibling `.growthub-fork/`.
  - `GET /_fork/trace?tail=N` → last N events from `trace.jsonl`.
  - `GET /_fork/pipelines` → listing from `.growthub-fork/pipelines/`.
  - `GET /_fork/artifacts` → listing via `createArtifactStore().listArtifacts({ forkId })`.
  - `GET /_fork/capabilities` → `createMachineCapabilityResolver().resolveAll()` (auth-gated; degrades gracefully when no session).
- Replace `studio/src/App.jsx` with three panels that consume the above:
  1. **Fork** — forkId, kitId, baseVersion, policy summary, remote binding.
  2. **Capabilities** — resolved capability bindings, grouped by family, with enabled/blocked reason.
  3. **Pipelines & Artifacts** — fork-local pipeline YAMLs + latest artifact manifests.
- Add a `studio/src/lib/fork-bridge.ts` typed client wrapping those endpoints.

**Guardrails:**

- All bridge endpoints are **read-only**. No mutations from the studio in this sprint (policy editing, pipeline execution from the UI, etc. are deferred).
- The bridge binds to `127.0.0.1` only, mirroring existing `GH_SERVER_PORT` conventions.
- Endpoints emit a short `studio_bridge_read` trace event at most once per process start (not per request) to avoid trace noise.

**Success check:** after `growthub starter dev`, the browser shows live values from `.growthub-fork/` and the capability resolver; running `growthub pipeline execute --from templates/pipeline.sample.yaml` in another terminal causes the Pipelines & Artifacts panel to update after refresh.

**Depends on:** Sprint 4 (fork-local pipelines/artifacts), Sprint 1 (dev verb).

**Unlocks:** Sprint 7's policy/trace panels layer mutation on top of this read-only substrate.

---

## Sprint 6 — Durable agent harness handoff from the starter

**Why now:** The workspace now has a typed fork state, a YAML pipeline contract, a planner, and a live console. Sprint 6 adds the *durable* execution mode: spawn an Open Agents / Qwen Code harness session that already knows about this fork.

**Artifacts:**

- `growthub starter init` gains optional flags `--harness open-agents|qwen-code` and `--harness-prompt <path>`. Post-scaffold, when `--harness` is set:
  - For `open-agents`: compose `readOpenAgentsConfig` + `writeOpenAgentsConfig` with `defaultRepo` = fork remote (if bound) and `defaultBranch` = current branch; then `createOpenAgentsSession` seeded with the full path to `workers/custom-workspace-operator/CLAUDE.md` as prompt.
  - For `qwen-code`: equivalent with the `qwen-code` provider.
- Standalone verb `growthub starter handoff [--harness …] [--prompt …]` for existing forks.
- Trace events: `harness_bootstrapped`, `harness_session_created` with `{ harnessId, sessionId }`.
- Agent contract adds a "Durable handoff" section explaining when to pick local CLI vs. durable harness.

**Guardrails:**

- Handoff never runs without an authenticated hosted session *only if* the chosen harness requires it; `open-agents` local backend stays usable with no session (existing `DEFAULT_OPEN_AGENTS_CONFIG`).
- No harness credentials are written outside `~/.paperclip/harness-auth/` (the existing `auth-store.ts` convention).
- If `--harness` is passed but the chosen harness is unhealthy (via `checkOpenAgentsHealth` / `checkQwenHealth`), init still succeeds; handoff is reported as `skipped` with the health reason and a trace event.

**Success check:** `growthub starter init --out ./w --harness open-agents --upstream acme/foo` produces a scaffolded workspace **and** a ready Open Agents session whose prompt is the scaffolded `CLAUDE.md`, all via one verb.

**Depends on:** Sprint 2 (headless pipeline execution, so the harness has something concrete to run), Sprint 5 (live fork state so the handed-off agent can self-introspect).

**Unlocks:** Sprint 7's write-path studio surfaces can trigger a handoff from the UI.

---

## Sprint 7 — Write-path in studio + real-time trace stream

**Why now:** Sprints 5 and 6 built the read-path console and the durable handoff. Sprint 7 turns the studio into an operator control surface by layering carefully-scoped writes.

**Artifacts:**

- Extend the studio bridge with mutating endpoints, each gated on `policy.json` rules:
  - `POST /_fork/policy` — partial update of `policy.json` (same keys as `growthub kit fork policy --set`). Appends a `policy_updated` trace event via `appendKitForkTraceEvent`.
  - `POST /_fork/pipelines/:name/execute` — runs the fork-local YAML via the same code path as `growthub pipeline execute --from`. Requires `policy.autoApprove` or an explicit `confirm=true` query flag.
  - `POST /_fork/handoff` — composes the Sprint 6 harness handoff.
- Add an SSE endpoint `GET /_fork/trace/stream` using `fs.watch` over `trace.jsonl`; studio renders a live event timeline.
- New studio panels: Policy editor, Pipeline runner, Handoff launcher, Trace timeline.

**Guardrails:**

- Every mutation round-trips through an existing CLI primitive (`writeKitForkPolicy`, the pipeline execute path, `createOpenAgentsSession`) — the studio is only a UI over those primitives.
- `untouchablePaths` and `autoApproveDepUpdates` are respected exactly as today.
- SSE endpoint tails, never rewrites, `trace.jsonl`.
- All write endpoints return the fresh `registration/policy/trace` triple so the UI stays in sync without polling.

**Success check:** an operator can, from the studio:
  1. Flip `remoteSyncMode` from `off` to `branch`,
  2. Run `templates/pipeline.sample.yaml`,
  3. Watch the `pipeline_executed` event appear in the live trace,
all without touching a terminal — and `growthub kit fork trace --fork-id <id> --tail 5` shows the same events.

**Depends on:** Sprint 5 (read-path bridge), Sprint 6 (handoff primitive).

**Unlocks:** Sprint 8 can ship the summarization + recommendation layer on top of a UI that already exposes pipelines and traces.

---

## Sprint 8 — Native-intelligence loop, closed

**Why now:** With the full execute → trace → artifact loop running inside the workspace, native intelligence's planner, normalizer, recommender, and summarizer have everything they need to be useful without ever executing anything themselves.

**Artifacts:**

- CLI:
  - `growthub starter summarize [--pipeline <id>]` — calls `summarizeExecution` over the last run recorded in `trace.jsonl` + the artifact store; writes a Markdown summary into `output/<client-slug>/<project-slug>/`.
  - `growthub starter recommend` — calls `recommendWorkflow` against fork-local pipelines + recent hosted workflows (`listHostedWorkflows`) to suggest next pipelines, serialized as YAML drafts in `pipelines/` (reusing Sprint 3's writer).
  - `growthub pipeline normalize --from <file>` — calls `intelligentNormalizeBindings` to rewrite bindings in-place for a YAML spec, with a diff preview.
- Studio:
  - "Summary" tab on the Trace timeline that renders the latest summarization.
  - "Suggested next pipelines" card on the Pipelines & Artifacts panel.

**Guardrails:**

- Summaries and recommendations are always deterministic when no model backend is configured (existing `buildDeterministic*` helpers).
- Every write emits a trace event (`pipeline_normalized`, `run_summarized`, `pipelines_recommended`).
- Recommendations always go through the same YAML contract Sprint 2 defined — no side channels.

**Success check:** after a real hosted execution, `growthub starter summarize` emits a durable Markdown artifact under `output/…`, and `growthub starter recommend` drops one or more validated YAML drafts into `pipelines/` that pass `growthub pipeline validate --from …` on the first try.

**Depends on:** Sprint 3 (planner wiring + YAML writer), Sprint 4 (fork-local artifacts), Sprint 7 (trace + pipeline surfaces in the UI).

**Unlocks:** a fully compounding loop — operators and agents can **discover → plan → validate → execute → persist → summarize → recommend → re-run** entirely from inside a single scaffolded workspace, with every step anchored in `.growthub-fork/` and governed by existing fork-sync invariants.

---

## Compounding map

| Sprint | Produces | Used by |
| --- | --- | --- |
| 0 | Verb vocabulary in `CLAUDE.md` | 1, 2, 3, 6 (operators/agents know what to call) |
| 1 | `starter dev/build/status/doctor` lifecycle | 2 (fork-aware exec context), 5 (dev server hosts bridge) |
| 2 | `pipelines/*.yaml` contract + `pipeline execute --from` | 3 (assist writer), 4 (storage anchor), 7 (UI runner), 8 (normalizer) |
| 3 | `starter assist` — intent → YAML | 4 (promotable drafts), 8 (recommender reuses writer) |
| 4 | Fork-local pipelines + artifacts | 5 (read panels), 7 (runner panel), 8 (summaries into `output/`) |
| 5 | Read-only studio bridge + panels | 7 (adds writes + SSE), 8 (summary/recommend tabs) |
| 6 | Durable harness handoff | 7 (handoff launcher), 8 (long-running recommendations) |
| 7 | Write-path studio + live trace | 8 (summary tab attaches to trace stream) |
| 8 | Summarize / recommend / normalize closed loop | — (loop is closed) |

## Non-goals in this roadmap

- No new transport or auth primitives (everything reuses `auth/session-store`, `client/http`, `auth/hosted-client`, `agent-harness/auth-store`).
- No changes to the Fork Sync Agent contract (`.growthub-fork/` layout, policy keys, heal semantics) beyond additive subdirectories (`pipelines/`, `artifacts/`) that heal already tolerates.
- No changes to the hosted CMS schema — dynamic pipelines continue to compile into the existing hosted workflow config shape via `compileToHostedWorkflowConfig`.
- No replacement of the interactive `growthub pipeline` / `growthub workflow` assemblers; the headless YAML path is additive.

## Pre-push contract (every sprint)

Before pushing any sprint's implementation branch:

```bash
bash scripts/pr-ready.sh
```

And for any destructive git operation:

```bash
bash scripts/guard.sh check-command "<command>"
```

Version bumps (only when a sprint ships source changes to npm):

- `cli/package.json` version +1
- `packages/create-growthub-local/package.json` version +1
- dep pin in `create-growthub-local` must match `cli` exactly

See `docs/ARTIFACT_VERSIONS.md` and `cli/package.json` on the branch — never cite semver from memory.
