# growthub-local — Agent Workflow

This file defines agent behavior in this repository. Keep it aligned with `README.md` and the current workspace source.

## Canonical Product Reality

Growthub Local is the reference implementation of **Agent Workspace as Code (AWaC)**.

AWaC means the **workspace is the owned artifact**: a forkable app, `growthub.config.json`, `.growthub-fork/` lifecycle state, Data Model objects, local builder, agent-readable contracts, helper scripts, runtime/deploy checks, and optional hosted authority only when needed.

The official topology reference is [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md). If agent guidance conflicts with that topology, update the guidance instead of inventing a side path.

The current governed creation value map is [`docs/WORKSPACE_NEW_REALITY_VALUE_MAP_V1.md`](./docs/WORKSPACE_NEW_REALITY_VALUE_MAP_V1.md). The `0.14.1` governed agent swarm cockpit feature map is [`docs/GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md`](./docs/GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md).

## Canonical Product Mental Model

Growthub Local turns a **repo, skill, starter, or kit** into a governed local workspace that can be customized, kept current, and operated by humans and agents.

Use this sequence as the canonical user path:

1. Discover source
2. Create environment
3. Register fork
4. Customize safely
5. Sync safely

Hosted account authority is C-tier. Do not center it unless the task explicitly concerns account-backed integrations, hosted execution, or hosted agent binding.

If any repo doc conflicts with that sequence, update or remove the conflicting doc.

## Source Of Truth Order

When behavior conflicts, use this order:

