# Open Higgsfield Studio Operator — Master Skill Doc

**Source of truth for methodology. Read this file completely before beginning any task.**

---

## QUICK REFERENCE TABLE

| Resource | Path |
|---|---|
| Agent operating law | `workers/open-higgsfield-studio-operator/CLAUDE.md` |
| Brand kit template | `brands/_template/brand-kit.md` |
| Growthub example brand kit | `brands/growthub/brand-kit.md` |
| Output contract | `output-standards.md` |
| Runtime assumptions | `runtime-assumptions.md` |
| Fork integration notes | `docs/open-higgsfield-fork-integration.md` |
| Provider adapter layer | `docs/provider-adapter-layer.md` |
| Visual campaign brief | `templates/visual-campaign-brief.md` |
| Studio selection brief | `templates/studio-selection-brief.md` |
| Model selection recommendation | `templates/model-selection-recommendation.md` |
| Shot plan | `templates/shot-plan.md` |
| Prompt matrix | `templates/prompt-matrix.md` |
| Generation batch plan | `templates/generation-batch-plan.md` |
| Asset tracking | `templates/asset-tracking.md` |
| Review QA checklist | `templates/review-qa-checklist.md` |
| Execution handoff | `templates/platform-ready-execution-handoff.md` |
| Frame analysis primitive | `templates/frame-analysis.md` |
| Image prompt template | `templates/prompt-templates/image-generation.md` |
| Video prompt template | `templates/prompt-templates/video-generation.md` |
| Lip sync prompt template | `templates/prompt-templates/lip-sync-generation.md` |
| Cinema prompt template | `templates/prompt-templates/cinema-generation.md` |
| Sample brief | `examples/visual-campaign-brief-sample.md` |
| Sample shot plan | `examples/shot-plan-sample.md` |
| Sample prompt matrix | `examples/prompt-matrix-sample.md` |
| Sample handoff | `examples/platform-ready-handoff-sample.md` |

---

## STEP 0 — BEFORE ANY TASK, ANSWER THESE QUESTIONS

Before producing anything, confirm:

1. Which brand or client is this for?
2. What is the output objective?
3. Which studio is the likely match: image, video, lip sync, or cinema?
4. What assets already exist locally?
5. What execution surface is active: browser, desktop, or local fork?
6. Is the fork repo available for inspection?

If any of these are unknown after the 3-question gate, stop and ask.

---

## STEP 1 — LOAD THE BRAND KIT

Read `brands/<client-slug>/brand-kit.md` if it exists. Otherwise start from `brands/_template/brand-kit.md`.

Extract:
- audience and offer
- visual identity
- brand-safe language
- emotional outcome
- approved phrasing
- no-go claims
- asset library references

This kit inherits the strongest brand-kit primitives from the existing Growthub creative and email kits: identity, audience, positioning, messaging guardrails, approved phrases, CTA language, and deliverables logging.

---

## STEP 2 — CHECK THE WORKING SUBSTRATE

If the user has a local Open Higgsfield fork, inspect it before planning.

### Source-of-truth file order

1. `README.md`
2. `packages/studio/src/models.js`
3. `packages/studio/src/muapi.js`
4. `packages/studio/src/components/ImageStudio.jsx`
5. `packages/studio/src/components/VideoStudio.jsx`
6. `packages/studio/src/components/LipSyncStudio.jsx`
7. `packages/studio/src/components/CinemaStudio.jsx`
8. `components/StandaloneShell.js`
9. `components/ApiKeyModal.js`
10. `electron/`

### What to verify

- Which studios are exposed
- Which models are currently active
- What parameters each model expects
- Whether prompt is required or optional
- Which media inputs are accepted
- How upload history is stored and reused
- How generation history is stored and revisited
- Whether desktop behavior diverges from browser behavior

If the fork cannot be inspected, use the frozen upstream assumptions in this kit and label the output `assumption-based`.

---

## STEP 3 — STUDIO SELECTION LOGIC

Choose the narrowest studio that matches the real job.

