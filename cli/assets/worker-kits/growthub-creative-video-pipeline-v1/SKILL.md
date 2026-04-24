---
name: growthub-creative-video-pipeline-v1
description: "Chainable worker kit that composes a creative brief, generative image/video via the growthub pipeline or BYOK, and video editing via the video-use fork into a single governed pipeline. Use when the user says: \"creative video pipeline\", \"brief to video\", \"generative video pipeline\", \"fork growthub-creative-video-pipeline-v1\"."
triggers:
  - creative video pipeline
  - brief to video
  - generative video pipeline
  - video content pipeline
  - fork growthub-creative-video-pipeline-v1
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Stage 1 brief is grounded in brand-kit.md — scene structure, hooks, and guardrails sourced from file, not memory.
    - Stage 2 generative execution routes through growthub pipeline execute (primary) or explicit BYOK adapter — no ad-hoc API calls outside the adapter contract.
    - Stage 3 video edit delegates to VIDEO_USE_HOME fork — edit-plan.md is the handoff artifact, final.mp4 lands at output/<client>/<project>/final/.
    - .growthub-fork/project.md is appended to at each stage boundary and self-eval outcome.
    - .growthub-fork/trace.jsonl receives a typed event for each material change.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers:
  - path: helpers/run-pipeline.sh
    description: Auth pre-flight + growthub pipeline execute passthrough
  - path: helpers/check-generative-adapter.sh
    description: Print current adapter mode and which provider keys are set
subSkills:
  - name: brief-generation
    path: skills/brief-generation/SKILL.md
  - name: generative-execution
    path: skills/generative-execution/SKILL.md
  - name: video-edit
    path: skills/video-edit/SKILL.md
mcpTools: []
---

# Creative Video Pipeline — Governed Workspace

Discovery entry and routing menu for `growthub-creative-video-pipeline-v1`. Family: `studio`. Agent contract: `workers/creative-video-pipeline-operator/CLAUDE.md`.

## When to use this skill

When the user's intent matches any trigger above, or when an agent is dropped into a fork whose `.growthub-fork/fork.json` declares `kitId: "growthub-creative-video-pipeline-v1"`.

## Decision tree

```
Fork exists (.growthub-fork/fork.json)?
├── No  → growthub kit download growthub-creative-video-pipeline-v1 --out <path>
│         growthub kit fork register <path>
│
└── Yes → read in this order:
          1. .growthub-fork/project.md          — session memory (primitive #3)
          2. SKILL.md (this file)                — routing menu  (primitive #1)
          3. skills.md                           — operator runbook
          4. workers/creative-video-pipeline-operator/CLAUDE.md  — agent contract
          5. QUICKSTART.md                       — first-run steps
          6. runtime-assumptions.md              — host requirements
          7. .growthub-fork/policy.json          — what you may touch
          8. .growthub-fork/trace.jsonl (tail 20) — recent machine history
```

## Three-stage pipeline

```
Stage 1 — Brief          brand-kit.md → hooks → scene structure
                         output: output/<client>/<project>/brief/pipeline-brief.md

Stage 2 — Generate       growthub pipeline execute (primary)
                         OR BYOK provider adapter (secondary)
                         output: output/<client>/<project>/generative/

Stage 3 — Edit           video-use fork (VIDEO_USE_HOME)
                         ElevenLabs Scribe → EDL → FFmpeg
                         output: output/<client>/<project>/final/final.mp4
```

## Activation

Primary: `growthub pipeline execute` with the `video-generation` CMS node (veo-3.1-generate-001).
Secondary: BYOK path via `CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER=byo-api-key`.

Both normalize to the same `GenerativeArtifact[]` object. The UI shell renders whichever path produced the artifacts.

## The six primitives (same shape across every Growthub worker kit)

1. **`SKILL.md`** — this file.
2. **Symlinked pointer** — repo-root `AGENTS.md` is authoritative.
3. **`.growthub-fork/project.md`** — session memory, seeded at init from `templates/project.md`.
4. **Self-evaluation** — generate → apply → evaluate → record; retry up to `maxRetries` (3); mirrors the Fork Sync Agent loop.
5. **`skills/`** — sub-skill lanes: `brief-generation`, `generative-execution`, `video-edit`.
6. **`helpers/`** — `run-pipeline.sh`, `check-generative-adapter.sh`.

## Related files

- `skills.md` — full 3-stage operator runbook
- `QUICKSTART.md` — first-run steps
- `runtime-assumptions.md` — host requirements (FFmpeg, ElevenLabs, CLI, video-use fork)
- `output-standards.md` — output dir structure
- `docs/adapter-contracts.md` — generative adapter contracts
- `docs/pipeline-architecture.md` — chain composition detail
- `templates/project.md` — session-memory seed
- `templates/self-eval.md` — self-evaluation pattern