1. `README.md`
2. `AGENTS.md`
3. `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`
4. focused workspace docs in `docs/`
5. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/**`
6. `scripts/runtime-control.sh`
7. `cli/src/**` only when the task is actually CLI behavior

Do not preserve older prose "for history" in active docs.

## Mono-Repo Provenance & Traversal

This repo is the **authoritative source of truth** for the product — edit here; there is no separate upstream. Before editing, know which **role zone** a path plays, so you can judge the blast radius of a change. The full map is [`docs/MONOREPO_PROVENANCE_MAP_V1.md`](./docs/MONOREPO_PROVENANCE_MAP_V1.md); the enforced form is `pnpm check:monorepo-boundary` (`scripts/check-monorepo-boundary.mjs`, `--json` for machine output).

| Zone | Paths | Role |
| --- | --- | --- |
| **core-product** | `cli/` (incl. `cli/src/`, `cli/assets/worker-kits/`, `cli/dist/`), `packages/api-contract/`, `packages/create-growthub-local/` | The published value. Keep backwards-compatible; build-sensitive edits need a `cli/dist` rebuild + freeze/verify. |
| **vendored-runtime** | `server/`, `ui/`, `packages/shared/` | Bundled Paperclip local runtime — required to run a workspace, but **not** the product. Primary stale-code trim target. |
| **orphan** | `packages/db/` (stub used by dist verify) | Leftover; coordinate removal with the dist-verify flow. |
| **scaffolding** | `docs/`, `scripts/`, root contracts, `.github/`, `.githooks/`, `.claude/`, root config | Tooling, contracts, docs, CI. Freely editable. |

Rules:
1. `cli/dist` ships **prebuilt and committed** — a `cli/src/**` edit is not live until `dist` is rebuilt and re-verified (`scripts/agent-dist-verify.sh`, `scripts/check-cli-package.mjs`).
2. Removing/deprecating a worker kit is a **CLI change**: edit `cli/src/kits/catalog.ts` **before** dropping the kit directory, so `dist/index.js` never references a missing kit. Keep `@growthub/cli` + `@growthub/create-growthub-local` backwards-compatible around the workspace.
3. There is **no top-level `apps/`** in this repo. `apps/` is a property of an **exported workspace** (`apps/workspace`); its frozen topology is `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`.
4. Trimming `vendored-runtime` surface must be reachability-gated from `cli/src/commands/run.ts` → bundled `runtime/server` so the local runtime still boots; pair with a `cli/dist` rebuild.

## Runtime And Validation

Use the canonical runtime control surface for this repo. Do not replace it with ad-hoc server/UI loops unless a maintainer explicitly assigns that path.

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

Use `GH_SERVER_PORT` when the API is not on the script default.

For exported governed workspaces, the starter app runtime is scoped to the exported artifact:

```bash
cd <workspace>/apps/workspace
npm install
npm run dev
```

Keep these two runtime lanes separate:

- repo development and PR validation use `scripts/runtime-control.sh`
- exported AWaC workspace smoke tests use the exported `apps/workspace` app

## Growthub Browser QA

For AWaC browser work, the browser-rendered workspace is a source of truth. Use the highest-authority browser surface available in the agent host before claiming UI, helper, workflow, dashboard, login, source refresh, Data Model, API Registry, or production-smoke behavior.

Agent proof order:

1. Attach to the existing in-app browser tab when available.
2. Use the host's first-class browser backend; in Codex this is the in-app browser (`iab`) through `browser-client.mjs`.
3. Use visible CUA actions (`move`, `click`, `type`, `keypress`, `scroll`) for user-visible proof when available.
4. Use read-only DOM or bounded snapshots for browser readback.
5. Corroborate state changes through `/api/workspace`, source records, configured persistence, deployment status, or the documented source of truth.

Required evidence language:

```text
Using Codex IAB via browser-client.mjs.
Backend: iab.
Current URL: <url>.
Visible surface: <route or heading>.
Live action layer: tab.cua.<method>.
Readback layer: tab.playwright.evaluate or DOM snapshot.
```

Do not use a separate Chrome session, OS cursor, or raw endpoint checks as a substitute when the in-app browser is available. Do not print secrets, cookies, bearer values, provider payload credentials, or `.env` values while proving browser state.

## Secondary CLI And Skill Surfaces

The root contract is workspace-first. CLI discovery hubs, hosted-auth commands, harness adapters, marketing skills, Qwen/T3 integrations, and other non-workspace agent lanes are secondary references. Use them only when the user names that lane or the task touches that source.

Pointers:

- `.claude/skills/README.md` — skill catalog and authoring rules.
- `docs/SKILLS_MCP_DISCOVERY.md` — skill/MCP primitive reference.
- `cli/README.md` — CLI-specific usage.
- `scripts/demo-cli.sh cli discover` — local CLI preview when the task is explicitly CLI discovery.

## Governed-workspace primitives (v1.2)

Every worker kit and every governed fork now ships the six architectural primitives declared by `@growthub/api-contract/skills::SkillManifest`:

1. `SKILL.md` — discovery entry (capability-agnostic)
2. Root `AGENTS.md` pointer (this file) with `CLAUDE.md` / `.cursorrules` as pointer stubs
3. `.growthub-fork/project.md` — session memory, seeded at init/import time from the kit's `templates/project.md`
4. `selfEval.criteria[]` + `maxRetries` — bounded generate → apply → evaluate → record loop; every attempt writes to both `project.md` and `trace.jsonl`
5. Nested `skills/<slug>/SKILL.md` — sub-skill lanes for parallel sub-agents
6. `helpers/<verb>.{sh,mjs,py}` — safe shell tool layer

Protocol reference: [`docs/SKILLS_MCP_DISCOVERY.md`](./docs/SKILLS_MCP_DISCOVERY.md). User-facing narrative: [`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/docs/governed-workspace-primitives.md`](./cli/assets/worker-kits/growthub-custom-workspace-starter-v1/docs/governed-workspace-primitives.md) — this file ships into every exported workspace. CLI entry: `growthub skills {list,validate,session {init,show}}`.

## Governed Workspace Topology

When inspecting or editing the official custom workspace starter, use the topology contract before guessing from UI state:

1. `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`
2. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/kit.json`
3. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/growthub.config.json`
4. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js`
5. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-data-model.js`
6. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/route.js`
7. `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/page.jsx`

`dataModel.objects[]` is the governed config-backed object surface. Data Model changes must preserve the `PATCH /api/workspace` validator boundary and must not create widgets or mutate canvas placement as a side effect.

## Sandbox Environment Primitive

The shipped `growthub-custom-workspace-starter-v1` kit includes `objectType: "sandbox-environment"` as a governed Data Model object. It is part of the AWaC runtime topology, not a separate ad-hoc data type.

Sandbox Environment rows:

- define where and how workloads run: `runLocality`, execution adapter, runtime, prompt, instructions, env-key references, network policy, lifecycle status, version, and optional `schedulerRegistryId`
- store secret references only; provider/API keys resolve server-side or through local/hosted authority
- execute through `POST /api/workspace/sandbox-run`
- persist normalized run output into source-record storage and write `lastRunId`, `lastSourceId`, `lastResponse`, and status fields back to the row
- are not View widget sources; selection and binding stay through governed source records

The local agent host adapter is the handoff point for Codex and other local CLIs. Keep its command syntax and stdin prompt/instructions handoff aligned with `apps/workspace/lib/adapters/sandboxes/default-local-agent-host.js`.

Governed agent swarm workflows are sandbox-environment rows with `agent-swarm-v1` orchestration graphs. They are proposed by the helper, applied through the existing `dataModel` lane, opened through Background Tasks with a thread-bounded focus, executed through the same `sandbox-run` route, and traced in the workflow canvas through node `sandboxRecordRef` values. Do not create a separate swarm object model or fallback redirect path.

## Canonical workspace mutation boundary

A governed workspace has exactly two canonical mutation calls; every agent harness must route through them and never invent a third path:

1. `PATCH /api/workspace` — config mutation, permanently allowlisted to `dashboards`, `widgetTypes`, `canvas`, `dataModel`.
2. `POST /api/workspace/sandbox-run` — all sandbox / agent-swarm execution, including draft proofs via `useDraft: true`.

This boundary is **runtime-enforced**, not advisory. Unknown top-level keys (including full-config bodies and `workspaceSourceRecords`) keep the legacy **400** + `allowed[]` rejection; every surviving body then runs through the mutation policy (`apps/workspace/lib/workspace-patch-policy.js`) before any write — oversized rows/node-configs, history blobs, credential-shaped fields, and direct live-workflow mutations are rejected with **422** + structured `violations[]`. Dry-run any patch with `POST /api/workspace/patch/preflight`, which reports the full set of policy reasons (including the named full-config / sidecar codes) and uses the write path's exact merge step (`applyWorkspaceConfigPatch`), so it can never disagree with the real PATCH. Live workflow state (`orchestrationGraph`/`orchestrationConfig`, `version` bumps, `lifecycleStatus: "live"`, `orchestrationPublishedAt`, `orchestrationDeltas`) is publish-owned: `POST /api/workspace/workflow/publish` is the only draft → live transition, and it verifies the saved draft's successful test against the server-owned run history (`draftSha256` lineage), not against PATCH-writable attestation fields.

Mutations follow the verified protocol: read (`GET /api/workspace`) → preflight → prove (test-source / sandbox-run / `useDraft` run) → publish (PATCH one allowlisted key, or `workflow/publish` for drafts) → confirm the success envelope before any dependent step. Prefer existing governed objects over new code: scheduled jobs, external APIs, data views, and multi-agent workflows are already objects plus these calls. SDK contracts: `@growthub/api-contract/workspace-patch` and `@growthub/api-contract/workspace-outcome`.

**Governed Application Control Plane V1** sits on top: applications are first-class governed entities — one row of the `workspace-app-registry` Data Model object (objectType `app-surface`) per app, referencing its dashboards/workflows/data-sources/APIs by id. `GET /api/workspace/apps` derives per-app health, blockers, next action, app-scoped agent assignment packets, and detected filesystem app surfaces; the Fleet lens (roadmap Item 4, now un-staged — its staging precondition, a runtime surface-metadata source, is this registry) renders the same truth for humans in Workspace Lens and via `swarm-condition?lensId=fleet`. **App scope is runtime-enforced on every governed mutation/execution route** (`x-growthub-app-scope` header → structured `AppScopeViolation` with `repairPlan[]`; `helper/apply` is operator-only under scope; preflight returns the mirroring `appScopeVerdict`) — see the scope matrix in the governed-workspace-mutation card. Registration and edits flow through the normal PATCH lane. SDK: `@growthub/api-contract/workspace-apps`.

Above the firewall sits **Agent Outcome Loop V1**: every mutation lane (direct PATCH, preflight rejections, sandbox runs, workflow publishes, helper applies) emits the same canonical, secret-redacted receipt into the `workspace:agent-outcomes` source-record stream, and `GET /api/workspace/agent-outcomes` returns the stream plus the derived governance summary (blocked attempts, publishes, drafts awaiting test/publish, live rows without proof). Policy rejections carry `repairPlan[]` so agents self-correct instead of looping. Lanes are classified, not bypassed: direct PATCH is `untrusted-direct`, sandbox-run is `execution-proof`, workflow/publish is `server-authoritative`, helper/apply is `governed-proposal` (privileged: human-reviewed, server-built swarm graphs). New sessions read the receipt stream before acting and continue from `nextActions` / `rollbackRef`.

The runtime-verified contract card — exact request/response shapes, observed error envelopes, violation codes, and the row-shape traps (`Name` capital-N identity column, `command` as the executed payload) — is [`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/skills/governed-workspace-mutation/SKILL.md`](./cli/assets/worker-kits/growthub-custom-workspace-starter-v1/skills/governed-workspace-mutation/SKILL.md). It ships inside every exported workspace at `skills/governed-workspace-mutation/SKILL.md`, so first-session agents in any fork find it in the standard traversal. Read it before any workspace-configuration call. Enforcement tests: `scripts/unit-workspace-patch-policy.test.mjs` (policy) and `scripts/e2e-workspace-patch-policy-probe.mjs` (HTTP, adversarial).

## Workspace Helper

The workspace helper is a governed, workspace-grammar-aware planning engine that drafts proposals for dashboards, widgets, API registry rows, and custom business objects. It operates in propose-only mode — mutations require an explicit apply step.

**Helper CLI surface (`growthub workspace helper`):**

```bash
# Query — no writes, returns proposals[]
growthub workspace helper query --intent <intent> --prompt "<brief>" [--json > proposals.json]

# Apply — validates + writes accepted proposals
growthub workspace helper apply --proposal-file proposals.json [--yes]

# Receipt history (fine-tune loop seeding)
growthub workspace helper receipts [--limit 25]
```

Intents: `build_dashboard` | `create_widget` | `register_api` | `create_object` | `edit_view` | `repair` | `explain` | `swarm`

**Helper API surface (requires running workspace dev server):**

- `POST /api/workspace/helper/query` — returns `{ summary, proposals[], warnings[], receipts }` (no writes)
- `POST /api/workspace/helper/apply` — validates + applies proposals, returns `{ applied[], skipped[], workspaceConfig }`
- `GET /api/workspace/helper/receipts` — apply receipt history

**Boundaries:** The PATCH allowlist (`dashboards`, `widgetTypes`, `canvas`, `dataModel`) is the hard ceiling. Credentials never enter the prompt. Every apply appends a receipt to source-records. See `docs/WORKSPACE_HELPER_CONTRACT_V1.md` for the full contract.

## Worker-kit workspace convention

Every worker kit with a local fork or tool clone uses the uniform env-var convention: `${<KIT>_HOME:-$HOME/<default>}`. The canonical var per kit is tabulated in `.claude/skills/growthub-worker-kits/SKILL.md`. Legacy env-var names (e.g. `<KIT>_FORK_PATH`) remain accepted by setup scripts as aliases, but docs and new code should emit only the canonical `<KIT>_HOME` form. Kit exports use `${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}`. Never hardcode `/Users/<name>/…` or `/home/<name>/…` inside kit docs, templates, or fixtures.

Authoring rules and conventions are documented in `.claude/skills/README.md`. Add new skills there rather than widening any existing one.

## Checks

Use checks that match the change:

- Docs-only: `git diff --check`, plus exact readback of changed sections.
- Version/package docs: `node scripts/check-version-sync.mjs` and `node scripts/check-cli-package.mjs`.
- Workspace app changes: run the exported `apps/workspace` surface and verify browser plus `/api/workspace`.
- CLI source changes: install dependencies, then run the focused CLI type/test commands from `cli/README.md` or `docs/AGENT_DIST_REBUILD_GUIDE.md`.

## Contribution Guardrails

- Work in a feature branch or worktree; do not work directly on `main`.
- Branch names must follow: `fix/`, `feat/`, `feature/`, `chore/`, `refactor/`, `docs/`, `ci/`, `test/`, `perf/`, `adapter/`, `sync/`, `cursor/`, or `codex/`.
- Read files before editing.
- Replace stale guidance directly; do not stack corrective notes on top of wrong text.
- Do not improvise raw `pnpm --dir server` + `pnpm --dir ui` as the default path — use `scripts/runtime-control.sh`.
- Do not run `node scripts/worktree-bootstrap.mjs` unless explicitly assigned by a maintainer.
- Use `growthub worktree:make` when you need an isolated DB + port + instance.
- Before push, run `bash scripts/pr-ready.sh`.

Before destructive git commands, run:

```bash
bash scripts/guard.sh check-command "<command>"
```

## Version grounding

- Never cite semver from memory — read `docs/ARTIFACT_VERSIONS.md` and `cli/package.json` on your branch.
- Version bumps (only when source changes ship to npm):
  - `cli/package.json` version +1
  - `packages/create-growthub-local/package.json` version +1
  - dependency pin in `create-growthub-local` must match `cli` version exactly

## CI gates

- `smoke`, `validate`, `verify` — all three must pass on CI.
- `node scripts/release-check.mjs` must pass locally before merge.
- After merge: run `release.yml`, confirm npm versions updated.

## Root agent-contract pointer (primitive #2)

`AGENTS.md` (this file) is the single source of truth for agent behaviour in this repo. `CLAUDE.md` and `.cursorrules` are deterministic pointers to it — when you change agent rules, edit `AGENTS.md` and nothing else. The pointer files are plain-text stubs (not OS-level symlinks) so Windows clones work unchanged; their only job is to route every agent (Claude, Cursor, Codex, Hermes, custom harnesses) to the same authoritative content.
