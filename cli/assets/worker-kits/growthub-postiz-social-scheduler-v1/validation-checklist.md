# Validation Checklist — Postiz Social Scheduler v1

Use this checklist before considering a package complete.

---

## PRE-SESSION CHECKLIST (operator runs before starting the agent)

- [ ] Growthub local Working Directory is pointed at this folder (or Claude Code as alternative)
- [ ] `.env` exists (copy from `.env.example` if not)
- [ ] `POSTIZ_URL` is set in `.env` (not placeholder value)
- [ ] `node setup/verify-env.mjs` exits 0 (instance is reachable)
- [ ] `bash setup/check-deps.sh` passes (local-fork mode only)
- [ ] Local Postiz instance is running OR execution mode is `browser-hosted` or `api-direct`
- [ ] `output/` directory exists (auto-created by agent on first write)
- [ ] Active brand kit exists: `brands/<client-slug>/brand-kit.md` OR using `brands/growthub/brand-kit.md`

---

## KIT VALIDATION

- [ ] `kit.json` exists and every `frozenAssetPaths` entry exists
- [ ] bundle manifest matches kit id and worker id
- [ ] entrypoint path exists
- [ ] example brand is public-safe
- [ ] docs, templates, and examples are all self-contained in this folder

## METHODOLOGY VALIDATION

- [ ] `skills.md` defines strict workflow order
- [ ] entrypoint points back to `skills.md`
- [ ] runtime assumptions, provider adapter notes, and output standards exist
- [ ] platform-specific format templates exist for all target platforms
- [ ] content module templates exist for hooks, body copy, and CTAs

## OPERATIONAL VALIDATION

- [ ] local fork inspection instructions exist
- [ ] browser-hosted flow is documented
- [ ] API-direct flow is documented
- [ ] BullMQ scheduling assumptions are documented
- [ ] multi-workspace handling is documented
- [ ] platform integration assumptions are documented

## OUTPUT VALIDATION

- [ ] required output categories all have templates
- [ ] example files demonstrate the expected contract
- [ ] naming convention is explicit
- [ ] review and QA gates are explicit
