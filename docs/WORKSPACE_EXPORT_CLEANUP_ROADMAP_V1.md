# Workspace Export Cleanup Roadmap V1 — Stale-Code Pruning & Mono-Repo Optimization Around the Export Value

Three-phase, timeline-free, compounding plan for the checkbox item:

- [ ] Clean up stale old code & optimize mono-repo structure around the workspace export value

The boundary it operates on is the one `README.md` + `ARCHITECTURE.md` already declare, made concrete in
[`docs/MONOREPO_PROVENANCE_MAP_V1.md`](./MONOREPO_PROVENANCE_MAP_V1.md) and enforced by
`scripts/check-monorepo-boundary.mjs`. **growthub-local is the authoritative source of truth — all cleanup
happens here.**

## The delineation (from the canonical docs)

| Role | Paths | Relation to the export value |
| --- | --- | --- |
| **core-product** | `cli/` (`@growthub/cli` + `cli/assets/worker-kits/growthub-custom-workspace-starter-v1`), `packages/api-contract/` (SDK v1), `packages/create-growthub-local/` | The published value: the exporter, the SDK contract, the installer, the exportable workspace starter. |
| **vendored-runtime** | `server/` (`@paperclipai/server`), `packages/shared/` | Bundled API/runtime support. Required only where still export-reachable; not the product. |
| **scaffolding** | `docs/`, `scripts/`, `.github/`, root contracts | Tooling/docs/CI. (`packages/db` is a partial-view **core** package, not an orphan.) |

The export value chain (`ARCHITECTURE.md §Core Intent`):

```
source → growthub starter / kit download → governed workspace artifact
  (cli/assets/worker-kits/growthub-custom-workspace-starter-v1) → .growthub-fork/ + apps/workspace
  → customize → deploy
```

> **Two facts that gate every cleanup** (authoritative: `AGENT_DIST_REBUILD_GUIDE.md`). (1) **Two lanes.** This
> OSS tree cannot rebuild `cli/dist` (adapter/plugin packages absent by design). Agents do **Phase A: source-only
> `cli/src/**` changes**, lockstep version bump, six gate scripts — and **never touch `cli/dist/**`**; the
> super-admin rebuilds dist in **Phase B**. Flag *"dist rebuild required in Phase B"* on any `cli/src/**` PR.
> (2) The exported-workspace contract (`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`, `.growthub-fork/`,
> `PATCH /api/workspace`) is **frozen**. Cleanup must keep `growthub kit download
> growthub-custom-workspace-starter-v1` producing a byte-identical artifact and keep `growthub` booting — run
> `bash scripts/agent-dist-verify.sh pre-push` + `pnpm freeze:check` around every change.

No timelines. Three phases, sequenced by dependency: make the boundary legible and enforced (Phase 1); trim the
stale mass against it with dist + freeze gates (Phase 2); lock it so regressions can't re-accrete (Phase 3).

---

## Phase 1 — Make the boundary legible, traversable, and enforced  ✅ shipped

*An agent (or human) cannot clean what it cannot classify. This phase makes the role boundary explicit and
machine-checked, and decouples the conflicting legacy "edit-elsewhere" model. No risk to the product.*

- [x] **Provenance/traversal map** — `docs/MONOREPO_PROVENANCE_MAP_V1.md`: role zones, the export value chain,
      the **apps/ directory model** (`apps/` lives inside an *exported* workspace, not the repo root), the frozen
      workspace-topology pointer, and the cleanup order.
- [x] **Enforced boundary check** — `scripts/check-monorepo-boundary.mjs` (`pnpm check:monorepo-boundary`):
      classifies every top-level path, **fails** on unclassified paths and dangling `docs/`/`scripts/`
      references, **reports** dead `pnpm-workspace.yaml` globs. `--json` for agents.
- [x] **Agent contract** — `AGENTS.md` "Mono-Repo Provenance & Traversal" section: role table, the
      kit-removal-is-a-CLI-change rule, the apps/ topology rule, the dist-rebuild rule.
- [x] **Decoupled the legacy private-monorepo sync** — removed `scripts/sync-from-monorepo.sh`, the
      `sync:monorepo` script, `pnpm-workspace.upstream.yaml`, and `.github/workflows/sync-to-monorepo.yml`. This
      bidirectional coupling was the conflicting "source of truth is elsewhere" model; growthub-local is now
      unambiguously authoritative.

