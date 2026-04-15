# Kit Standard — Twenty CRM v1

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
- strict workflow order (Steps 0–10)
- environment gate passes before any planning work
- data model is defined before automation or enrichment pipelines
- deployment mode is always labeled in every output
- deduplication key is named in every enrichment or import artifact
- every automation trigger-action pair has a documented failure path
- no secrets are stored in any kit file or output artifact
- outputs are operational artifacts, not ideation-only text

---

## Runtime rules

- no secrets stored in kit files
- agent-only mode is always a valid fallback — no live CRM required for planning work
- cloud, self-hosted, and local-fork modes are all first-class
- outputs are Markdown only
- field names use Twenty's naming conventions (camelCase for fields, PascalCase for objects)
- SELECT option values use SCREAMING_SNAKE_CASE

---

## Versioning rules

Additive template/docs changes are minor-version work. Entrypoint path changes, export name changes, or fundamental workflow changes require a major version bump.

---

## Scope rules

This kit is scoped to Twenty CRM implementation planning and operator documentation. It does not:
- provide a live CRM dashboard
- write application code (it produces specs and handoffs for developers)
- manage infrastructure directly
- store client data in kit files
