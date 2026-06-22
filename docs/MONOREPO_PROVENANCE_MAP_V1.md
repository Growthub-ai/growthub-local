# Mono-Repo Provenance Map V1 — Agent Traversal, Role Boundary & The Apps/Workspace Topology

The single map an agent (or human) reads **first** to understand what this repository is, how its parts relate
to the workspace-export value, and where to act when cleaning up or extending it. It is the mental model the
cleanup roadmap (`WORKSPACE_EXPORT_CLEANUP_ROADMAP_V1.md`) operates on, made concrete and machine-checkable
(`scripts/check-monorepo-boundary.mjs`).

> **Read order for any agent dropped into this repo:** `README.md` → `ARCHITECTURE.md` → **this file** →
> the task-specific doc. This file tells you which role a path plays so you do not, for example, treat the
> vendored Paperclip runtime as if it were the product, or bare-delete a worker kit the CLI catalog still lists.

---

## 1. What this repository is — the two-lane model

`growthub-local` (the OSS tree) is where **all source work happens**. It is a deliberate **partial view** of a
larger workspace, and the release model has two lanes — this is documented authoritatively in
[`docs/AGENT_DIST_REBUILD_GUIDE.md`](./AGENT_DIST_REBUILD_GUIDE.md) and
[`docs/RELEASE_DIST_REBUILD_WORKFLOW.md`](./RELEASE_DIST_REBUILD_WORKFLOW.md); read those before touching
anything build-sensitive.

| Lane | Contains | Can rebuild `cli/dist`? | Who works here |
| --- | --- | --- | --- |
| **OSS tree** (this repo) | `cli/`, `server/`, `packages/shared`, `packages/db/src/**`, `packages/api-contract`, `packages/create-growthub-local`, CI gates, docs | ❌ No (adapter/plugin packages absent **by design**) | every agent — **Phase A** |
| **Full workspace** (super-admin private) | OSS tree **+** `packages/adapters/*`, `packages/plugins/*`, `packages/db/package.json` | ✅ Yes | super-admin only — **Phase B** |

Consequences an agent must internalize:

1. **`cli/dist` ships prebuilt and committed** (~1700 files, incl. the bundled runtime at
   `cli/dist/runtime/server/`); the published `@growthub/cli` runs from it. The OSS tree **cannot** rebuild it
   (`cli/esbuild.config.mjs` references the absent adapter/plugin packages). That is expected, not a defect.
2. **Agents own Phase A: source-only changes** in `cli/src/**` (+ tests + lockstep version bump), and **never
   edit or commit `cli/dist/**`.** A source PR that touches `cli/src/**` is flagged *"dist rebuild required in
   Phase B"*; the super-admin rebuilds and commits dist separately. Validate with the six gate scripts (§
   `AGENT_DIST_REBUILD_GUIDE.md` §6) — `bash scripts/agent-dist-verify.sh pre-push`.
3. **`pnpm-workspace.yaml` globs and `cli/esbuild.config.mjs` aliases that resolve to nothing here are
   intentional** full-workspace mirrors. *Never remove or "fill in" them* — Phase B installs against this same
   `pnpm-workspace.yaml`.
4. **`packages/api-contract/dist` is intentionally kept in git** for release tarball checks.

The legacy bidirectional private-monorepo sync (`sync-from-monorepo.sh`, `sync-to-monorepo.yml`) has been
removed — it was the conflicting "edit-it-elsewhere" coupling. The Phase B full workspace simply **tracks OSS
`main`** (`git reset --hard origin/main`); the OSS tree is the source-of-truth lane.

---

## 2. Role zones — how each path relates to the export value

Classification is by **product role**, which is what an agent needs in order to traverse and to know the blast
radius of a change. Mirrors `scripts/check-monorepo-boundary.mjs`.

