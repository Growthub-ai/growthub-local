# Frozen GTM Knowledge Base State

This document freezes the exact state that produced the working GTM Knowledge Base screen
validated against live `gtm-fresh` instance data on April 1, 2026.

---

## Agent / operator control plane (mandatory context)

- **Canonical source dev:** `scripts/runtime-control.sh` — `up-main`, `up-branch <name>`, `up-pr <n>`, `stop`, `status`, `url`. Set **`GH_SERVER_PORT`** to match the live API listener; **`GH_CONFIG`** / **`GH_LOCAL_ROOT`** when not using script defaults.
- **Anti-patterns:** Do **not** run `node scripts/worktree-bootstrap.mjs` directly (maintainer/automation only). Do **not** substitute ad-hoc `pnpm --dir server` + `pnpm --dir ui` as the default instead of **`scripts/runtime-control.sh`**. Do **not** manually copy sources into **`growthub-core`** for routine validation.
- **Semver:** Treat any version numbers in *this* freeze as **point-in-time**; current published truth is **`cli/package.json`**, **`packages/create-growthub-local/package.json`**, and the installer pin — **`docs/ARTIFACT_VERSIONS.md`** on `main`.
- **Internal contract:** **`ARCHITECTURE.md`** (local-only; not in public git).

---

## Validated Runtime

- runtime host: `http://127.0.0.1:3100`
- data dir: `/Users/antonio/gtm-fresh`
- instance: `default`
- validation target: live embedded Postgres instance state

## Canonical Source Fix

Only these files are canonical source of truth for the runtime recovery:

- `server/src/app.ts`
- `server/src/routes/knowledge-base.ts`

## Why It Was Missing On Screen

The screen was blocked by two concrete source/runtime gaps:

1. the knowledge-base route existed but was not mounted under the GTM API surface
2. the knowledge-base route assumed a `.rows` wrapper that was not guaranteed by the live DB result shape

## Derived Artifacts That Must Match Source Before Publish

- `server/ui-dist/`
- `cli/dist/runtime/server/ui-dist/`
- `cli/dist/runtime/server/dist/`

These artifacts are required for packaged users, but they are not the canonical authoring surface.

## Freeze Rule

Any future sync or release must preserve this ordering:

1. source fix in `growthub-local`
2. validation against `gtm-fresh`
3. rebuild derived artifacts
4. release check
5. version bump if shipping

## Anti-Drift Rule

Do not copy runtime-patched files from `gtm-fresh` back into source repos as the canonical fix.
Use `gtm-fresh` only to validate behavior.
