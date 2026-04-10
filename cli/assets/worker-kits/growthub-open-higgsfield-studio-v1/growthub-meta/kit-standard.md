# Kit Standard — Open Higgsfield Studio v1

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
- one primary studio selection
- model recommendation with fallback
- explicit provider adapter assumptions
- operational output artifacts, not ideation-only text

---

## Runtime rules

- no secrets stored in kit files
- Muapi is the reference adapter, not a permanent monopoly
- browser, desktop, and local-fork modes are all first-class
- outputs are Markdown only

---

## Versioning rules

Additive template/docs changes are minor-version work. Entry-point path changes or export-name changes require a major version bump.