---

## Phase 2 — Trim the stale mass (old kits + vendored-runtime), as Phase A source changes

*Now that the boundary is enforced, remove what the export value never touches — as source-only Phase A changes
validated by the six gate scripts, flagged for the super-admin's Phase B dist rebuild. Agents never edit
`cli/dist/**`.*

### 2.1 — Deprecate/remove old non-workspace worker kits (CLI catalog first) ✅ shipped

- [x] Keep only `growthub-custom-workspace-starter-v1` in `cli/src/kits/catalog.ts`, package checks, setup/demo
      surfaces, and source tests.
- [x] Remove deprecated worker-kit directories plus the old Vite `studio/` shell from the preserved starter.
- [ ] Run `bash scripts/agent-dist-verify.sh pre-push` (six gates incl. `check-worker-kits.mjs`) + focused kit
      tests. Flag *"dist rebuild required in Phase B."* Do **not** touch `cli/dist/**`.

### 2.2 — Reachability-trace the vendored runtime

- [ ] Map the server routes/services reachable from the bundled local-runtime entrypoint
      (`cli/src/commands/run.ts` → `cli/dist/runtime/server`) and the `apps/workspace` calls. Split the 30
      routes / 60+ services / 35 UI pages into **export-reachable** (keep) vs **paperclip-only** (remove
      candidates: `tickets`, `issues`, `board-claim`, `org-chart`, plugin-host internals with no workspace
      caller). This keep-list is the contract for 2.3.

### 2.3 — Remove paperclip-only runtime surface (separate `@paperclipai/server` publish path)

- [x] Delete the top-level Paperclip/Vite `ui/` workspace and generated `server/ui-dist` payload.
- [ ] Delete the remaining unreachable route/service families from `server/src/**`, smallest-blast-
      radius first. Per `AGENT_DIST_REBUILD_GUIDE.md` §4 these are out of the cli-dist lane; a cli-dist rebuild
      applies **only** if the `cli/dist/runtime/server/` payload changes.
- [ ] After each removal confirm `growthub run` still boots and an exported `apps/workspace` still serves; run
      `pnpm freeze:check`. Revert anything that perturbs the frozen artifact or breaks boot.

### 2.4 — Do NOT touch (recorded so no one "cleans" them by mistake)

- The `pnpm-workspace.yaml` globs `packages/adapters/*`, `packages/plugins/*`, `packages/plugins/examples/*`
  and the matching `cli/esbuild.config.mjs` aliases are **intentional full-workspace mirrors** — Phase B
  installs against this same file (`AGENT_DIST_REBUILD_GUIDE.md` §2).
- `packages/db` is a **partial-view core package** (its `package.json` lives in the full workspace), not an
  orphan stub.

---

## Phase 3 — Lock the boundary so stale code can't re-accrete

- [ ] Promote `check:monorepo-boundary` to a **required** check beside `check:cli-package` / `check:worker-kits`
      / `freeze:check`: fail on unclassified paths and dangling references (the intentional full-workspace globs
      stay report-only, never errors).
- [ ] Add `score:monorepo-boundary` (mirroring `score:worker-kits`) reporting the
      core-product / vendored-runtime ratio over time, so structure health is a tracked trend.
- [ ] Reconcile owned-doc drift (e.g. `WORKSPACE_BUILDER_RUNTIME_V1.md` + `_V1_1.md`) into current + superseded
      markers per `ARCHITECTURE.md`'s Documentation Contract — without breaking `README.md` links.
- [ ] Add a "Mono-repo role map" section to `ARCHITECTURE.md` pointing at the provenance map as the canonical
      "where does this file belong" reference.

---

## Sequencing (by dependency, not dates)

1. **Phase 1** (shipped) — the boundary is legible, enforced, and decoupled from the conflicting legacy sync.
2. **Phase 2** — trim the vendored runtime + old kits against the enforced boundary, each cut reachability-traced
   and gated by `cli/dist` rebuild + `freeze:check`.
3. **Phase 3** — promote the checks to required gates so the clean state holds.

The through-line: **growthub-local is the source of truth; the core value is the CLI + SDK + installer + the
exportable workspace kits; the vendored Paperclip runtime is a dependency, not the product. Trim everything the
export value never reaches, keep the published surface and the frozen workspace artifact intact, and lock the
boundary so the mono-repo stays optimal.**
