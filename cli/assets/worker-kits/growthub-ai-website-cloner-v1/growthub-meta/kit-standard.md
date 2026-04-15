# Kit Standard — AI Website Cloner v1

This document defines the locked contract for this kit.

---

## Required files contract

Every path in `kit.json -> frozenAssetPaths` must exist in every valid release.

---

## Bundle contract

The bundle manifest must remain aligned with `kit.json`:
- `bundle.kitId` matches `kit.id`
- `bundle.workerId` matches `entrypoint.workerId`
- `requiredFrozenAssets` stays a subset of `frozenAssetPaths`

---

## Agent operating rules

The entrypoint file is the operating law. `skills.md` is the methodology.

Required invariants:
- strict 8-phase workflow order (no phase may be skipped)
- reconnaissance before any spec writing (no memory-only specs)
- one builder per section in its own worktree
- visual QA required before platform handoff
- ethical use check before initiating any clone

---

## Runtime rules

- no API keys or credentials stored in kit files
- the fork path defaults to `~/ai-website-cloner-template` but is overridable via `AI_CLONER_FORK_PATH`
- all AI work is done by the local agent — no external service calls from this kit
- outputs are Markdown files except component code (produced in the fork repo, not in this kit directory)
- brand assets and cloned site assets must not be committed to this kit

---

## Versioning rules

Additive template/docs changes are minor-version work. Entry-point path changes, fork URL changes, or export-name changes require a major version bump. The CLI compatibility minimum version in `kit.json` must be updated on every published kit version bump.
