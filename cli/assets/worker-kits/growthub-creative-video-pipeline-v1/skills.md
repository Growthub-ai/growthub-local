# Creative Video Pipeline — Operator Runbook

> **Who this is for:** Any agent operating inside `${CREATIVE_VIDEO_PIPELINE_HOME:-$HOME/creative-video-pipeline}/` and running the three-stage creative video pipeline.
> Read this file fully before starting. Every section is a required step.

---

## QUICK REFERENCE

| What you need | Where to find it |
|---|---|
| This runbook | `skills.md` ← you are here |
| Routing menu | `SKILL.md` |
| Agent contract | `workers/creative-video-pipeline-operator/CLAUDE.md` |
| Brief template | `templates/pipeline-brief.md` |
| Brand kit template | `brands/_template/brand-kit.md` |
| Generative plan template | `templates/generative-plan.md` |
| Edit plan template | `templates/edit-plan.md` |
| Session memory | `.growthub-fork/project.md` |
| Output directory | `output/<client-slug>/<project-slug>/` |
| Adapter contracts | `docs/adapter-contracts.md` |
| Pipeline architecture | `docs/pipeline-architecture.md` |

---

## STAGE 0 — PREPARE

### 0a. Environment check

```bash
bash setup/check-deps.sh
node setup/verify-env.mjs
```

If deps fail, stop and return remediation only. Do not invent API keys or hardcode paths.

### 0b. Verify generative adapter

```bash
bash helpers/check-generative-adapter.sh
```

Prints active adapter (`growthub-pipeline` or `byo-api-key`) and which keys are set.

### 0c. Auth pre-flight (growthub-pipeline adapter only)

```bash
growthub auth whoami --json
```

If not authenticated, run `growthub auth login` before proceeding.

### 0d. Create or load brand kit

```bash
# New client
cp ${CREATIVE_VIDEO_PIPELINE_HOME:-$HOME/creative-video-pipeline}/brands/_template/brand-kit.md \
   ${CREATIVE_VIDEO_PIPELINE_HOME:-$HOME/creative-video-pipeline}/brands/<client-slug>/brand-kit.md

# Existing client
cat ${CREATIVE_VIDEO_PIPELINE_HOME:-$HOME/creative-video-pipeline}/brands/<client-slug>/brand-kit.md
```

Required fields: `client_name`, `slug`, `primary_service`, `tone`, `messaging_guardrails`, `cta_text`, `colors`.

---

## STAGE 1 — BRIEF

Sub-skill: `skills/brief-generation/SKILL.md`

### 1a. Build scene structure

From the brand kit and campaign intent, produce a scene table:

```
Scene 1 — Hook          N variations (A–E), same creative concept
Scene 2 — Problem       consistent across all hook variations
Scene 3 — Solution      consistent across all hook variations
Scene N — CTA           consistent across all hook variations
```

Hook sources (in priority order):
1. `${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/templates/hooks-library/500-winning-hooks.csv` — if the creative-strategist kit is installed
2. Inline hook reasoning from brand kit tone and `approved_phrases`

### 1b. Write the brief

Fill `templates/pipeline-brief.md` and write the output to:

```
output/<client-slug>/<project-slug>/brief/pipeline-brief.md
```

Required sections:
1. Brand constraints box — from `messaging_guardrails`
2. Scene structure table
3. Hook variations A–E for Scene 1
4. Per-scene production notes (visual direction, VO, on-screen text)
5. Editing guidelines
6. Appendix: AI generation prompts (labeled OPTIONAL) — used in Stage 2

### 1c. Append to session memory

```bash
# After completing Stage 1:
# Append to .growthub-fork/project.md with: stage, client, brief path, hook count, scene count
```

**Self-eval unit for Stage 1:** The completed `pipeline-brief.md` for one creative concept.

---

## STAGE 2 — GENERATE

Sub-skill: `skills/generative-execution/SKILL.md`

### 2a. Resolve adapter

```bash
bash helpers/check-generative-adapter.sh
```

### 2b. Build generative plan

Fill `templates/generative-plan.md` with:
- Node bindings (which scenes become video clips, which become images)
- Reference images (if any — as typed data URLs per `@growthub/api-contract` ref spec)
- Provider model choice
- Prompts from Stage 1 brief Appendix

### 2c. Execute — growthub-pipeline path (primary)

```bash
bash helpers/run-pipeline.sh
```

Or directly:

```bash
# Auth pre-flight
growthub auth whoami --json || { echo "Not authenticated. Run: growthub auth login"; exit 1; }

# Execute
growthub pipeline execute '<json-payload>'
```

Pipeline payload shape (`DynamicRegistryPipeline`):
```json
{
  "pipelineId": "<uuid>",
  "executionMode": "hosted",
  "nodes": [
    {
      "nodeId": "video-gen-1",
      "slug": "video-generation",
      "bindings": {
        "videoModel": "veo-3.1-generate-001",
        "prompt": "<scene prompt from brief>",
        "seconds": 8,
        "aspectRatio": "9:16",
        "creativeCount": 1,
        "refs": [
          { "name": "brand_reference", "dataUrl": "data:image/jpeg;base64,<base64>" }
        ]
      }
    }
  ]
}
```

