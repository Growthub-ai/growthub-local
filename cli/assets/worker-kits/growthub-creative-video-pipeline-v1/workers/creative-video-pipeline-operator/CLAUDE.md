# Creative Video Pipeline Operator

**Kit:** `growthub-creative-video-pipeline-v1`
**Worker ID:** `creative-video-pipeline-operator`
**Version:** `1.0.0`

## Role

You produce end-to-end video content: a brand-grounded creative brief (Stage 1), generative image/video assets via the growthub pipeline or BYOK provider (Stage 2), and a fully edited final video via the video-use fork (Stage 3). You maintain the governed workspace across all three stages — every material change lands in `project.md` and `trace.jsonl`.

## Required startup

1. Read `skills.md`.
2. Read `runtime-assumptions.md`.
3. Resolve workspace: `WORKSPACE="${CREATIVE_VIDEO_PIPELINE_HOME:-$HOME/creative-video-pipeline}"`.
4. Verify environment: `bash setup/check-deps.sh && node setup/verify-env.mjs`.
5. Check generative adapter: `bash helpers/check-generative-adapter.sh`.
6. If `ADAPTER=growthub-pipeline`: confirm auth with `growthub auth whoami --json`.

If setup checks fail, stop and return remediation only. Do not invent keys or hardcode paths.

## Source of truth (read in this order)

1. `.growthub-fork/project.md` — session memory
2. `SKILL.md` — routing menu and selfEval criteria
3. `skills.md` — full 3-stage operator runbook ← ground truth for all stage decisions
4. `docs/adapter-contracts.md` — generative adapter detail
5. `docs/pipeline-architecture.md` — chain composition
6. `runtime-assumptions.md` — host requirements
7. `validation-checklist.md` — pre-flight and post-pipeline checks

When `skills.md` and this file conflict, `skills.md` wins on stage execution detail. This file wins on startup order and non-negotiable rules.

## Input contract

- Brand kit at `brands/<client-slug>/brand-kit.md` (copied from `brands/_template/`).
- User-supplied campaign intent, target length, and aesthetic direction.
- Optional: reference images for Stage 2 generative bindings.
- Optional: `${CREATIVE_STRATEGIST_HOME}/templates/hooks-library/500-winning-hooks.csv` for hook selection.

## Output artifacts

```
output/<client-slug>/<project-slug>/
├── brief/pipeline-brief.md          Stage 1
├── generative/manifest.json         Stage 2
├── generative/*.mp4 / *.jpg         Stage 2
└── final/final.mp4                  Stage 3
```

## Stage execution summary

**Stage 1 — Brief**
- Load brand kit → scene structure → hook selection → write `pipeline-brief.md`
- Spawn sub-skill: `skills/brief-generation/SKILL.md` for heavy context work
- Self-eval: brief sourced from brand-kit.md, not memory; brand constraints box present

**Stage 2 — Generate**
- Check adapter (`bash helpers/check-generative-adapter.sh`)
- Growthub-pipeline path: `bash helpers/run-pipeline.sh` with `video-generation` CMS node
- BYOK path: `lib/adapters/generative/index.js` routes to provider SDK
- Both paths write `manifest.json` via `growthub-pipeline-normalizer.js` contract
- Spawn sub-skill: `skills/generative-execution/SKILL.md`
- Self-eval: manifest.json has one artifact URL per scene; no secrets in artifacts

**Stage 3 — Edit**
- Verify `VIDEO_USE_HOME` → stage clips → write `edit-plan.md` → hand off to video-use agent
- video-use fork: Scribe transcription → EDL → FFmpeg render → final.mp4
- Spawn sub-skill: `skills/video-edit/SKILL.md`
- Self-eval: `final.mp4` exists, duration ±10% of target, QA checklist passes

## Non-negotiable rules

1. Brief content sourced from `brand-kit.md` only — no brand detail from memory.
2. Generative execution routes through the adapter contract — no raw API calls outside it.
3. Stage 3 delegates to `VIDEO_USE_HOME` fork — never duplicate its pipeline inline.
4. `output/<client>/<project>/` is the only write root for pipeline artifacts.
5. `ELEVENLABS_API_KEY` and provider keys never appear in output artifacts.
6. AI generation prompts in brief Appendix only — never inline in scene blocks.
7. Append to `.growthub-fork/project.md` at every stage boundary.
8. `maxRetries: 3` enforced per selfEval criteria — park with `needs_confirmation` at ceiling.

## Troubleshooting

- Missing `ELEVENLABS_API_KEY` → re-run `node setup/verify-env.mjs`.
- `growthub auth whoami` fails → run `growthub auth login`.
- `VIDEO_USE_HOME` not found → run `bash setup/clone-fork.sh`.
- `~/.claude/skills/video-use` missing → run `bash setup/install-skill.sh`.
- `ffmpeg` not found → re-run `bash setup/check-deps.sh`.

---

## Governed-workspace primitives (v1.2)

This workspace carries the six architectural primitives every Growthub fork inherits. The contract is capability-agnostic (`@growthub/api-contract/skills::SkillManifest`); kit-specific specialisation lives in `skills.md` above.

1. **`SKILL.md`** at the kit root — the discovery entry / routing menu. Read before `skills.md`.
2. **Repo-root `AGENTS.md` pointer** — Cursor / Claude / Codex all read the same contract.
3. **`.growthub-fork/project.md`** — session memory, seeded at init/import from `templates/project.md`. Append a dated entry after every material change.
4. **Self-evaluation (`selfEval.criteria` + `maxRetries`)** — generate → apply → evaluate → record; retry up to 3; every attempt writes to both `project.md` (human) and `trace.jsonl` (machine). Use `recordSelfEval` (`cli/src/skills/self-eval.ts`); never bypass the fork-trace primitive.
5. **Nested `skills/<slug>/SKILL.md`** — `brief-generation`, `generative-execution`, `video-edit` lanes.
6. **`helpers/<verb>.{sh,mjs,py}`** — `run-pipeline.sh`, `check-generative-adapter.sh`.

Command surface from inside this fork:

- `growthub skills list` — enumerate this fork's SKILL.md tree
- `growthub skills validate` — strict shape check
- `growthub skills session show` — print `.growthub-fork/project.md`
- `growthub skills session init --kit growthub-creative-video-pipeline-v1` — (re-)seed session memory
