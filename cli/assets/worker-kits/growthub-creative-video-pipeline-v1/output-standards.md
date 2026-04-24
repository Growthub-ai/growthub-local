# Output Standards — Creative Video Pipeline

All pipeline outputs land under:

```
output/<client-slug>/<project-slug>/
├── brief/
│   └── pipeline-brief.md          # Stage 1 deliverable — scene structure, hooks, brand constraints
├── generative/
│   ├── manifest.json              # Artifact list: {id, type, provider, url, localPath, nodeId}
│   ├── *.jpg / *.png              # Generated images (if image nodes were included)
│   └── *.mp4                      # Generated raw video clips from CMS node or BYOK provider
└── final/
    └── final.mp4                  # Stage 3 deliverable — edited, captioned, rendered output
```

## Stage 1 — Brief

Required: `output/<client>/<project>/brief/pipeline-brief.md`

Minimum contents:
- Brand constraints box (from `messaging_guardrails` in brand-kit.md)
- Scene structure table (N scenes)
- Hook variations A–E for Scene 1
- Editing guidelines section
- Optional appendix: AI generation prompts (labeled OPTIONAL)

## Stage 2 — Generative

Required: `output/<client>/<project>/generative/manifest.json`

`manifest.json` shape:
```json
[
  {
    "id": "<nodeId>-<index>",
    "type": "video | image",
    "provider": "growthub-pipeline | veo | fal | runway",
    "nodeId": "<CMS node id or byo>",
    "url": "<artifact URL from growthub or provider>",
    "localPath": "output/<client>/<project>/generative/<filename>",
    "generatedAt": "<ISO timestamp>",
    "prompt": "<exact prompt used>"
  }
]
```

The `growthub-pipeline-normalizer.js` adapter writes this manifest from the CMS `ExecutionEvent` stream. The BYOK path writes the same shape from provider SDK responses.

## Stage 3 — Edit

Required: `output/<client>/<project>/final/final.mp4`

The video-use fork renders to `${VIDEO_USE_HOME}/<project>/edit/final.mp4`. Copy or symlink to `output/<client>/<project>/final/final.mp4` after QA pass.

Supporting artifacts (written to `output/<client>/<project>/final/` by the video-use agent):
- `edit-decision-list.md` — transcript-anchored EDL
- `render-plan.md` — FFmpeg filter graph
- `qa-checklist.md` — twelve production rules checked

## Session persistence

Append to `.growthub-fork/project.md` at the completion of each stage.