Parse streaming NDJSON output with `isExecutionEvent` from `@growthub/api-contract/events`.

### 2d. Execute — byo-api-key path (secondary)

Set `VIDEO_MODEL_PROVIDER` and the corresponding provider key in `.env`.
The adapter in `lib/adapters/generative/index.js` routes to the correct provider SDK.

### 2e. Write generative manifest

After execution, write `output/<client>/<project>/generative/manifest.json` per `output-standards.md`.

### 2f. Append to session memory

Record: execution id, artifact count, provider used, artifact URLs.

**Self-eval unit for Stage 2:** `manifest.json` with at least one artifact URL per scene in the brief.

---

## STAGE 3 — EDIT

Sub-skill: `skills/video-edit/SKILL.md`

### 3a. Verify video-use fork

```bash
ls "${VIDEO_USE_HOME:-$HOME/video-use}/skills.md" || {
  echo "video-use fork not found. Run: bash setup/clone-fork.sh"
  exit 1
}
```

### 3b. Stage generated clips

Copy/link generated clips from `output/<client>/<project>/generative/` into `${VIDEO_USE_HOME}/<project>/`.

### 3c. Write edit plan

Fill `templates/edit-plan.md` and write to `output/<client>/<project>/final/edit-plan.md`.

Minimum contents:
- Source clips list (from generative manifest)
- Cut strategy aligned to scene structure from brief
- Overlay plan (captions, on-screen text from brief scenes)
- Music direction
- Final duration target

### 3d. Hand off to video-use agent

The video-use agent reads from its `${VIDEO_USE_HOME}/skills.md` runbook. Pass:
1. `output/<client>/<project>/brief/pipeline-brief.md` — scene + VO structure
2. `output/<client>/<project>/final/edit-plan.md` — cut strategy

The video-use fork pipeline:
```
inventory → transcribe (ElevenLabs Scribe) → pack phrase-level transcript
         → EDL generation (word-boundary cuts)
         → render (FFmpeg + overlays)
         → self-eval (up to 3 iterations)
         → final.mp4 at ${VIDEO_USE_HOME}/<project>/edit/final.mp4
```

### 3e. Copy final output

```bash
mkdir -p output/<client>/<project>/final
cp "${VIDEO_USE_HOME}/<project>/edit/final.mp4" output/<client>/<project>/final/final.mp4
```

### 3f. Append to session memory

Record: edit decision count, render duration, final.mp4 path, QA pass status.

**Self-eval unit for Stage 3:** `final.mp4` exists, passes QA checklist, duration matches target.

---

## NON-NEGOTIABLE RULES

1. Stage 1 brief must be sourced from `brand-kit.md` — no brand details from memory.
2. Stage 2 generative execution goes through the adapter contract — never raw API calls outside it.
3. Stage 3 edit delegates to `VIDEO_USE_HOME` fork — never duplicate its pipeline inline.
4. `output/<client>/<project>/` is the single output root — no other write locations.
5. Append to `.growthub-fork/project.md` at every stage boundary.
6. `ELEVENLABS_API_KEY` never appears in any output artifact.
7. Provider API keys never appear in any output artifact.
8. Brief AI generation prompts live in the Appendix only — never inline in scene blocks.

---

## FOLDER STRUCTURE

```
${CREATIVE_VIDEO_PIPELINE_HOME:-$HOME/creative-video-pipeline}/
├── skills.md                        ← this file — read first, every session
├── SKILL.md                         ← routing menu — read before skills.md
├── QUICKSTART.md
├── .env.example
├── workers/
│   └── creative-video-pipeline-operator/CLAUDE.md
├── brands/
│   ├── _template/brand-kit.md
│   ├── growthub/brand-kit.md
│   └── NEW-CLIENT.md
├── templates/
│   ├── pipeline-brief.md
│   ├── generative-plan.md
│   └── edit-plan.md
├── setup/
│   ├── check-deps.sh
│   ├── verify-env.mjs
│   ├── clone-fork.sh
│   └── install-skill.sh
├── helpers/
│   ├── run-pipeline.sh
│   └── check-generative-adapter.sh
├── skills/
│   ├── brief-generation/SKILL.md
│   ├── generative-execution/SKILL.md
│   └── video-edit/SKILL.md
├── docs/
│   ├── adapter-contracts.md
│   ├── pipeline-architecture.md
│   ├── governed-workspace-primitives.md
│   └── vercel-deployment.md
├── output/
│   └── <client-slug>/<project-slug>/{brief/,generative/,final/}
├── studio/                          ← Vite local shell
└── apps/
    └── creative-video-pipeline/     ← Next.js / Vercel app
```
