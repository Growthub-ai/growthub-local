# Validation Checklist — Open Higgsfield Studio v1

Use this checklist before considering a package complete.

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
- [ ] visual-production-specific templates exist for all four studios
- [ ] frame-analysis primitive is documented

## OPERATIONAL VALIDATION

- [ ] local fork inspection instructions exist
- [ ] browser-hosted flow is documented
- [ ] desktop-app flow is documented
- [ ] Muapi auth, submit, poll, and result assumptions are documented
- [ ] fallback provider extension path is documented

## OUTPUT VALIDATION

- [ ] required output categories all have templates
- [ ] example files demonstrate the expected contract
- [ ] naming convention is explicit
- [ ] review and QA gates are explicit