| Studio | Use when | Avoid when |
|---|---|---|
| `image` | still concepts, key art, reference frame generation, look dev | motion or audio-driven output is required |
| `video` | text-to-video or image-to-video motion clips are the target | precise talking-head lip sync is the real need |
| `lip-sync` | face performance must follow audio | cinematic camera grammar matters more than mouth sync |
| `cinema` | shot design, lensing, focal length, aperture, and visual language are central | a basic output can be handled by image or video mode alone |

Default to one primary studio. Secondary studios can appear only as fallbacks.

---

## STEP 4 — MODEL SELECTION LOGIC

Open Higgsfield AI uses model and endpoint mappings as the operational core. Selection must be tied to actual capabilities.

For every recommendation, document:
- studio mode
- model class
- endpoint assumption
- prompt requirement
- reference-image count
- aspect ratio options
- duration or resolution options
- likely failure modes
- fallback model

### Required model-selection discipline

1. Prefer the local fork's `models.js` over memory.
2. Match input mode first, then aesthetic.
3. Avoid recommending models that require assets the user does not have.
4. For lip sync, distinguish portrait-image mode from video mode.
5. For cinema, translate camera intent into prompt modifiers and control selections.

---

## STEP 5 — PROMPT PLANNING LOGIC

Prompt work is not free-form writing. It is production planning.

Every prompt set must specify:
- objective
- subject
- environment
- action
- camera language
- composition
- lighting
- texture / material detail
- motion behavior where relevant
- negative prompt or exclusion language when supported
- output constraints

### Mode-specific rules

- `image`: prioritize subject clarity, composition, style lock, and reference usage
- `video`: prioritize motion verb, start state, camera move, continuity, and duration
- `lip-sync`: prioritize performance intent, facial framing, audio sync assumptions, and artifact avoidance
- `cinema`: prioritize lens, focal length, aperture, movement grammar, blocking, and scene beat

Use the frozen prompt templates. Do not invent a new schema unless the use case truly does not fit.

---

## STEP 6 — SHOT PLANNING LOGIC

Shot plans convert abstract goals into executable batches.

Each shot row must include:
- shot id
- narrative purpose
- studio mode
- model target
- input assets
- camera intent
- prompt key
- duration / ratio / resolution
- pass count
- review note

### When to run frame extraction

If the user provides a local reference mp4, use `templates/frame-analysis.md` before finalizing the shot plan.

This kit intentionally reuses the proven frame-analysis primitive from the creative strategist workflow:
- extract frames locally with `ffmpeg`
- identify scene boundaries
- record composition, motion, text rhythm, and pacing
- convert those observations into shot rows and prompt constraints

---

## STEP 7 — GENERATION BATCH LOGIC

Every batch plan must group generations by:
- studio mode
- model
- asset dependency
- aspect ratio
- duration
- priority

This matters because Open Higgsfield AI generation is asynchronous and provider-backed. The operator needs a clear submit order and a clear poll / review loop.

---

## STEP 8 — PROVIDER ADAPTER LOGIC

Muapi is the reference adapter, not the only forever adapter.

All provider assumptions must state:
- provider name
- auth header contract
- submit endpoint pattern
- poll endpoint pattern
- upload flow
- result handling
- fallback behavior when a model is unavailable

Keep adapter language abstract enough that a second provider can fit later without rewriting the kit.

---

## STEP 9 — OUTPUT ORDER

Produce artifacts in this order:

1. Visual campaign brief
2. Studio selection brief
3. Model selection recommendation
4. Shot plan
5. Prompt matrix
6. Generation batch plan
7. Asset tracking
8. Review QA checklist
9. Platform-ready execution handoff

---

## STEP 10 — QUALITY BAR

Good output looks like this:

- grounded in inspected repo files or clearly labeled assumptions
- one primary studio choice with reasoning
- model recommendation tied to endpoint constraints
- prompts ready to paste into Open Higgsfield AI
- shot plan rows mapped to actual inputs and outputs
- generation batches sequenced for async submit/poll workflows
- handoff notes clear enough for browser or desktop execution
- review checklist specific enough to catch model drift, framing errors, lip-sync mismatch, and prompt leakage