| Zone | Paths | Role | Cleanup stance |
| --- | --- | --- | --- |
| **core-product** | `cli/` (incl. `cli/src/`, `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/`, `cli/dist/`), `packages/api-contract/` (`@growthub/api-contract` SDK v1), `packages/create-growthub-local/` | The published value: the exporter, the SDK contract, the installer, and the exportable workspace starter. | Keep backwards-compatible. Changes here are first-class but gated by dist rebuild + freeze. |
| **vendored-runtime** | `server/` (`@paperclipai/server`), `packages/shared/` (`@paperclipai/shared`) | Bundled API/runtime support. Real where still reachable, but it is the Paperclip backend, **not** the product the README sells. | Primary trim target: surface the workspace export value never reaches is removable, reachability-gated. |
| **core-product (partial view)** | `packages/db/` (ships only `src/**` here; its `package.json` lives in the full workspace) | A real package shown partially in the OSS tree. | **Not** an orphan — do not delete. |
| **scaffolding** | `docs/`, `scripts/`, root contracts (`README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.cursorrules`), `.github/`, `.githooks/`, `.claude/`, `.agents/`, root config (`package.json`, `tsconfig*`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`) | Tooling, contracts, docs, CI. | Freely editable here; keep docs aligned (`ARCHITECTURE.md` Documentation Contract). |

---

## 3. The core value (what the whole repo exists to ship)

Straight from `README.md` — three published artifacts and their inputs:

| Artifact | Path |
| --- | --- |
| `@growthub/cli` | `cli/` |
| `@growthub/create-growthub-local` | `packages/create-growthub-local/` |
| `@growthub/api-contract` (SDK v1, `1.5.0`) | `packages/api-contract/` |
| Exportable inputs | `cli/assets/worker-kits/growthub-custom-workspace-starter-v1` (ships via the CLI's `files: ["assets"]`) |

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
# In the repo                                      # In an EXPORTED workspace (the artifact)
cli/assets/worker-kits/                            <workspace>/
  growthub-custom-workspace-starter-v1/              ├── growthub.config.json      (V1 contract)
    apps/workspace/   ← the Next.js builder          ├── apps/workspace/            ← no-code builder + /api/workspace
                                                       ├── .growthub-fork/            governed canonical state
                                                       └── SKILL.md · AGENTS.md · helpers/ · skills/
```

- The **product** `apps/` is `apps/workspace` inside the custom-workspace starter. Its full topology,
  file-by-file authority, and the `PATCH /api/workspace` mutation boundary
  are specified in **`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`** — that document is the optimal-form workspace
  topology and is **frozen**.
- The old top-level Paperclip SPA roots were removed; do not reintroduce a repo-root `ui/` app for the
  exported-product path.

---

## 5. Stale-code cleanup — scope and order (all done here)

The cleanup goal — *remove stale code outside the core-value mental model, keep the workspace optimal, keep
`@growthub/cli` + `@growthub/create-growthub-local` backwards-compatible* — is executed in this repo:

- [x] **Decouple the legacy private-monorepo sync** (`scripts/sync-from-monorepo.sh`, the `sync:monorepo`
      script, `pnpm-workspace.upstream.yaml`, `.github/workflows/sync-to-monorepo.yml`). This was the
      conflicting "edit-elsewhere" coupling; the OSS tree is the source-of-truth lane. **Done.**
- [x] **Trim old non-workspace worker kits — Phase A source change.** `cli/src/kits/catalog.ts`, package checks,
      setup/demo surfaces, and tests now keep only `growthub-custom-workspace-starter-v1`; deleted stale
      worker-kit directories and the old starter `studio/` Vite shell. `cli/dist/**` remains untouched; flag
      *"dist rebuild required in Phase B"* before release.
- [ ] **Trim `vendored-runtime` surface the export value never reaches** (`@paperclipai/server`). This is
      a **separate publish path** (`AGENT_DIST_REBUILD_GUIDE.md` §4: server is out of the cli-dist lane).
      Candidate families: `server/src/routes/{tickets,issues,board-claim,...}` + services + matching
      stale UI/page layers, reachability-gated from `cli/src/commands/run.ts` → bundled `runtime/server` so the
      local runtime still boots. Only if the `cli/dist/runtime/server/` payload changes does a cli-dist rebuild
      apply (Phase B).
- [ ] **Reconcile owned-doc drift** (e.g. `WORKSPACE_BUILDER_RUNTIME_V1.md` + `_V1_1.md`) into current +
      superseded markers, per `ARCHITECTURE.md`'s Documentation Contract — without breaking `README.md` links.

> **Not cleanup targets.** The `pnpm-workspace.yaml` globs `packages/adapters/*`, `packages/plugins/*`,
> `packages/plugins/examples/*` and the matching `cli/esbuild.config.mjs` aliases are **intentional**
> full-workspace mirrors (`AGENT_DIST_REBUILD_GUIDE.md` §2). `packages/db` is a partial-view core package. Do
> not delete or "reconcile" any of these.

Invariant for every change: **`growthub kit download growthub-custom-workspace-starter-v1` keeps producing a
byte-identical, frozen workspace artifact** (`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`), and `growthub` (local
runtime) keeps booting. Run the six gate scripts (`bash scripts/agent-dist-verify.sh pre-push`) +
`pnpm freeze:check` around every change.

---

## 6. How this is enforced

`scripts/check-monorepo-boundary.mjs` (wired as `pnpm check:monorepo-boundary`) is the machine-readable form of
this map. It:

1. classifies every top-level path into `core-product` / `vendored-runtime` / `orphan` / `scaffolding` and flags
   anything **unclassified** (a new path nobody mapped),
2. verifies that script invocations (`node scripts/…`, `bash scripts/…`) and relative doc links in `docs/` and
   `scripts/` resolve to files that exist — failing on a true dangling reference,
3. **reports** (does not fail on) any *unexpected* non-existent `pnpm-workspace.yaml` glob — the intentional
   full-workspace globs (`packages/adapters/*`, `packages/plugins/*`, `packages/plugins/examples/*`) are
   recognized and never flagged.

`--json` emits the full classification for agent consumption. Errors (dangling refs, unclassified paths) exit
non-zero. This is the gate the roadmap's Phase 3 promotes to required CI.
