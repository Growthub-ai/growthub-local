# Validation Checklist

Use before sessions, after kit updates, and before client delivery.

---

## PRE-SESSION

### Environment
- [ ] Postiz fork at `POSTIZ_FORK_PATH` (default `~/postiz-app`) — **or** agent-only mode confirmed
- [ ] Node 22+ and pnpm available if touching the fork (`node -v`, `pnpm -v`)
- [ ] `node setup/verify-env.mjs` has no FAIL lines
- [ ] `bash setup/check-deps.sh` exits 0 when local-fork work is planned

### Brand kit
- [ ] `brands/<client-slug>/brand-kit.md` exists (copy from `_template` if needed)
- [ ] Primary channels and compliance notes filled
- [ ] `calendar_objective` or equivalent objective field populated

### Output directory
- [ ] Target `output/<client-slug>/<project-slug>/` is empty or version numbers won't collide

---

## KIT MANIFEST

### kit.json
- [ ] `schemaVersion` is `2`
- [ ] `kit.id` is `growthub-postiz-social-v1`
- [ ] `entrypoint.path` is `workers/postiz-social-operator/CLAUDE.md`
- [ ] `bundles` references `bundles/growthub-postiz-social-v1.json`

### Bundle
- [ ] `bundles/growthub-postiz-social-v1.json` exists
- [ ] `briefType` is `postiz-social-aeo-operating`
- [ ] `export.folderName` is `growthub-agent-worker-kit-postiz-social-v1`

### Templates (5)
- [ ] `templates/calendar-week-plan.md`
- [ ] `templates/channel-mix-matrix.md`
- [ ] `templates/content-sprint-brief.md`
- [ ] `templates/launch-post-pack.md`
- [ ] `templates/analytics-readout.md`

### Examples (2)
- [ ] `examples/calendar-week-sample.md`
- [ ] `examples/launch-post-pack-sample.md`

### Docs (4)
- [ ] `docs/postiz-fork-integration.md`
- [ ] `docs/agentic-scheduler-stack.md`
- [ ] `docs/multi-workspace-ops.md`
- [ ] `docs/api-and-automation.md`

### Setup
- [ ] `setup/clone-fork.sh`, `setup/verify-env.mjs`, `setup/check-deps.sh`

---

## POST-DELIVERY

- [ ] All artifacts saved under `output/<client-slug>/<project-slug>/`
- [ ] Brand kit DELIVERABLES LOG updated
- [ ] No credentials pasted into Markdown
