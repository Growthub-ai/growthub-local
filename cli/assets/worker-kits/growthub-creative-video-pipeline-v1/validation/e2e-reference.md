# E2E Reference Validation — Creative Video Pipeline

This is the **reproducible target** for the end-to-end QA preserved in
commit `7eb832d` ("ship creative video pipeline worker kit").

A new operator (human or agent) should be able to follow this document and
re-produce a passing run. If you cannot, the kit is not v1-ready.

**Reference convention:** [`docs/PIPELINE_KIT_CONTRACT_V1.md`](../../../../../docs/PIPELINE_KIT_CONTRACT_V1.md).

---

## Test inputs

| Input | Value |
|---|---|
| Test brand | `brands/growthub/brand-kit.md` (shipped in this kit) |
| Client slug | `growthub` |
| Project slug | `e2e-reference` |
| Adapter mode | `growthub-pipeline` (primary) — see "BYOK variant" below |
| Stage 2 model | `veo-3.1-generate-001` (CMS node `video-generation`) |

---

## Required environment

| Var | Required for | Real key required? |
|---|---|---|
| `CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER=growthub-pipeline` | Stage 2 selection | no — string literal |
| `GROWTHUB_BRIDGE_ACCESS_TOKEN` | Stage 2 hosted execution | yes |
| `GROWTHUB_BRIDGE_BASE_URL` | Stage 2 hosted execution | yes |
| `growthub auth whoami --json` returns OK | Stage 2 pre-flight | yes (run `growthub auth login` first) |
| `VIDEO_USE_HOME` | Stage 3 delegation | yes — must point at a real `video-use` clone |
| `ELEVENLABS_API_KEY` | Stage 3 transcription | yes |

Run `bash helpers/check-pipeline-health.sh` to validate before starting.

---

## Stage 1 — Brief

**Input:** `brands/growthub/brand-kit.md`

**Sub-skill:** `skills/brief-generation/SKILL.md`

**Run:** through the operator (Claude Code, Cursor, etc.) — no shell command.

**Expected output:** `output/growthub/e2e-reference/brief/pipeline-brief.md`

**Acceptance:**

- Brief contains brand-constraints box, scene table, hook variations A–E,
  editing guidelines.
- AI generation prompts appear in the Appendix only — never inline in scene
  blocks.
- `.growthub-fork/project.md` has a "Stage 1 Complete — brief-generation"
  entry.
- `.growthub-fork/trace.jsonl` has a `stage-complete` line for Stage 1
  (and, when v1 trace adoption lands,
  `pipeline_stage_completed`).

---

## Stage 2 — Generate

**Input:** Stage 1 brief.

**Sub-skill:** `skills/generative-execution/SKILL.md`

**Run:**

```bash
bash helpers/check-generative-adapter.sh
bash helpers/run-pipeline.sh '<DynamicRegistryPipeline JSON assembled from brief>'
```

The CLI streams NDJSON `ExecutionEvent` lines (typed by
`@growthub/api-contract`).

**Expected output:** `output/growthub/e2e-reference/generative/manifest.json`

```json
{
  "kitId": "growthub-creative-video-pipeline-v1",
  "adapter": "growthub-pipeline",
  "executionId": "<uuid from complete event>",
  "createdAt": "<iso>",
  "artifacts": [
    { "id": "...", "type": "video", "provider": "veo", "url": "https://...", "prompt": "..." }
  ]
}
```

**Acceptance:**

- `manifest.json` is valid JSON.
- Each entry has `id`, `type`, `provider`, `url`, `prompt`.
- Artifact count matches scene count in Stage 1 brief.
- No API keys appear in any artifact file.
- `.growthub-fork/project.md` has a "Stage 2 Complete — generative-execution"
  entry recording the adapter mode used.

---

## Stage 3 — Edit

**Input:** Stage 2 `manifest.json` + Stage 1 `pipeline-brief.md`.

**Sub-skill:** `skills/video-edit/SKILL.md`

**Run:** via the `VIDEO_USE_HOME` fork. The kit MUST NOT inline video-use
logic. The handoff is `output/growthub/e2e-reference/final/edit-plan.md`.

**Expected output:** `output/growthub/e2e-reference/final/final.mp4`

**Acceptance:**

- `final.mp4` exists and is playable.
- Duration within ±10% of the target declared in the edit plan.
- Audio fades at segment boundaries (~30 ms).
- Subtitles are applied last.
- No secrets appear in any output artifact.

---

## BYOK variant

To re-run with `byo-api-key`:

1. Set `CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER=byo-api-key`.
2. Set `VIDEO_MODEL_PROVIDER` to `veo` | `fal` | `runway`.
3. Set the matching provider key (`GOOGLE_AI_API_KEY` / `FAL_API_KEY` /
   `RUNWAY_API_KEY`).

The Stage 2 `manifest.json` shape is **identical** to the
`growthub-pipeline` adapter — that is the entire point of the adapter
contract.

---

## What can be mocked

| Element | Mockable? | How |
|---|---|---|
| Brand kit | yes | use any `brands/<slug>/brand-kit.md` |
| Stage 1 LLM | yes | the brief stage is operator-driven; any agent can produce it |
| Stage 2 hosted execution | **no** — uses real provider credits |
| Stage 2 BYOK | **no** — uses real provider credits |
| Stage 3 ElevenLabs transcription | **no** — uses real ElevenLabs credits |
| Stage 3 FFmpeg | yes — `video-use` runs locally |

For pure shape validation (no spend), the legacy
`validation-checklist.md` covers the structural checks without
provider calls.

---

## Cross-references

- [`validation-checklist.md`](../validation-checklist.md) — structural QA
- [`docs/pipeline-architecture.md`](../docs/pipeline-architecture.md) —
  kit-local architecture
- [`pipeline.manifest.json`](../pipeline.manifest.json) — machine-readable
  stage map
- [`workspace.dependencies.json`](../workspace.dependencies.json) —
  external `video-use` dependency declaration
