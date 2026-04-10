# Quick Start — Open Higgsfield Studio Worker Kit

This folder is your self-contained agent working directory for Open Higgsfield AI visual production.

---

## Step 1 — Point your Working Directory at this folder

**Growthub local (primary):** Open Growthub local and set the **Working Directory** to this folder in your project settings. Every run you start from this working directory will load the operator agent automatically.

**Claude Code (alternative):** Open Claude Code settings and set the **Working Directory** to this folder. The operator agent loads from `workers/open-higgsfield-studio-operator/CLAUDE.md` on session start.

---

## Step 2 — Add your MUAPI key

```bash
cp .env.example .env
```

Open `.env` and replace `your_muapi_key_here` with your key from [muapi.ai/dashboard](https://muapi.ai/dashboard).

The agent checks for this key at the start of every session (Step 0 of the workflow). It will not proceed without it.

---

## Step 3 — Verify your key works (optional but recommended)

```bash
node setup/verify-env.mjs
```

Runs a lightweight ping against the Muapi API with your key. Exits 0 on success. Prints a clear error if the key is invalid or unreachable.

---

## Step 4 — Check local dependencies (local-fork mode only)

```bash
bash setup/check-deps.sh
```

Checks for `node`, `npm`, `git`, and `ffmpeg`. All four are required for local-fork execution and frame-analysis workflows.

---

## Step 5 — Boot the local fork (local-fork mode only)

```bash
bash setup/clone-fork.sh
```

Clones the Open Higgsfield AI repo to `~/open-higgsfield-ai`, installs dependencies, and starts the dev server at `http://localhost:3001`. Skip this if you are using browser-hosted or desktop-app mode.

---

## Step 6 — Start a new session

**Growthub local:** Start a new run from this working directory. The agent loads automatically.

**Claude Code:** Open a new session with this folder as the Working Directory. The agent reads `skills.md` and the methodology automatically.

In both cases the agent will ask you 3 clarifying questions before generating anything.

---

## Execution modes

| Mode | When to use |
|---|---|
| `local-fork` | Local checkout running at localhost:3001 |
| `browser-hosted` | Hosted app at muapi.ai/open-higgsfield-ai |
| `desktop-app` | Electron app installed locally |

---

## First-run checklist

See `validation-checklist.md` for the full pre-session checklist before your first generation run.

---

## Creating a brand kit for a new client

See `brands/NEW-CLIENT.md`.
