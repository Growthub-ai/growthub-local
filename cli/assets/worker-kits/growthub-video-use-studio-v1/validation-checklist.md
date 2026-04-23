# Validation Checklist

- [ ] `bash setup/check-deps.sh` — Python, pip, git, ffmpeg present
- [ ] `node setup/verify-env.mjs` — `VIDEO_USE_HOME` and `ELEVENLABS_API_KEY` set
- [ ] `bash setup/clone-fork.sh` — video-use cloned and `pip install -e .` succeeded
- [ ] `bash setup/install-skill.sh` — `~/.claude/skills/video-use` symlink in place
- [ ] Source footage staged under `${VIDEO_USE_HOME}/<project>/`
- [ ] Planning artifacts written to `output/<client-slug>/<project-slug>/`
- [ ] `edit-strategy.md` confirmed before EDL generation
- [ ] Twelve production rules checklist passes in `qa-checklist.md`
- [ ] Final render exists at `${VIDEO_USE_HOME}/<project>/edit/final.mp4`
