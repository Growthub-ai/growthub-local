# Workspace Export Cleanup Roadmap V1 — Stale-Code Pruning & Mono-Repo Optimization Around the Export Value

The boundary this roadmap acts on is **not invented here** — it is the one `README.md` and `ARCHITECTURE.md`
already declare as canonical. Read those two first; this roadmap only operationalizes the delineation they make.

## The delineation (straight from the canonical docs)

`README.md` sells exactly three published artifacts and their inputs, and nothing else:

| Core value (published, actively developed) | Path | What `README.md` says |
| --- | --- | --- |
| `@growthub/cli` | `cli/` | "Primary command surface." The exporter + local runtime + kits + starter. |
| `@growthub/create-growthub-local` | `packages/create-growthub-local/` | "Guided installer." |
| `@growthub/api-contract` | `packages/api-contract/` | "Public contract surface … CMS SDK v1" (`1.5.0`). |
| Exportable inputs | `cli/assets/worker-kits/*` | The custom workspace starter + worker kits the CLI downloads/exports. |

The canonical journey (`ARCHITECTURE.md` §Core Intent) is `source → local workspace → governed fork →
customization → safe sync → optional hosted authority`. The **export value** is that loop: turning a
repo/skill/starter/kit into a governed, deployable workspace artifact.

`ARCHITECTURE.md` §Main Surfaces names the **local runtime (`server` + `ui`)** as a *cooperating layer the CLI
bundles*, controlled by `scripts/runtime-control.sh`. It is real and required to run a workspace locally — but
it is **vendored, not the product**:

- `server/` is literally `@paperclipai/server` (homepage `github.com/paperclipai/paperclip`), ~58K LOC.
- `ui/` is the Paperclip web app, ~60K LOC, 35 pages.
- `packages/shared` is `@paperclipai/shared`; `packages/db` is a near-empty Paperclip schema stub.
- **491** files reference `paperclip`. The tree is synced from upstream via `scripts/sync-from-monorepo.sh`
  (`MONOREPO=growthub-core`), and git shows it is barely edited here (≈1 commit per 60 touches `server/` or
  `ui/`, vs. 43 for `cli/` and 36 for `packages/`).

**That is the line.** The core value is the CLI/installer/SDK/kits export plane. The cleanup-and-optimize target
is the vendored Paperclip runtime that the README does not advertise and that drags an entire upstream product
surface (tickets, issues, board-claim, org-chart, a 20+ file plugin-host, 60+ services, 35 pages) through this
repo even though most of it never serves the workspace-export loop.

`README.md` itself names the symptom this roadmap fixes: *"Open-source freedom often means more maintenance
burden and operational drift."* The mono-repo is carrying that drift in the vendored layer.

No arbitrary timelines. Three phases, sequenced by dependency: draw the boundary from the canonical docs and
measure what the export value actually pulls from the runtime (Phase 1); prune the vendored surface down to that
need and clear the owned-plane stubs (Phase 2); re-center the tree on the published artifacts and lock the
boundary with guards so upstream sync can't re-import dead surface (Phase 3). Each phase compounds on the last.

> **Invariant for the whole roadmap.** Per `ARCHITECTURE.md`: *"The local layer must remain useful without
> hosted connection,"* and the exported workspace contract (`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`, the
> `.growthub-fork/` canonical state, the `PATCH /api/workspace` boundary) is **frozen**. Cleanup may shrink and
> re-bound the vendored runtime and delete owned-plane cruft; it must never change what lands in a user's
> exported workspace or break `growthub` running a workspace locally. Run `pnpm freeze:check` + the kernel
> checks before and after every pruning step.

---

## Phase 1 — Draw the boundary from the docs and measure what the export value actually uses

*The README/ARCHITECTURE delineation is the spec; this phase turns it into a measured map. No deletions — only
classification and reachability tracing, so every cut in Phase 2 is evidence-backed.*

### 1.1 — Classify every top-level path against the canonical delineation

- [ ] Produce `docs/MONOREPO_PROVENANCE_MAP_V1.md`: classify each top-level path as **`core`** (cli, packages/
      api-contract, packages/create-growthub-local, cli/assets/worker-kits), **`vendored-runtime`** (server, ui,
      packages/shared, packages/db), or **`scaffolding`** (scripts, docs, .github, config), citing the README /
      ARCHITECTURE line that justifies the bucket.
