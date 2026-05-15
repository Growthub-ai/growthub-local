# growthub-local — Agent Workflow

This file defines agent behavior in this repository. Keep it aligned with `README.md` and the current CLI source.

## Canonical Product Reality

Growthub Local is the reference implementation of **Agent Workspace as Code (AWaC)**.

AWaC means the **workspace is the owned artifact**: a forkable app, `growthub.config.json`, `.growthub-fork/` lifecycle state, Data Model objects, local builder, agent-readable contracts, helper scripts, runtime/deploy checks, and optional hosted authority moving together.

The official topology reference is [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md). If agent guidance conflicts with that topology, update the guidance instead of inventing a side path.

## Canonical Product Mental Model

Growthub Local turns a **repo, skill, starter, or kit** into a governed local environment that can be customized, kept current, and optionally connected to hosted authority.

Use this sequence as the canonical user path:

1. Discover source
2. Create environment
3. Register fork
4. Customize safely
5. Sync safely
6. Optionally connect hosted authority

If any repo doc conflicts with that sequence, update or remove the conflicting doc.

## Source Of Truth Order

When behavior conflicts, use this order:

1. `README.md`
2. `cli/src/index.ts`
3. `cli/src/commands/`
4. `scripts/runtime-control.sh`
5. focused docs in `docs/`

Do not preserve older prose "for history" in active docs.

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

## Discovery Grounding

Primary user discovery entrypoints are:

- `growthub`
- `growthub discover`

For local preview/debug parity, use:

```bash
bash scripts/demo-cli.sh cli discover
```

The preview must mirror the real CLI surface; do not document divergent menu trees.

## Claude Skills

Invokable Claude Code skills for this repo live under `.claude/skills/`. Each `SKILL.md` carries YAML frontmatter (`name`, `description`) and a markdown body, and resolves the CLI through a three-step environment-agnostic ladder (installed binary → `cli/dist/index.js` → `scripts/demo-cli.sh cli`), so they work identically on a maintainer's laptop, CI, or a fresh sandbox with only the source tree.

Catalog:

- `growthub-discover` — enter the discovery hub (`runDiscoveryHub` in `cli/src/index.ts`) and route to any lane
- `growthub-auth` — hosted auth flow (`login` / `whoami` / `logout` + token scripting); pre-flight for every auth-gated skill
- `growthub-pipeline-execute` — headless `growthub pipeline {assemble,validate,execute}` typed by CMS SDK v1
- `growthub-video-generation` — one-true `video-generation` node with correct `refs[].dataUrl` bindings
- `growthub-cms-sdk-v1` — public `@growthub/api-contract` package usage (types, events, manifests, schemas, skills)
- `growthub-kit-fork-authority` — `growthub kit fork` + ed25519-signed authority attestations
- `growthub-t3code-harness` — T3 Code CLI health / prompt / session / profile
- `growthub-marketing-operator` — dispatch marketing intent to the correct skill + framework + template in `growthub-marketing-skills-v1`
- `growthub-worker-kits` — umbrella skill for operating any worker kit: uniform `${<KIT>_HOME}` workspace resolution, QUICKSTART pattern, cross-kit CLI entries

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

Intents: `build_dashboard` | `create_widget` | `register_api` | `create_object` | `edit_view` | `repair` | `explain`

**Helper API surface (requires running workspace dev server):**

- `POST /api/workspace/helper/query` — returns `{ summary, proposals[], warnings[], receipts }` (no writes)
- `POST /api/workspace/helper/apply` — validates + applies proposals, returns `{ applied[], skipped[], workspaceConfig }`
- `GET /api/workspace/helper/receipts` — apply receipt history

**Boundaries:** The PATCH allowlist (`dashboards`, `widgetTypes`, `canvas`, `dataModel`) is the hard ceiling. Credentials never enter the prompt. Every apply appends a receipt to source-records. See `docs/WORKSPACE_HELPER_CONTRACT_V1.md` for the full contract.

## Worker-kit workspace convention

Every worker kit with a local fork or tool clone uses the uniform env-var convention: `${<KIT>_HOME:-$HOME/<default>}`. The canonical var per kit is tabulated in `.claude/skills/growthub-worker-kits/SKILL.md`. Legacy env-var names (e.g. `<KIT>_FORK_PATH`) remain accepted by setup scripts as aliases, but docs and new code should emit only the canonical `<KIT>_HOME` form. Kit exports use `${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}`. Never hardcode `/Users/<name>/…` or `/home/<name>/…` inside kit docs, templates, or fixtures.

Authoring rules and conventions are documented in `.claude/skills/README.md`. Add new skills there rather than widening any existing one.

## Type-Checking & Tests

The `cli` package requires devDependencies installed before type checks or tests will pass. Run `pnpm install` from the repo root first.

```bash
# Source-only type check (excludes __tests__)
pnpm --filter @growthub/cli exec tsc --noEmit

# Test type check (includes __tests__, resolves vitest globals)
pnpm --filter @growthub/cli exec tsc --noEmit -p tsconfig.test.json

# Run all CLI tests
pnpm --filter @growthub/cli exec vitest run
```

Two tsconfig files govern the CLI:

- `cli/tsconfig.json` — production source compilation; excludes `src/__tests__`
- `cli/tsconfig.test.json` — test type-checking only; adds `vitest/globals`, re-includes `__tests__`

Cloud agents blocked on `Cannot find name 'process'` or `Cannot find module 'vitest'` need `pnpm install` run first; after that the devDependencies resolve and both tsconfigs pass cleanly.

## Contribution Guardrails

- Work in a feature branch or worktree; do not work directly on `main`.
- Branch names must follow: `fix/`, `feat/`, `chore/`, `refactor/`, `docs/`, `ci/`, `test/`, `perf/`, `adapter/`, `sync/`, `cursor/`, or `codex/`.
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
