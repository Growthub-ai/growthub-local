# Quick Start — Twenty CRM Worker Kit

This folder is your self-contained agent working directory for Twenty CRM implementation, enrichment pipeline design, and CRM playbook production.

---

## Step 1 — Point your Working Directory at this folder

**Growthub local (primary):** Open Growthub local and set the **Working Directory** to this folder in your project settings. Every run you start from this working directory will load the Twenty CRM operator agent automatically.

**Claude Code (alternative):** Open Claude Code settings and set the **Working Directory** to this folder. The operator agent loads from `workers/twenty-crm-operator/CLAUDE.md` on session start.

---

## Step 2 — Configure your Twenty credentials

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `TWENTY_API_TOKEN` — your Twenty app token (generate in Twenty Settings > API)
- `TWENTY_API_URL` — your workspace API URL (e.g. `https://api.twenty.com` for cloud, or `http://localhost:3000` for local)

The agent checks for these values at the start of every session (Step 0 of the workflow). It will not proceed without them in API-connected mode. Agent-only mode does not require credentials.

---

## Step 3 — Verify your environment

```bash
node setup/verify-env.mjs
```

Confirms that `TWENTY_API_TOKEN` is set, tests connectivity to the Twenty API, and prints available workspace info. Exits 0 on success.

---

## Step 4 — Check local dependencies

```bash
bash setup/check-deps.sh
```

Checks for `node`, `npm`, `git`, and `docker`. Docker is required for self-hosted mode. All are recommended for local-fork development.

---

## Step 5 — Boot the local fork (local-fork mode only)

```bash
bash setup/clone-fork.sh
```

Clones the Twenty repo to `$HOME/twenty`, installs dependencies, and starts the development environment (PostgreSQL, Redis, and the Twenty server + frontend) via Docker Compose.

Skip this step if you are using Twenty Cloud or have an existing self-hosted deployment.

---

## Step 6 — Start a new session

**Growthub local:** Start a new run from this working directory. The agent loads automatically.

**Claude Code:** Open a new session with this folder as the Working Directory. The agent reads `skills.md` and the methodology automatically.

In both cases the agent will ask you 3 clarifying questions before generating any CRM artifacts.

---

## Execution modes

| Mode | When to use |
|---|---|
| `local-fork` | Local Twenty checkout running via Docker at localhost:3000 |
| `self-hosted` | Twenty deployed on your own infrastructure |
| `cloud` | Twenty Cloud workspace at app.twenty.com |
| `agent-only` | No live Twenty instance — produce planning artifacts only |

---

## First-run checklist

See `validation-checklist.md` for the full pre-session checklist before your first CRM implementation run.

---

## Creating a brand kit for a new client

See `brands/NEW-CLIENT.md`.
