# Runtime Assumptions — Open Higgsfield Studio v1

This document defines the runtime boundary for this kit.

---

## OVERVIEW

This kit targets a self-contained local working directory used by an agent operating against one of three execution surfaces:

| Mode | When to use | Assumption |
|---|---|---|
| `local-fork` | local checkout of Open Higgsfield AI is available | repo files can be inspected before planning |
| `browser-hosted` | operator uses the hosted browser app | studio behavior follows the public hosted workflow |
| `desktop-app` | operator uses the Electron app | same shared studio substrate, local desktop packaging |

Default planning mode is `local-fork` when a checkout exists. Otherwise use `browser-hosted`.

---

## OPEN HIGGSFIELD AI ASSUMPTIONS

Frozen upstream assumptions for this kit:
- repo exposes four studios: image, video, lip sync, cinema
- browser and desktop workflows both exist
- `packages/studio/src/models.js` is the model source of truth
- Muapi is the reference provider engine
- API auth uses `x-api-key`
- request flow is submit -> poll -> result
- uploads are first-class for image-conditioned and audio-conditioned workflows
- generation history and upload history matter to repeatability

If the local fork differs, the fork wins.

---

## EXECUTION SURFACES

### Local fork

Expected operator flow:
1. inspect `README.md`
2. inspect `packages/studio/src/models.js`
3. inspect `packages/studio/src/muapi.js`
4. inspect relevant studio component
5. prepare prompts, assets, and batch order
6. execute through the local app surface the fork provides

### Browser-hosted

Expected operator flow:
1. open hosted app
2. load or enter API key
3. select studio
4. upload or reuse assets
5. submit prompts in planned order
6. poll and review results
7. save result links and notes into output docs

### Desktop app

Expected operator flow:
1. launch Electron app
2. confirm API key availability
3. select studio
4. reuse locally stored asset history when possible
5. run generation batches
6. collect outputs and review notes

---

## LOCAL STATE ASSUMPTIONS

The upstream repo describes persistent local state for:
- API key storage
- upload history
- generation history
- lip sync pending-job recovery

The agent should treat these as workflow assets:
- prefer reuse before re-upload
- document when history should be checked
- avoid assuming server-side persistence beyond the provider result URL

---

## FRAME ANALYSIS PRIMITIVE

When a local reference video exists, frame extraction can be used for shot planning:

```bash
mkdir -p /tmp/open_higgsfield_frames
ffmpeg -i "/path/to/reference.mp4" -vf fps=1/2 /tmp/open_higgsfield_frames/frame_%04d.jpg
```

Use this only when a local file is available. Do not promise it from a remote social URL alone.

---

## OUTPUT WRITING ASSUMPTION

All deliverables are written as Markdown in:

```text
output/<client-slug>/<project-slug>/
```

The kit does not require its own npm install or custom CLI to be operational.
