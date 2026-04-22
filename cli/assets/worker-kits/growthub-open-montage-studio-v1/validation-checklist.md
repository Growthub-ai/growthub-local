# Validation Checklist — Open Montage Studio

Run through this checklist before your first generation session.

---

## Environment Validation

- [ ] `.env` file exists (copied from `.env.example`)
- [ ] At least one provider key is set OR GrowthHub session is active OR zero-key mode is acceptable
- [ ] `skills.md` is readable from the working directory
- [ ] `workers/open-montage-studio-operator/CLAUDE.md` is readable

## Local-Fork Validation (skip if agent-only mode)

- [ ] Python 3.10+ installed: `python3 --version`
- [ ] FFmpeg installed: `ffmpeg -version`
- [ ] Node.js 18+ installed: `node --version`
- [ ] OpenMontage clone exists at `$OPENMONTAGE_PATH` (default `$HOME/OpenMontage`)
- [ ] OpenMontage setup completed: `cd $HOME/OpenMontage && python -c "from tools.tool_registry import registry; registry.discover(); print('OK')"`
- [ ] Remotion dependencies installed: `cd $HOME/OpenMontage/remotion-composer && node -e "require('remotion')"`

## CMS Node Validation (skip if local-fork only)

- [ ] GrowthHub session is active: `growthub auth:status`
- [ ] CMS capability registry returns nodes: agent queries for `video` and `image` family nodes
- [ ] At least one generation node is available and enabled

## Brand Kit Validation

- [ ] Brand kit exists in `brands/<client-slug>/brand-kit.md`
- [ ] Brand identity section is complete
- [ ] Visual identity section has color values
- [ ] Tone of voice section is filled

## Provider Key Validation

Run `node setup/verify-env.mjs` to check which providers are configured:

- [ ] Script exits 0 (at least one provider or zero-key mode acknowledged)
- [ ] Configured providers match the intended production plan

## Output Directory

- [ ] `output/` directory exists and is writable
- [ ] No stale output from a previous session that could conflict
