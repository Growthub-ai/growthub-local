# growthub-local — Repo Agent Rules

This is the repo-specific instruction contract for agents working in `growthub-local`.

## Canonical Mental Model

Anchor all docs and guidance to the same user journey described in `README.md`:

`repo / skill / starter / kit -> governed local workspace -> safe customization -> safe sync -> optional hosted authority`

If instructions drift from this model, update or remove them.

## Required Grounding Before Edits

Read, in order:

1. `README.md`
2. `AGENTS.md`
3. `packages/growthub-api-contract/src/` (v1 type contract)
4. `cli/src/index.ts`
5. `cli/src/commands/` (including `environment.ts`, `chat.ts`,
   `authority.ts`, `policy.ts`, `org.ts`, `capability.ts`)
6. `cli/src/runtime/cms-capability-registry/`,
   `cli/src/runtime/streaming-console/`, and
   `cli/src/runtime/node-input-form/`
7. `scripts/runtime-control.sh`

The canonical v1 type contract lives in `@growthub/api-contract`. Do not
introduce parallel copies.

Do not preserve conflicting historical instructions in active docs.

## Runtime Contract

Use the canonical runtime script:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

Use `GH_SERVER_PORT` override when needed.

## Discovery Contract

Primary command surfaces:

- `growthub`
- `growthub discover`

Preview parity command:

```bash
bash scripts/demo-cli.sh cli discover
```

Preview docs must match shipped CLI behavior, not speculative or stale menu trees.

## Non-Negotiables

- Work in a feature branch or worktree, not directly on `main`.
- Replace stale instructions directly; avoid additive "correction layers."
- Do not run `node scripts/worktree-bootstrap.mjs` unless explicitly assigned.
- Before push, run `bash scripts/pr-ready.sh`.

Before destructive git operations:

```bash
bash scripts/guard.sh check-command "<command>"
```
