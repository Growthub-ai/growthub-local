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
| **core-product** | `cli/` (`@growthub/cli` + `cli/assets/worker-kits/*`), `packages/api-contract/` (SDK v1), `packages/create-growthub-local/` | The published value: the exporter, the SDK contract, the installer, the exportable kits. |
| **vendored-runtime** | `server/` (`@paperclipai/server`), `ui/`, `packages/shared/` | The bundled Paperclip **local runtime** — required to run a workspace locally, but not the product. The primary stale-code mass. |
| **orphan / scaffolding** | `packages/db/` (stub); `docs/`, `scripts/`, `.github/`, root contracts | Leftover + tooling/docs/CI. |

The export value chain (`ARCHITECTURE.md §Core Intent`):

```
source → growthub starter / kit download → governed workspace artifact
  (cli/assets/worker-kits/growthub-custom-workspace-starter-v1) → .growthub-fork/ + apps/workspace
  → customize → deploy
```

> **Two facts that gate every cleanup.** (1) `cli/dist` ships **prebuilt and committed** (incl. the bundled
> `cli/dist/runtime/server`); a `cli/src/**` edit is not live until `dist` is rebuilt + re-verified
> (`scripts/agent-dist-verify.sh`, `scripts/check-cli-package.mjs`). (2) The exported-workspace contract
> (`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`, `.growthub-fork/`, `PATCH /api/workspace`) is **frozen**. Cleanup must
> keep `growthub kit download growthub-custom-workspace-starter-v1` producing a byte-identical artifact and keep
> `growthub` booting — run `pnpm freeze:check` + the kernel checks around every change.

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

## Phase 2 — Trim the stale mass (vendored-runtime + old kits), gated by dist + freeze

*Now that the boundary is enforced, remove what the export value never touches. Every removal is reachability-
traced and paired with a `cli/dist` rebuild + freeze verification, so the published CLI and the workspace stay
backwards-compatible.*

### 2.1 — Reachability-trace the vendored runtime

- [ ] Map the server routes/services reachable from the bundled local-runtime entrypoint
      (`cli/src/commands/run.ts` → `cli/dist/runtime/server`) and the `apps/workspace` calls. Split the 30
      routes / 60+ services / 35 UI pages into **export-reachable** (keep) vs **paperclip-only** (remove
      candidates: `tickets`, `issues`, `board-claim`, `org-chart`, plugin-host internals with no workspace
      caller). This keep-list is the contract for 2.2.

### 2.2 — Remove paperclip-only runtime surface

- [ ] Delete the unreachable route/service/page families from `server/` + `ui/`, smallest-blast-radius first.
- [ ] After each removal: rebuild `cli/dist`, confirm `growthub run` (local runtime) still boots and an exported
      `apps/workspace` still serves, and run `pnpm freeze:check`. Revert any removal that perturbs the frozen
      artifact or breaks boot.

### 2.3 — Deprecate/remove old non-workspace worker kits (CLI-first)

- [ ] Edit `cli/src/kits/catalog.ts` (and `cli/src/skills/catalog.ts`) to drop the deprecated kit **before**
      removing its directory under `cli/assets/worker-kits/`, so `dist/index.js` never references a missing kit.
- [ ] Rebuild `cli/dist`; run `scripts/check-cli-package.mjs`, `scripts/check-worker-kits.mjs`, and the kit
      tests under `cli/src/__tests__/` to hold backwards-compat.

### 2.4 — Reconcile dead config and orphan stubs

- [ ] Remove the dead `pnpm-workspace.yaml` globs (`packages/adapters/*`, `packages/plugins/*`,
      `packages/plugins/examples/*`) and the matching `cli/esbuild.config.mjs` alias entries that resolve to
      nothing in this repo. Verify the CLI build/package still passes.
- [ ] Resolve `packages/db`: remove it together with its `scripts/agent-dist-verify.sh` + dist-rebuild-doc
      references, or document why it stays. No bare delete.

---

## Phase 3 — Lock the boundary so stale code can't re-accrete

- [ ] Promote `check:monorepo-boundary` to a **required** check beside `check:cli-package` / `check:worker-kits`
      / `freeze:check`: fail on unclassified paths, dangling references, and (escalated to error once 2.4 lands)
      dead workspace globs.
- [ ] Add `score:monorepo-boundary` (mirroring `score:worker-kits`) reporting the
      core-product / vendored-runtime / orphan ratio over time, so structure health is a tracked trend.
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
