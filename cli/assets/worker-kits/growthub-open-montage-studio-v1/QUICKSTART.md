# Quick Start — Open Montage Studio Worker Kit

This folder is your self-contained agent working directory for OpenMontage video production with GrowthHub CMS node integration.

---

## Step 1 — Point your Working Directory at this folder

**Growthub local (primary):** Open Growthub local and set the **Working Directory** to this folder in your project settings. Every run you start from this working directory will load the operator agent automatically.

**Claude Code (alternative):** Open Claude Code settings and set the **Working Directory** to this folder. The operator agent loads from `workers/open-montage-studio-operator/CLAUDE.md` on session start.

---

## Step 2 — Choose your execution mode

| Mode | What You Need | Best For |
|---|---|---|
| `local-fork` | OpenMontage clone + Python + FFmpeg + Node.js | Full production control, all 52 tools |
| `agent-only` | GrowthHub session or zero-key mode | Quick projects, CMS node generation |
| `hybrid` | GrowthHub session + local FFmpeg | CMS generation + local post-production |

---

## Step 3 — Add your API keys (optional)

```bash
cp .env.example .env
```

Open `.env` and add the keys you have. Every key is optional — more keys = more tools.

**Recommended setup order (cheapest first):**

1. **Pexels + Pixabay** — free stock media (free developer keys)
2. **Google API key** — TTS with 700+ voices (1M chars/month free)
3. **ElevenLabs** — premium TTS (10K chars/month free)
4. **fal.ai** — FLUX images + video generation (~$0.03/image)

**Zero keys is fine.** You still get Piper TTS, free archives, and Remotion composition. Or use GrowthHub CMS nodes for generation.

---

## Step 4 — Verify your setup (optional but recommended)

```bash
node setup/verify-env.mjs
```

Shows which providers are configured and checks for the OpenMontage clone.

---

## Step 5 — Set up OpenMontage clone (local-fork mode only)

```bash
bash setup/check-deps.sh     # Check Python, FFmpeg, Node.js, Git
bash setup/clone-fork.sh     # Clone OpenMontage and run make setup
```

This clones OpenMontage to `~/OpenMontage`, installs all dependencies (Python packages, Remotion, Piper TTS), and verifies the tool registry.

Skip this step if you are using agent-only or hybrid mode.

---

## Step 6 — Connect GrowthHub (CMS node mode)

If you want to use GrowthHub CMS nodes for video/image generation:

```bash
growthub auth:login
```

This authenticates your session so the agent can discover and execute CMS nodes. CMS node costs flow through your GrowthHub billing.

Skip this step if you are using local-fork mode with direct API keys only.

---

## Step 7 — Start a new session

**Growthub local:** Start a new run from this working directory. The agent loads automatically.

**Claude Code:** Open a new session with this folder as the Working Directory. The agent reads `skills.md` and the methodology automatically.

In both cases the agent will:
1. Run the environment gate (check .env, providers, dependencies)
2. Load the methodology and brand context
3. Ask you 3 clarifying questions before generating anything

---

## What you can ask

Copy any of these into your agent session:

- "Make a 60-second animated explainer about how neural networks learn"
- "Create a 30-second cinematic product trailer for a smart water bottle"
- "Make a documentary montage about city life at 4am using real footage only"
- "Turn this YouTube video into 3 differentiated concepts for my brand"
- "Create a TikTok-style explainer about CRISPR gene editing"

---

## First-run checklist

See `validation-checklist.md` for the full pre-session checklist before your first production run.

---

## Creating a brand kit for a new client

See `brands/NEW-CLIENT.md`.
