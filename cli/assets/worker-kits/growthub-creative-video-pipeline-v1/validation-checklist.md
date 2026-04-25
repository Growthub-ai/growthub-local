# Validation Checklist — Creative Video Pipeline

Run before calling the kit v1-ready or before a Vercel deployment.

## Environment

- [ ] `bash setup/check-deps.sh` passes (FFmpeg, Python 3, pip, git, node)
- [ ] `node setup/verify-env.mjs` passes
- [ ] `bash helpers/check-generative-adapter.sh` shows expected adapter and keys
- [ ] `VIDEO_USE_HOME` resolves to an existing `video-use` clone

## Growthub CLI (growthub-pipeline adapter)

- [ ] `growthub auth whoami --json` returns authenticated user
- [ ] `growthub kit list --family studio` includes `growthub-creative-video-pipeline-v1`
- [ ] `growthub kit fork status <fork-id>` shows no unexpected drift

## Stage 1 — Brief

- [ ] Brand kit exists at `brands/<client-slug>/brand-kit.md`
- [ ] `pipeline-brief.md` written to `output/<client>/<project>/brief/`
- [ ] Brief contains: brand constraints box, scene table, hook variations A–E, editing guidelines
- [ ] AI generation prompts in Appendix only (not inline in scene blocks)

## Stage 2 — Generate

- [ ] `output/<client>/<project>/generative/manifest.json` exists and is valid JSON
- [ ] Each manifest entry has `id`, `type`, `provider`, `url`, `prompt`
- [ ] No API keys appear in any artifact file
- [ ] Artifact count matches scene count in brief

## Stage 3 — Edit

- [ ] `output/<client>/<project>/final/final.mp4` exists
- [ ] Duration within ±10% of target from edit plan
- [ ] Audio fades at segment boundaries (30 ms)
- [ ] Subtitles applied last
- [ ] No secrets in any output artifact

## Local shell

- [ ] `cd studio && npm install && npm run build` succeeds
- [ ] `cd apps/creative-video-pipeline && npm install && npm run build` succeeds
- [ ] Studio Vite shell renders pipeline stage status without errors
- [ ] Next.js `/settings/keys` page renders adapter config

## Governed primitives

- [ ] `.growthub-fork/project.md` has entries for all completed stages
- [ ] `.growthub-fork/trace.jsonl` has typed events for all material changes
- [ ] `growthub skills validate` passes
- [ ] `growthub skills list` shows this kit's SKILL.md tree
