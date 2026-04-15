# Quick Start — Postiz Social Scheduler Worker Kit

This folder is your self-contained agent working directory for Postiz social media scheduling and content production.

---

## Step 1 — Point your Working Directory at this folder

**Growthub local (primary):** Open Growthub local and set the **Working Directory** to this folder in your project settings. Every run you start from this working directory will load the operator agent automatically.

**Claude Code (alternative):** Open Claude Code settings and set the **Working Directory** to this folder. The operator agent loads from `workers/postiz-social-scheduler-operator/CLAUDE.md` on session start.

---

## Step 2 — Configure your Postiz instance

```bash
cp .env.example .env
```

Open `.env` and configure:
- `POSTIZ_URL` — your Postiz instance URL (default: `http://localhost:5000` for local fork)
- `POSTIZ_API_KEY` — your Postiz API key (if using API-direct mode)

The agent checks for this configuration at the start of every session (Step 0 of the workflow). It will not proceed without it.

---

## Step 3 — Verify your instance is reachable (optional but recommended)

```bash
node setup/verify-env.mjs
```

Runs a lightweight health check against your Postiz instance. Exits 0 on success. Prints a clear error if the instance is unreachable.

---

## Step 4 — Check local dependencies (local-fork mode only)

```bash
bash setup/check-deps.sh
```

Checks for `node`, `npm`, `git`, `docker`, and `docker-compose`. All are required for local-fork execution.

---

## Step 5 — Boot the local fork (local-fork mode only)

```bash
bash setup/clone-fork.sh
```

Clones the Postiz app repo to `~/postiz-app`, runs Docker Compose to start the full stack (app + PostgreSQL + Redis), and waits for the instance to be healthy at `http://localhost:5000`.

Skip this step if you are using browser-hosted or API-direct mode.

---

## Step 6 — Start a new session

**Growthub local:** Start a new run from this working directory. The agent loads automatically.

**Claude Code:** Open a new session with this folder as the Working Directory. The agent reads `skills.md` and the methodology automatically.

In both cases the agent will ask you 3 clarifying questions before generating anything.

---

## Execution modes

| Mode | When to use |
|---|---|
| `local-fork` | Local Postiz instance running via Docker at localhost:5000 |
| `browser-hosted` | Hosted Postiz instance (cloud or self-hosted remote) |
| `api-direct` | Programmatic scheduling via Postiz public API |

---

## First-run checklist

See `validation-checklist.md` for the full pre-session checklist before your first scheduling run.

---

## Creating a brand kit for a new client

See `brands/NEW-CLIENT.md`.
