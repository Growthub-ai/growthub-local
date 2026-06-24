# Agentic Product PR Review Loop

How an agent takes a product-facing change in `growthub-local` from prompt to
review-ready **without drifting into internal-platform language or unverified
claims**. This is the loop PR #254 (the workspace UI/UX facelift) followed; it
is the expected loop for any customer-visible workspace change.

The governing principle: **customer-visible value, evidence-backed.** A change
is not "done" because it compiles — it is done when the customer journey it
touches has been exercised against the running, exported workspace.

---

## The loop

```
read reality → implement per surface → validate gates → export + load the app
   → exercise the customer journey → harden from review → ready for review
```

### 1. Read reality first
Before any edit, know what already exists — do not rebuild what is there.

- Read [`docs/MONOREPO_PROVENANCE_MAP_V1.md`](./MONOREPO_PROVENANCE_MAP_V1.md):
  the two-lane model, role zones, and that **`apps/` is a property of an
  *exported* workspace**, not the repo root. Product UI source lives in
  `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace`.
- Read the frozen topology [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md).
  "Frozen" governs the **mutation/authority contract**, not UI polish.
- Confirm the surface you intend to change is the one that actually renders
  (e.g. the live object picker, not a legacy unused component).

### 2. Implement per surface (additive)
- No new runtime, mutation lane, persistence, object type, or PATCH allowlist
  field unless an existing governed pattern already requires it.
- Extend existing primitives (tokens, `StatusPill`, `ToggleField`, the
  metadata graph) instead of forking parallel systems.
- Pure derivations stay pure: no fetch / React / mutation, never throw, bounded
  strings, secrets redacted. **Never fake telemetry** — evidence-only.

### 3. Validate the gates
Run from repo root before pushing:

| Gate | Command |
|------|---------|
| Boundary present | `bash scripts/freeze-check.sh` |
| Version lockstep | `node scripts/check-version-sync.mjs --require-bump-if-source-changed --base origin/main --head HEAD` |
| Worker-kit manifest | `node scripts/check-worker-kits.mjs` |
| Release shape | `node scripts/release-check.mjs` |
| New pure libs | `node --test scripts/unit-<name>.test.mjs` |

Any change under `cli/src`, `cli/assets`, or `server/src` requires a lockstep
bump of `@growthub/cli` **and** `@growthub/create-growthub-local`.

> **Dist note:** the kit ships from `cli/assets` via the package's
> `files: ["assets"]` and is read by `dist/index.js` at export time. An
> **asset-only** change needs **no dist rebuild** — `cli/dist` carries no copy
> of the kit. A dist rebuild is only implicated by `cli/src` changes, and the
> full bundle (`cli/esbuild.config.mjs`) runs in the complete workspace where
> the adapter/db packages exist, not the OSS tree.

### 4. Export + load the application (the documented way)
Do **not** hand-roll `next dev` on an ad-hoc port. Use the canonical script:

```bash
node scripts/export-seed-workspace.mjs        # export → seed → validate → npm install → next dev --webpack
# App URL: http://127.0.0.1:3777
```

It produces a disposable, super-admin-seeded workspace (activation 5/5,
API-registry cockpit spine complete, baseline sandbox run evidence) outside the
repo tree. Use `--no-dev` to materialize + validate without booting. Docs:
[`scripts/export-seed-workspace.md`](../scripts/export-seed-workspace.md).

### 5. Exercise the customer journey
The flagship loop that must work end-to-end:

```
Workspace Map → (click object) Data Model
             → (click workflow) Workflow Canvas
             → run → Run Console timeline → raw proof
```

Confirm both the **data path** (the seeded workspace contains the object /
workflow / source / run-evidence nodes the journey renders, and the
click-through URLs resolve: `/data-model?object=<id>`,
`/workflows?object=<id>&row=<row>&field=orchestrationConfig`) **and** the
**interactive path** (a human clicks each hop in the booted app). Both belong in
the PR body. Headless route/data checks do not substitute for the human
interactive pass — they precede it.

### 6. Harden from review, then mark ready
- Address review hardening items on the same branch; keep the PR **draft**
  until the interactive product smoke is signed off.
- Reply on the PR only to resolve a thread or raise a question — the diff is the
  record. Move out of draft only after the journey is confirmed end-to-end.

---

## Anti-patterns (caught in real reviews)

- Rebuilding a surface that already exists; polishing a legacy unused component
  instead of the rendered one.
- Claiming "live run status" while only a post-hoc timeline exists — scope it
  honestly as a **Run Console timeline**, not canvas node streaming.
- Treating "routes return 200" as "the journey works." It is necessary, not
  sufficient.
- Flagging a dist rebuild for an asset-only change.

---

## See also
- [`scripts/export-seed-workspace.md`](../scripts/export-seed-workspace.md) — export + load the temp workspace
- [`docs/MONOREPO_PROVENANCE_MAP_V1.md`](./MONOREPO_PROVENANCE_MAP_V1.md) — what exists and where to act
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — frozen mutation/authority contract
- [`docs/AGENT_DIST_REBUILD_GUIDE.md`](./AGENT_DIST_REBUILD_GUIDE.md) — Phase A/B dist lanes
