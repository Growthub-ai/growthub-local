# Mono-Repo Provenance Map V1 — Agent Traversal, Role Boundary & The Apps/Workspace Topology

The single map an agent (or human) reads **first** to understand what this repository is, how its parts relate
to the workspace-export value, and where to act when cleaning up or extending it. It is the mental model the
cleanup roadmap (`WORKSPACE_EXPORT_CLEANUP_ROADMAP_V1.md`) operates on, made concrete and machine-checkable
(`scripts/check-monorepo-boundary.mjs`).

> **Read order for any agent dropped into this repo:** `README.md` → `ARCHITECTURE.md` → **this file** →
> the task-specific doc. This file tells you which role a path plays so you do not, for example, treat the
> vendored Paperclip runtime as if it were the product, or bare-delete a worker kit the CLI catalog still lists.

---

## 1. What this repository is

`growthub-local` is the **authoritative source of truth** for the Growthub Local product — the public,
installable mono-repo. There is **no separate upstream you must edit instead**: changes are made *here*. (A
legacy bidirectional sync with a private monorepo has been removed; it created conflicting, hallucinatory
"edit-it-elsewhere" guidance and is no longer part of the model.)

Two structural facts an agent should know before editing build-sensitive paths:

1. **`cli/dist` ships prebuilt and committed** (~1700 files, incl. the bundled local runtime at
   `cli/dist/runtime/server/`). `cli/package.json#files = ["dist", "assets", "README.md"]` — the published
   `@growthub/cli` runs from that committed `dist`. So a source edit under `cli/src/**` is not live until
   `cli/dist` is rebuilt (`cli/scripts/prepare-bundled-runtime.mjs` + the CLI build) and re-verified
   (`scripts/agent-dist-verify.sh`, `scripts/check-cli-package.mjs`).
2. **`packages/api-contract/dist` is intentionally kept in git** (force-included in `.gitignore`) for release
   tarball checks. Other `dist/` trees are build output.

The rule that governs cleanup: **edit here, then keep the published surface (`@growthub/cli`,
`@growthub/create-growthub-local`, the exported workspace artifact) backwards-compatible.** Build-sensitive
changes (kit removal, runtime trimming) must be paired with a `cli/dist` rebuild + the freeze/verify gates.

---

## 2. Role zones — how each path relates to the export value

Classification is by **product role**, which is what an agent needs in order to traverse and to know the blast
radius of a change. Mirrors `scripts/check-monorepo-boundary.mjs`.

