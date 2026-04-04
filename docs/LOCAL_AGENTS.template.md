# Local agent & operator notes (template)

**Public repo files stay neutral.** Put **your** house rules, **your** absolute paths, and **your** extra runbook only in **`LOCAL_AGENTS.md`** at the repo root (see root `.gitignore`). Do **not** put secrets there if anything syncs your workspace; use env vars and `~/.paperclip/...` for credentials.

## Why this file exists

**growthub-local** is the public source-of-truth boundary for the installable local runtime. The **canonical** dev control surface for humans and agents in that repo is **`scripts/runtime-control.sh`** — not ad-hoc `pnpm` loops, not **`worktree-bootstrap.mjs`**, not manual copies into **growthub-core**.

Copy this template to **`LOCAL_AGENTS.md`**, then fill in the sections below.

---

## Purpose of this clone (one paragraph)

-

---

## This clone

- Repo path:
- Default `PAPERCLIP_CONFIG` (if not `~/.paperclip/instances/default/config.json`):
- **`GH_SERVER_PORT`** you use with **`scripts/runtime-control.sh`** (must match real API listener):
- Vite UI (HMR): `http://127.0.0.1:5173` after **`scripts/runtime-control.sh up-main`** (or your branch)

---

## Mental model: how the UI is served

| Mode | Entry | What loads |
|------|--------|------------|
| **Source dev (default in public docs)** | `scripts/runtime-control.sh up-main` (etc.) | `ui/src` via Vite on **5173**; API via `dev:watch` with `VITE_API_ORIGIN` set from **`GH_SERVER_PORT`**. |
| **Bundled static UI (install / `growthub run`)** | `growthub run` / `node cli/dist/index.js run` | Pre-built **`ui-dist`** in the CLI bundle — **not** live `ui/src` edits. |

If something on **`main`** does not show in the browser, first ask which **mode** you are running, then whether **`GH_SERVER_PORT`** matches the API.

---

## How I run things here

- **Source dev (canonical):**

  ```bash
  cd <repo-root>
  GH_SERVER_PORT=<your-api-port> scripts/runtime-control.sh up-main
  scripts/runtime-control.sh status
  ```

- **Stop:**

  ```bash
  scripts/runtime-control.sh stop
  ```

- **Isolated DB + port:** `growthub worktree:make …` — then follow maintainer steps inside that worktree; still **do not** run **`worktree-bootstrap.mjs`** unless a maintainer assigned it.

- **Rebuild static UI** for bundled **`growthub run`** (only when you intentionally test the bundle):

  ```bash
  bash scripts/prepare-server-ui-dist.sh
  node cli/scripts/prepare-bundled-runtime.mjs
  ```

---

## Semver grounding (mirror public rule)

Do **not** hardcode `@growthub/cli` versions in this file as “forever truth.” On each session, read **`cli/package.json`** and **`packages/create-growthub-local/package.json`** on disk — same rule as **`docs/ARTIFACT_VERSIONS.md`**.

---

## Conventions for agents on this machine

- **Commits / pushes:** Agents must **not** `git commit` or `git push` unless you explicitly asked.
- **Branches:** Prefer feature branches or worktrees; avoid rewriting **`main`** without maintainer intent.
- **Anti-patterns:** No **`node scripts/worktree-bootstrap.mjs`**; no manual **growthub-core** copies; no improvised dev servers replacing **`scripts/runtime-control.sh`** unless you explicitly override that in this file.
- **`scripts/guard.sh`:** Destructive git is blocked by design for agents.

---

## Links / references

- Public: `AGENTS.md`, `CONTRIBUTING.md`, `docs/ARTIFACT_VERSIONS.md`
- Internal docs (if any — do not paste secrets):
