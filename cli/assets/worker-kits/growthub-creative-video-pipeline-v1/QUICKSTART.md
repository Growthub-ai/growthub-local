# Creative Video Pipeline — Quickstart

This kit is a governed Growthub workspace with three runtime surfaces:

- `studio/` — local-first Vite operator shell.
- `apps/creative-video-pipeline/` — Vercel-ready pipeline dashboard and API key settings.
- Three-stage pipeline: Brief → Generate → Edit.

## 0. Discover, export, and register

```bash
growthub discover
growthub kit list --family studio
growthub kit download growthub-creative-video-pipeline-v1 --out ./creative-video-pipeline --yes
growthub kit fork register ./creative-video-pipeline
growthub kit fork status <fork-id>
```

Natural-language prompt for an agent after export:

```text
Read SKILL.md, skills.md, QUICKSTART.md, docs/adapter-contracts.md, and
workers/creative-video-pipeline-operator/CLAUDE.md. Run setup checks, verify
the generative adapter, and confirm the video-use fork path before starting work.
```

## 1. Verify the governed workspace

```bash
cp .env.example .env
bash setup/check-deps.sh
node setup/verify-env.mjs
```

Set adapter env in `.env`. Defaults are documented in `.env.example`.

## 2. Clone the video-use fork (Stage 3 dependency)

```bash
bash setup/clone-fork.sh
bash setup/install-skill.sh
```

This clones `browser-use/video-use` into `${VIDEO_USE_HOME:-$HOME/video-use}` and installs it as a Claude Code skill.

## 3. Configure the generative adapter

### Option A — Growthub pipeline (primary, recommended)

```bash
growthub auth login
growthub auth whoami
```

In `.env`:
```
CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER=growthub-pipeline
GROWTHUB_BRIDGE_ACCESS_TOKEN=<token from growthub auth>
GROWTHUB_BRIDGE_BASE_URL=<growthub hosted base url>
ELEVENLABS_API_KEY=<your key>
```

### Option B — BYOK

In `.env`:
```
CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER=byo-api-key
VIDEO_MODEL_PROVIDER=veo          # veo | fal | runway
GOOGLE_AI_API_KEY=<your key>      # if VIDEO_MODEL_PROVIDER=veo
ELEVENLABS_API_KEY=<your key>
```

Both options normalize to the same `GenerativeArtifact[]` object shape.

## 4. Run the local Vite shell

```bash
cd studio
npm install
npm run dev
```

Open `http://localhost:5180`. The shell shows the three-stage pipeline status, output viewer, and settings panel.

## 5. Run the Vercel app locally

```bash
cd apps/creative-video-pipeline
npm install
npm run dev
```

Open `http://localhost:3000`. Navigate to `/settings/keys` to configure the generative adapter and API keys.

## 6. Run the pipeline

Follow `skills.md` for the complete three-stage runbook:

```
Stage 1 — Brief      brand-kit.md → scene structure → hooks → pipeline-brief.md
Stage 2 — Generate   growthub pipeline execute OR BYOK → generative/manifest.json
Stage 3 — Edit       video-use fork → EDL → FFmpeg → final/final.mp4
```

## 7. Deploy to Vercel

Use `apps/creative-video-pipeline` as the Vercel project root.

```bash
cd apps/creative-video-pipeline
npm run build
```

Connect to Vercel with root directory `apps/creative-video-pipeline`. Set adapter env per `docs/adapter-contracts.md` and `docs/vercel-deployment.md`.

## 8. Governed operation

Read `SKILL.md`, `skills.md`, and `workers/creative-video-pipeline-operator/CLAUDE.md` before material changes. Record every stage completion to `.growthub-fork/project.md` and `.growthub-fork/trace.jsonl`.
