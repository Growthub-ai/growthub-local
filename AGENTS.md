# growthub-local — Agent Workflow

This file defines agent behavior in this repository. Keep it aligned with `README.md` and the current CLI source.

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

Use the canonical runtime control surface:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

Use `GH_SERVER_PORT` when the API is not on the script default.

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
- `growthub-cms-sdk-v1` — public `@growthub/api-contract` package usage (types, events, manifests, schemas)
- `growthub-kit-fork-authority` — `growthub kit fork` + ed25519-signed authority attestations
- `growthub-t3code-harness` — T3 Code CLI health / prompt / session / profile
- `growthub-marketing-operator` — dispatch marketing intent to the correct skill + framework + template in `growthub-marketing-skills-v1`
- `growthub-worker-kits` — umbrella skill for operating any worker kit: uniform `${<KIT>_HOME}` workspace resolution, QUICKSTART pattern, cross-kit CLI entries

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
- Read files before editing.
- Replace stale guidance directly; do not stack corrective notes on top of wrong text.
- Do not run `node scripts/worktree-bootstrap.mjs` unless explicitly assigned by a maintainer.
- Before push, run `bash scripts/pr-ready.sh`.

Before destructive git commands, run:

```bash
bash scripts/guard.sh check-command "<command>"
```
