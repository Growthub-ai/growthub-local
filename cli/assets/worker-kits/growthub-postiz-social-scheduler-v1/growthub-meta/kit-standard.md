# Kit Standard — Postiz Social Scheduler v1

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
- strict workflow order
- repo inspection before planning when a fork exists
- platform mix selection before drafting
- content pillars mapped to every calendar slot
- caption and hashtag strategies documented
- explicit scheduling and queue assumptions
- operational output artifacts, not ideation-only text

---

## Runtime rules

- no secrets stored in kit files
- Postiz is the reference scheduling platform, not a permanent monopoly
- local-fork, browser-hosted, and API-direct modes are all first-class
- outputs are Markdown only

---

## Versioning rules

Additive template/docs changes are minor-version work. Entry-point path changes or export-name changes require a major version bump.
