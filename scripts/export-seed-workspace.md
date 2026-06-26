# Export + seed workspace (feature work)

Disposable **temp export** of `growthub-custom-workspace-starter-v1`, pre-seeded to a **super-admin-ready** state for local feature testing. Agnostic — no swarm automation, no product code changes.

**Script:** `scripts/export-seed-workspace.mjs`  
**Seed module:** `scripts/lib/workspace-feature-seed.mjs`

---

## When to use this

| Lane | Command |
|------|---------|
| **Feature work / UI / API testing** (recommended) | `node scripts/export-seed-workspace.mjs` |
| Export only (blank workspace) | `node scripts/export-worker-kit.mjs growthub-custom-workspace-starter-v1 --out <dir>` |
| Seed validation without dev server | `node scripts/export-seed-workspace.mjs --no-dev` |

Use this script when you need a lived-in workspace: onboarding checklist complete, API registry cockpit spine wired, dashboard + widgets, baseline sandbox run evidence, and a linked data source with hydrated sidecar records.

Do **not** use the removed `smoke-export-swarm-workspace.mjs` path — it was swarm-specific and has been deleted.

---

## Quick start (humans)

From repo root:

```bash
node scripts/export-seed-workspace.mjs
```

On success you get:

- **App URL:** `http://127.0.0.1:3777` (or next free port from 3777)
- **Export root:** `${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}/feature-work-<timestamp>/`
- **Workspace app:** `<export>/growthub-custom-workspace-starter-v1/apps/workspace`

Stop the dev server:

```bash
kill <pid printed at end>
# or
pkill -f "next dev"
```

Re-run anytime — each run creates a **new** timestamped directory.

---

## Flags

| Flag | Default | Effect |
|------|---------|--------|
| *(none)* | — | Export → seed → validate → `npm install` → `next dev --webpack` → keep export |
| `--no-dev` | off | Export → seed → validate only; print `cd` + dev instructions |
| `--keep` | **on** | Leave export directory after success |
| `--clean` | off | Remove export directory after success (kills dev server first) |
| `--dry-run` | off | Print plan, no writes |
| `--help` | — | Usage |

---

## What gets seeded (pre-boot)

Written **before** `next dev` starts (same lane as `e2e-workspace-sandbox-api-probe.mjs` — direct filesystem write, not `PATCH /api/workspace`).

| Artifact | Path (under `apps/workspace/`) |
|----------|--------------------------------|
| Workspace config | `growthub.config.json` |
| Source records sidecar | `growthub.source-records.json` |
| Runtime auth stub | `.env.local` (`PROBE_SCHEDULER=feature-seed-stub`) |

The trusted probe registry uses `mock://growthub-feature-seed/run`. The
workspace runner handles that exact transport as a deterministic local feature
seed response so `registry-workflow` can be executed end-to-end without relying
on an external provider during temp-export testing.

### Data model objects

| Object id | Type | Role |
|-----------|------|------|
| `api-registry-probe` | api-registry | Trusted row `probe-scheduler` (tested, connected) + untrusted `probe-untrusted` |
| `probe-scheduler-source` | data-source | Linked to `probe-scheduler`; sidecar records hydrated |
| `sandbox-probe` | sandbox-environment | `probe-local-sbx` (baseline run evidence) + `registry-workflow` (orchestration graph) |

The feature seed does **not** create `workspace-helper-sandbox`; helper setup owns that row at runtime.

### UI / activation

- Dashboard **Ops Overview** with `tabs[].widgets` (3 widgets) — drives **activation** “add widget” step
- `canvas.widgets` (same 3 widgets) — drives **builder** surface
- Sandbox row `probe-local-sbx` has `lastResponse: { exitCode: 0 }` — drives **activation** “run workflow” step

---

## Validation (automatic)

After seeding, the script imports the **exported** kit libs and asserts:

1. **`validateWorkspaceConfig`** — schema passes (exported `lib/workspace-schema.js`)
2. **Activation 5/5** — `deriveWorkspaceActivationState` → `complete: true`
3. **API registry cockpit spine** — `deriveApiRegistryCreationState` for `probe-scheduler`:
   - `register`, `auth`, `test`, `data-source`, `refresh` → **complete**
   - `score: 100`

Grounding (do not invent shapes — edit `workspace-feature-seed.mjs` to match these):

- `scripts/unit-workspace-lenses.test.mjs` — `completeConfig()` activation shape
- `scripts/unit-api-registry-creation-flow.test.mjs` — cockpit spine complete
- `scripts/awac-workspace-api-probe.mjs` — `buildSeedDataModel()` probe objects

---

## Agent contract

1. Run from **repo root**: `node scripts/export-seed-workspace.mjs` (or `--no-dev` if only materializing files).
2. Set working directory to the printed **export root** or `apps/workspace` for app-scoped edits.
3. Treat the temp export as the owned artifact — **do not** seed inside `growthub-local` repo tree or `instances/`.
4. Runtime mutations after boot go through governed APIs (`PATCH /api/workspace`, helper apply, sandbox-run) — not by re-editing seed files mid-session unless resetting.
5. Dev server uses **`next dev --webpack`** (required on darwin/arm64 when native Turbopack bindings are missing).
6. To change baseline shapes, edit **`scripts/lib/workspace-feature-seed.mjs`** only — not `workspace-activation.js` or cockpit derivation in the kit unless the product contract itself changes.

### Smoke-check after boot

```bash
curl -s http://127.0.0.1:3777/api/workspace | head -c 200
curl -s http://127.0.0.1:3777/api/workspace/env-status
# expect configuredEnvRefs includes PROBE_SCHEDULER
```

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `GROWTHUB_KIT_EXPORTS_HOME` | `$HOME/growthub-worker-kit-exports` | Parent dir for `feature-work-<ts>/` runs |
| `WORKSPACE_CONFIG_ALLOW_FS_WRITE` | set in `.env.local` | Allows filesystem persistence in local dev |

---

## Safety

- Refuses to run if target path is inside the repo or `instances/`
- Refuses non-empty reuse of the same run directory
- `SIGINT` / `SIGTERM` kills the dev child and port-scoped `next dev` process
- `--clean` removes only the directory created in that run

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hangs after “starting next dev” | Turbopack without native bindings | Script already passes `--webpack`; ensure you are on current `export-seed-workspace.mjs` |
| Port in use | Previous dev server | `pkill -f "next dev"` then re-run |
| `invalid workspace config` on validate | Seed shape drift vs schema | Fix `workspace-feature-seed.mjs`; run `--no-dev` first |
| Activation not 5/5 in browser | Booted old export | Run script again; use printed URL |
| Cockpit auth pending | Missing `.env.local` or env-status | Re-run script; confirm `PROBE_SCHEDULER` in `configuredEnvRefs` |

---

## Related scripts

- `scripts/export-worker-kit.mjs` — canonical kit export (this script calls it with `--qa`)
- `scripts/e2e-workspace-sandbox-api-probe.mjs` — API probe lane (sandbox-run)
- `scripts/awac-workspace-api-probe.mjs` — AWaC workspace API probe

**Repo runtime (maintainer lane, separate):** `scripts/runtime-control.sh` — not used for exported workspace smoke.