- [ ] Tag every `vendored-runtime` path with its `@paperclipai/*` origin and whether `sync-from-monorepo.sh`
      owns it, so "do not hand-edit, fix upstream" is explicit.

### 1.2 — Trace what the export value actually pulls from the vendored runtime

- [ ] The CLI bundles the built server at `cli/dist/runtime/server` and launches it via
      `cli/src/commands/run.ts`. Map the **reachable** server routes/services from that local-runtime entrypoint
      — i.e. what an exported workspace's `apps/workspace` + `growthub` CLI actually call.
- [ ] Split the server's 30 routes / 60+ services and the UI's 35 pages into **`export-reachable`** vs.
      **`paperclip-only`** (tickets, issues, board-claim, org-chart, agency/org surfaces, plugin-host internals
      that no workspace path touches). This reachable set is the keep-list; everything else is a Phase 2
      candidate.

### 1.3 — Make the sync seam and dead config explicit

- [ ] Document the upstream sync contract: `sync-from-monorepo.sh`, `pnpm-workspace.upstream.yaml` (currently
      **byte-identical** to `pnpm-workspace.yaml`), and the workspace globs `packages/adapters/*`,
      `packages/plugins/*`, `packages/plugins/examples/*` that resolve to **nothing** in this repo (they point at
      `@paperclipai/adapter-*` packages that live upstream, not here).
- [ ] Add `scripts/check-monorepo-boundary.mjs`: assert (a) every workspace glob resolves to an existing dir,
      (b) every script/doc/kit reference resolves to an existing target (first expected catch: the deleted
      `smoke-export-swarm-workspace.mjs` still named in `scripts/export-seed-workspace.md`), and (c) no `core`
      path imports a `paperclip-only` surface. Wire it next to `check:cli-package` / `freeze:check` as a report
      (not yet blocking).

**Phase 1 exit:** a provenance map with zero unclassified paths, a measured `export-reachable` keep-list for the
vendored runtime, and a boundary check that reports (does not yet fail) every dead glob, dangling ref, and
core→paperclip leak.

---

## Phase 2 — Prune to the measured boundary

*Delete and dedupe strictly against Phase 1's keep-list and reports. Vendored-runtime cuts go upstream-first
where sync owns the file; owned-plane cuts land here directly. Every removal cites a Phase 1 row.*

### 2.1 — Shrink the vendored runtime to the export-reachable set

- [ ] For each `paperclip-only` route/service/page from 1.2 that no export path reaches, quarantine or strip it
      — **upstream in `growthub-core` first** (since `sync-from-monorepo.sh` will otherwise re-import it), then
      re-sync. Target the obvious non-workspace surfaces first: tickets, issues, board-claim, org-chart, and
      plugin-host internals with no workspace caller.
- [ ] Confirm after each removal that `growthub run` (local runtime) still boots and an exported workspace's
      `apps/workspace` still serves — the runtime stays useful without hosted connection (the ARCHITECTURE
      invariant).

### 2.2 — Resolve the owned-plane stubs and dead config

- [ ] `packages/db` is a near-empty Paperclip schema stub (one `tickets` schema + migrations). Remove it from the
      workspace, or document why it stays — it currently reads as dead weight in the `core` bucket.
- [ ] Delete `pnpm-workspace.upstream.yaml` if 1.3 confirmed it never diverges (or add the divergence contract as
      a header so the duplication is intentional).
- [ ] Remove the non-existent workspace globs (`packages/adapters/*`, `packages/plugins/*`,
      `packages/plugins/examples/*`) — they belong to the upstream monorepo, not this published repo.
- [ ] Fix the `smoke-export-swarm-workspace.mjs` dangling reference in `export-seed-workspace.md`.

### 2.3 — Settle the bundled-dist policy

- [ ] Decide and document the tracked-`dist` policy: root `dist` is git-ignored, `packages/api-contract/dist` is
      intentionally force-kept for tarball checks, but `cli/dist` (incl. the whole bundled `cli/dist/runtime/
      server`) and `server/dist` / `server/ui-dist` are tracked (~1779 files). Untrack the build-on-release ones
      (`git rm -r --cached` + `.gitignore`), keep what release tarball checks genuinely need, and verify via
      `release:check` / `agent-dist-verify.sh`.

### 2.4 — Tidy the owned plane's own legibility (small, compounding)