| Zone | Paths | Role | Cleanup stance |
| --- | --- | --- | --- |
| **core-product** | `cli/` (incl. `cli/src/`, `cli/assets/worker-kits/`, `cli/dist/`), `packages/api-contract/` (`@growthub/api-contract` SDK v1), `packages/create-growthub-local/` | The published value: the exporter, the SDK contract, the installer, and the exportable kits. | Keep backwards-compatible. Changes here are first-class but gated by dist rebuild + freeze. |
| **vendored-runtime** | `server/` (`@paperclipai/server`), `ui/`, `packages/shared/` (`@paperclipai/shared`) | The bundled **local runtime** (`ARCHITECTURE.md §Main Surfaces`). Real and required to run a workspace locally, but it is the Paperclip backend, **not** the product the README sells. | Primary trim target: surface the workspace export value never reaches is removable, reachability-gated. |
| **orphan** | `packages/db/` (a near-empty `tickets` schema stub, referenced only by `scripts/agent-dist-verify.sh` + dist-rebuild docs) | Derived/leftover. | Removal must be coordinated with the dist-verify flow; not a bare delete. |
| **scaffolding** | `docs/`, `scripts/`, root contracts (`README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.cursorrules`), `.github/`, `.githooks/`, `.claude/`, root config (`package.json`, `tsconfig*`, `vitest.config.ts`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`) | Tooling, contracts, docs, CI. | Freely editable here; keep docs aligned (`ARCHITECTURE.md` Documentation Contract). |

---

## 3. The core value (what the whole repo exists to ship)

Straight from `README.md` — three published artifacts and their inputs:

| Artifact | Path |
| --- | --- |
| `@growthub/cli` | `cli/` |
| `@growthub/create-growthub-local` | `packages/create-growthub-local/` |
| `@growthub/api-contract` (SDK v1, `1.5.0`) | `packages/api-contract/` |
| Exportable inputs | `cli/assets/worker-kits/*` (ship via the CLI's `files: ["assets"]`) |

The export value chain (the canonical journey, `ARCHITECTURE.md §Core Intent`):

```
source (repo / skill / starter / kit)
  → growthub starter / kit download   (cli/src/starter/init.ts, scripts/export-worker-kit.mjs)
  → governed workspace artifact         (cli/assets/worker-kits/growthub-custom-workspace-starter-v1)
  → .growthub-fork/ canonical state · apps/workspace builder
  → customize → safe sync → optional hosted authority
```

The worker-kit catalog the CLI lists/downloads is `cli/src/kits/catalog.ts` (skills catalog:
`cli/src/skills/catalog.ts`). **Removing or deprecating a kit is a CLI change: edit the catalog first, then drop
the kit directory under `cli/assets/worker-kits/`,** so `dist/index.js` never references a missing kit. Rebuild
`cli/dist` and re-run `scripts/agent-dist-verify.sh` + `scripts/check-cli-package.mjs` to hold backwards-compat.

---

## 4. The apps/ directory model (it is not at the repo root)

There is **no top-level `apps/` in this repository.** `apps/` is a property of an **exported workspace**, not of
the mono-repo. An agent that goes looking for `apps/` at the repo root is in the wrong place.

```
# In the repo                                # In an EXPORTED workspace (the artifact)
cli/assets/worker-kits/                      <workspace>/
  growthub-custom-workspace-starter-v1/        ├── growthub.config.json      (V1 contract)
    apps/workspace/   ← the Next.js builder    ├── apps/workspace/            ← no-code builder + /api/workspace
  growthub-agency-portal-starter-v1/           │     ├── app/                 Next.js app router
    apps/agency-portal/                        │     └── lib/workspace-*.js   validator · config · adapters
  ui/src/apps/  ← Paperclip web app roots      ├── .growthub-fork/            governed canonical state
  (dx-root.tsx, gtm-root.tsx) — RUNTIME        └── SKILL.md · AGENTS.md · helpers/ · skills/
```

- The **product** `apps/` is `apps/workspace` inside the custom-workspace starter (and `apps/agency-portal` in
  the agency kit). Its full topology, file-by-file authority, and the `PATCH /api/workspace` mutation boundary
  are specified in **`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`** — that document is the optimal-form workspace
  topology and is **frozen**.
- `ui/src/apps/` (`dx-root`, `gtm-root`) are the **vendored** Paperclip SPA roots — local runtime, not the
  exported product. Do not conflate them with the workspace `apps/`.

---

## 5. Stale-code cleanup — scope and order (all done here)

The cleanup goal — *remove stale code outside the core-value mental model, keep the workspace optimal, keep
`@growthub/cli` + `@growthub/create-growthub-local` backwards-compatible* — is executed in this repo:

- [x] **Decouple the legacy private-monorepo sync** (`scripts/sync-from-monorepo.sh`, the `sync:monorepo`
      script, `pnpm-workspace.upstream.yaml`, `.github/workflows/sync-to-monorepo.yml`). This was the
      conflicting "edit-elsewhere" coupling; growthub-local is the source of truth. **Done.**
- [ ] **Trim the `vendored-runtime` surface the export value never reaches** — candidate families in
      `server/src/routes/{tickets,issues,board-claim,...}` + their services, plugin-host internals with no
      workspace caller, and the matching `ui/src/pages/*`. Gate each removal on a reachability trace from
      `cli/src/commands/run.ts` → bundled `runtime/server`, so the local runtime an exported workspace uses
      still boots. Pair with a `cli/dist` rebuild.
- [ ] **Deprecate/remove old non-workspace worker kits via `cli/src/kits/catalog.ts` first**, then drop the kit
      directory — catalog edit before asset removal, so `dist/index.js` never trips on a missing kit.
- [ ] **Reconcile the dead workspace globs** (`packages/adapters/*`, `packages/plugins/*`,
      `packages/plugins/examples/*` in `pnpm-workspace.yaml`, and the matching `cli/esbuild.config.mjs` alias
      list) against what actually exists in this repo.
- [ ] **Reconcile owned-doc drift** (e.g. `WORKSPACE_BUILDER_RUNTIME_V1.md` + `_V1_1.md`) into current +
      superseded markers, per `ARCHITECTURE.md`'s Documentation Contract — without breaking `README.md` links.

Invariant for every change: **`growthub kit download growthub-custom-workspace-starter-v1` keeps producing a
byte-identical, frozen workspace artifact** (`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`), and `growthub` (local
runtime) keeps booting. Run `pnpm freeze:check` + the kernel checks around every change.

---

## 6. How this is enforced

`scripts/check-monorepo-boundary.mjs` (wired as `pnpm check:monorepo-boundary`) is the machine-readable form of
this map. It:

1. classifies every top-level path into `core-product` / `vendored-runtime` / `orphan` / `scaffolding` and flags
   anything **unclassified** (a new path nobody mapped),
2. verifies that script invocations (`node scripts/…`, `bash scripts/…`) and relative doc links in `docs/` and
   `scripts/` resolve to files that exist — failing on a true dangling reference,
3. **reports** (does not fail on) dead `pnpm-workspace.yaml` globs that resolve to nothing.

`--json` emits the full classification for agent consumption. Errors (dangling refs, unclassified paths) exit
non-zero. This is the gate the roadmap's Phase 3 promotes to required CI.
