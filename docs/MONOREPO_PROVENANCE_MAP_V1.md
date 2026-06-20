# Mono-Repo Provenance Map V1 — Agent Traversal, Ownership Boundary & The Apps/Workspace Topology

The single map an agent (or human) reads **first** to understand what this repository is, which files it may
edit here, which files are mirrored from upstream and must be changed there, and where the workspace-export
value actually lives. It is the mental model the cleanup roadmap
(`WORKSPACE_EXPORT_CLEANUP_ROADMAP_V1.md`) operates on, made concrete and machine-checkable
(`scripts/check-monorepo-boundary.mjs`).

> **Read order for any agent dropped into this repo:** `README.md` → `ARCHITECTURE.md` → **this file** →
> the task-specific doc. This file tells you *where you are allowed to act*. Acting in the wrong zone is the
> single most common way to do work that gets silently reverted.

---

## 1. What this repository is

`growthub-local` is the **public, source-available publish mirror** of the Growthub Local product. It is
**not the build root.** The authoritative build happens in the upstream `growthub-core` monorepo and is
**synced down** here by `scripts/sync-from-monorepo.sh`.

Two hard pieces of evidence, so no agent has to guess:

1. **The CLI cannot be built from this repo.** `cli/esbuild.config.mjs` bundles
   `packages/adapter-utils` and `packages/adapters/*` (claude-local, codex-local, cursor-local, gemini-local,
   opencode-local, pi-local, openclaw-gateway) — **none of which exist in this repo.** They live upstream.
2. **The shipped CLI is committed prebuilt.** `cli/dist/` (~1700 files, including the bundled local runtime at
   `cli/dist/runtime/server/`) is checked in, and `cli/package.json#files = ["dist", "assets", "README.md"]`.
   The published `@growthub/cli` runs from that committed `dist`, not from a local build.

**Consequence (the rule that governs all cleanup):** deleting or editing a *synced* path in this repo is both
**unverifiable** (there is no build here to prove it still works) and **futile** (the next
`sync-from-monorepo.sh` restores it). Stale-code removal in synced zones must be done **upstream in
`growthub-core`**. This repo is where you make the boundary *legible and enforced*, and where you edit the
*owned* surface.

---

## 2. Provenance zones — where an agent may act