- [ ] `cli/src/index.ts` is 2620 lines while commands already live in `cli/src/commands/*` (and `starter.ts`'s
      header states "no business logic here"). Extract the remaining inline wiring so `index.ts` is a thin
      registrar — assert identical `growthub --help` and a green CLI suite before/after.
- [ ] Relocate the 32 flat `scripts/unit-*.test.mjs` / `*probe*.mjs` / `*e2e*.mjs` files under
      `scripts/tests/{unit,probe,e2e}/`, updating `vitest.config.ts` globs; keep test names and entry points
      identical.

**Phase 2 exit:** vendored runtime reduced to the export-reachable keep-list (runtime still boots, workspace
still serves), owned-plane stubs and dead globs gone, dist policy applied, `index.ts` a registrar, scripts
relocated. `freeze:check` + kernel checks unchanged → the exported artifact is byte-stable.

### 2.B — If pruning the vendored surface upstream is out of scope (decision gate)

If the team cannot edit `growthub-core` upstream in this cycle, do **not** strip server/ui files in-repo (sync
will clobber them). Instead:

- [ ] Mark the `paperclip-only` surface as **excluded from the published build** (build/release config), so it
      stays for the local runtime but never ships in the CLI tarball or docs — bounding the value without
      fighting the sync. Record this fallback in the provenance map.

---

## Phase 3 — Re-center the tree on the published artifacts and lock the boundary

*A pruned tree re-drifts on the next upstream sync unless the boundary is enforced. Make the published artifacts
the visible center and convert Phase 1's checks into standing gates.*

### 3.1 — Make core-vs-vendored the visible structure

- [ ] Add a "Mono-repo provenance" section to `ARCHITECTURE.md` (the canonical architecture doc) that states the
      `core` / `vendored-runtime` / `scaffolding` buckets and points `server/`+`ui/` at their upstream origin and
      the sync contract — so the delineation the README implies is written down once, authoritatively.
- [ ] Ensure the kit + runtime paths resolve from single canonical constants (one `cli/assets/worker-kits` root,
      one bundled-server path) — no drifting literals.

### 3.2 — Reconcile doc drift around the export value

- [ ] Collapse versioned doc pairs that fork the truth — e.g. `WORKSPACE_BUILDER_RUNTIME_V1.md` +
      `_V1_1.md` — into a current doc plus an explicit superseded marker, per `ARCHITECTURE.md`'s Documentation
      Contract ("if any doc conflicts … update or remove the conflicting section").

### 3.3 — Turn the boundary into a standing CI ratchet

- [ ] Promote `check:monorepo-boundary` to a **required** check beside `check:cli-package` / `check:worker-kits`
      / `freeze:check`: fail the build on any dead workspace glob, dangling reference, `core → paperclip-only`
      import, or re-appearance of a removed surface.
- [ ] Add a `score:monorepo-boundary` (mirroring `score:worker-kits`) reporting the core / vendored / dead-ref
      ratio over time, and run it after `sync-from-monorepo.sh` so an upstream re-import of pruned surface is
      caught immediately rather than silently re-bloating the repo.

**Phase 3 exit:** the published artifacts are the documented center, server/ui are a clearly-bounded vendored
dependency with a written sync contract, doc drift is reconciled, and the boundary is a required CI gate that
upstream sync cannot quietly undo.

---

## Sequencing (by dependency, not dates)

1. **Phase 1** — the README/ARCHITECTURE delineation becomes a measured provenance map + reachability keep-list.
   Ships only docs and a reporting check (zero risk).
2. **Phase 2** — prune the vendored runtime to the keep-list and clear owned-plane stubs/dead config, each cut
   traced to a Phase 1 row; freeze/kernel checks prove the exported artifact never moved. Decision gate 2.B
   covers the "can't touch upstream yet" case.
3. **Phase 3** — write the boundary into `ARCHITECTURE.md` and promote the checks to required CI gates, so the
   clean state survives the next upstream sync.

The through-line: **the README already tells us the core value is the CLI + installer + SDK + exportable kits;
everything paperclip-vendored in `server/`/`ui/`/`shared`/`db` is a runtime dependency, not the product. This
roadmap measures exactly what the export value pulls from that vendored layer, prunes the rest, and locks the
boundary so the mono-repo stops carrying an entire upstream product surface it never ships.** Every cut is
traceable, the frozen workspace contract is preserved, and the end state is a repo whose structure matches what
the README says it is.