| Zone | Paths | Synced from upstream? | May an agent edit here? |
| --- | --- | --- | --- |
| **CORE — owned, published** | `packages/api-contract/` (`@growthub/api-contract` SDK v1), `docs/`, `scripts/`, root contracts (`README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `CONTRIBUTING.md`), `.github/`, `.claude/` | **No** | **Yes** — this is the authoritative copy. |
| **CORE — synced source-of-truth-upstream** | `cli/` (incl. `cli/src/`, `cli/assets/worker-kits/`, `cli/dist/`), `packages/create-growthub-local/` | **Yes** (`copy_dir "cli"`, `copy_dir "packages/create-growthub-local"`) | **No** — edit upstream, then sync. Changes here are clobbered. |
| **VENDORED RUNTIME (Paperclip)** | `server/` (`@paperclipai/server`), `ui/`, `packages/shared/` (`@paperclipai/shared`) | **Yes** (`copy_dir "server"`, `copy_dir "ui"`, `copy_dir "packages/shared"`) | **No** — upstream-owned; `ARCHITECTURE.md §Main Surfaces` calls this the bundled *local runtime*, not the product. |
| **ORPHAN / DERIVED** | `packages/db/` (not in the sync list; a near-empty `tickets` schema stub referenced only by `scripts/agent-dist-verify.sh` + dist-rebuild docs), `pnpm-workspace.upstream.yaml` (a **snapshot** of upstream's `pnpm-workspace.yaml`, written by `sync-from-monorepo.sh` for drift diffing — *intentionally* identical, not duplication-rot) | partial | Only with explicit coordination — these look stale but carry a contract. |

The sync contract, verbatim from `scripts/sync-from-monorepo.sh`:

```
copy_dir  "cli"                          → cli
copy_dir  "server"                       → server
copy_dir  "ui"                           → ui
copy_dir  "packages/shared"              → packages/shared
copy_dir  "packages/create-growthub-local" → packages/create-growthub-local
copy_file "pnpm-workspace.yaml"          → pnpm-workspace.upstream.yaml
```

Anything **not** on the left side of that list is owned here (`packages/api-contract`, `packages/db`, `docs`,
`scripts`, root files).

---

## 3. The core value (what the whole repo exists to ship)

Straight from `README.md` — three published artifacts and their inputs:

| Artifact | Path | Provenance |
| --- | --- | --- |
| `@growthub/cli` | `cli/` | synced; built upstream |
| `@growthub/create-growthub-local` | `packages/create-growthub-local/` | synced; built upstream |
| `@growthub/api-contract` (SDK v1, `1.5.0`) | `packages/api-contract/` | **owned here** (its `dist/` is force-kept in git for tarball checks) |
| Exportable inputs | `cli/assets/worker-kits/*` | synced (ships via the CLI's `files: ["assets"]`) |

The export value chain (the canonical journey, `ARCHITECTURE.md §Core Intent`):

```
source (repo / skill / starter / kit)
  → growthub starter / kit download   (cli/src/starter/init.ts, scripts/export-worker-kit.mjs)
  → governed workspace artifact         (cli/assets/worker-kits/growthub-custom-workspace-starter-v1)
  → .growthub-fork/ canonical state · apps/workspace builder
  → customize → safe sync → optional hosted authority
```

The worker-kit catalog the CLI lists/downloads is `cli/src/kits/catalog.ts` (skills catalog:
`cli/src/skills/catalog.ts`). **Removing or deprecating a kit must update that catalog upstream**, or the CLI
index trips on a kit directory it expects — this is why kit pruning is a CLI/upstream change, never a bare
`rm` of `cli/assets/worker-kits/<kit>` in this mirror.

---

## 4. The apps/ directory model (it is not at the repo root)

There is **no top-level `apps/` in this repository.** `apps/` is a property of an **exported workspace**, not of
the mirror. An agent that goes looking for `apps/` at the repo root is in the wrong place.

```
# In the repo (mirror)                      # In an EXPORTED workspace (the artifact)
cli/assets/worker-kits/                      <workspace>/
  growthub-custom-workspace-starter-v1/        ├── growthub.config.json      (V1 contract)
    apps/workspace/   ← the Next.js builder    ├── apps/workspace/            ← no-code builder + /api/workspace
  growthub-agency-portal-starter-v1/           │     ├── app/                 Next.js app router
    apps/agency-portal/                        │     └── lib/workspace-*.js   validator · config · adapters
  ui/src/apps/  ← Paperclip web app roots      ├── .growthub-fork/            governed canonical state
  (dx-root.tsx, gtm-root.tsx) — VENDORED       └── SKILL.md · AGENTS.md · helpers/ · skills/
```

- The **product** `apps/` is `apps/workspace` inside the custom-workspace starter (and `apps/agency-portal` in
  the agency kit). Its full topology, file-by-file authority, and the `PATCH /api/workspace` mutation boundary
  are specified in **`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`** — that document is the optimal-form workspace
  topology and is **frozen**.
- `ui/src/apps/` (`dx-root`, `gtm-root`) are the **vendored** Paperclip SPA roots — runtime, not the exported
  product. Do not conflate them with the workspace `apps/`.

---

## 5. Stale code: what is in scope here vs. what must go upstream

The cleanup goal — *remove stale code outside the core-value mental model, keep the workspace optimal, keep
`@growthub/cli` + `@growthub/create-growthub-local` backwards-compatible* — splits cleanly along the
provenance boundary:

### 5a. Actionable in THIS repo (owned zones; no clobber, no published-package risk)

- [ ] Keep this provenance map + `scripts/check-monorepo-boundary.mjs` current as the enforced boundary.
- [ ] Reconcile owned-doc drift (e.g. `WORKSPACE_BUILDER_RUNTIME_V1.md` + `_V1_1.md`) into current + superseded
      markers, per `ARCHITECTURE.md`'s Documentation Contract.
- [ ] Treat `pnpm-workspace.upstream.yaml` as a **sync snapshot** (documented above) — do not delete it as a
      "duplicate."
- [ ] `packages/db` orphan stub: do **not** bare-delete (it is referenced by `agent-dist-verify.sh` + dist
      rebuild docs). Its removal is a coordinated upstream + dist-rebuild change.

### 5b. Must be done UPSTREAM in `growthub-core` (synced zones — the real stale mass)

These are the high-volume removals the README's "operational drift" warning points at. Doing them here is
clobbered on next sync, so they are recorded here as the upstream worklist:

- [ ] **Prune `paperclip-only` server/UI surface** the workspace export value never reaches — candidate
      families: `server/src/routes/{tickets,issues,board-claim,companies,org-chart}` and their services,
      plugin-host internals with no workspace caller, and the matching `ui/src/pages/*`. Gate each removal on a
      reachability trace from `cli/src/commands/run.ts` → bundled `runtime/server`, so the local runtime an
      exported workspace uses still boots.
- [ ] **Deprecate/remove old non-workspace worker kits via `cli/src/kits/catalog.ts`** (and `skills/catalog.ts`)
      **first**, then drop the kit directory under `cli/assets/worker-kits/`. Order matters: catalog edit before
      asset removal, so `dist/index.js` never references a missing kit. Rebuild `cli/dist` and re-run
      `scripts/agent-dist-verify.sh` + `scripts/check-cli-package.mjs` to hold backwards-compat.
- [ ] **Reconcile the workspace globs** (`packages/adapters/*`, `packages/plugins/*`,
      `packages/plugins/examples/*`) and the `esbuild.config.mjs` alias list against what actually ships — these
      are upstream-shaped config that resolves to nothing in the mirror; fixing them belongs upstream.

The invariant for every upstream removal: **`growthub kit download growthub-custom-workspace-starter-v1` must
keep producing a byte-identical, frozen workspace artifact** (`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`), and
`growthub` (local runtime) must keep booting. Run `pnpm freeze:check` + the kernel checks around every change.

---

## 6. How this is enforced

`scripts/check-monorepo-boundary.mjs` (wired as `pnpm check:monorepo-boundary`) is the machine-readable form of
this map. It:

1. classifies every top-level path into `core-owned` / `core-synced` / `vendored-runtime` / `orphan` /
   `scaffolding` and flags anything **unclassified** (a new path nobody mapped),
2. verifies that script invocations (`node scripts/…`, `bash scripts/…`) and relative doc links **in the owned
   `docs/` and `scripts/` zones** resolve to files that exist — failing on a true dangling reference,
3. **reports** (does not fail on) upstream-synced anomalies such as the dead workspace globs, since this mirror
   is not where they are fixed.

`--json` emits the full classification for agent consumption. Errors (owned-zone dangling refs, unclassified
paths) exit non-zero; upstream warnings do not. This is the gate the roadmap's Phase 3 promotes to required CI.
