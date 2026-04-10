# Kit Standard — Email Marketing Strategist v1

This document defines the locked contract for this kit. It governs what may and may not change across versions, and what every contributor and agent must respect.

---

## Required files contract

Every valid release of this kit MUST contain all paths listed in `kit.json → frozenAssetPaths`. No path may be removed without a version bump and schema review.

Files are frozen. They may be updated only through a versioned release process — not in-place hotfixes.

---

## Bundle contract

The bundle manifest at `bundles/growthub-email-marketing-v1.json` MUST remain consistent with `kit.json`:

- `bundle.kitId` must match `kit.id`
- `bundle.workerId` must match `entrypoint.workerId`
- `requiredFrozenAssets` must be a subset of `frozenAssetPaths`
- `export.folderName` and `export.zipFileName` must not change within a minor version

---

## Export boundary

When exported via `growthub kit download`, this kit produces a self-contained folder. The export MUST be complete and independently operational — the agent should require no external files to function.

Sensitive credentials (API keys, account IDs) are NEVER stored in kit files. They are always injected via environment variables at runtime. See `runtime-assumptions.md`.

---

## Brand kit rules

- `brands/_template/brand-kit.md` is the canonical template. It must contain every field an agent needs to operate.
- `brands/growthub/brand-kit.md` is the reference example. It must be fully populated.
- Client-specific brand kits added by agents or operators at runtime are NOT part of the frozen asset set and are NOT shipped in the export.
- The `publicExampleBrandPaths` in `kit.json` and the bundle are the only brand files shipped in the export. Do not add client-specific files to `frozenAssetPaths`.

---

## Agent operating rules

The agent entrypoint at `workers/email-marketing-strategist/CLAUDE.md` is the law. It governs:

- Step order (steps may not be skipped)
- The 3-question gate before any writing begins
- Output structure and file naming
- Platform integration mode (API vs browser-assisted)
- Deliverables logging

`skills.md` is the methodology. It is the source of truth for HOW the agent works. `CLAUDE.md` references `skills.md` — agents must read it before beginning any task.

---

## Output rules

- All outputs are Markdown files
- Outputs go to `output/<client-slug>/<campaign-slug>/` relative to the working directory
- Files are versioned (`v1`, `v2`, ...) — never overwrite an existing version
- Deliverables log must be updated in the client brand kit after every completed output
- Plain-text fallback blocks are required in every email draft

---

## Platform integration rules

- Email platform integration follows the adapter pattern defined in `runtime-assumptions.md`
- GHL is the reference adapter
- No platform-specific logic is hardcoded into `skills.md`, `CLAUDE.md`, or any template file
- New platform adapters are added as new files — they do not modify existing kit files

---

## What is allowed to change between versions

| Change type | Allowed without major version bump |
|---|---|
| Adding new email format files | Yes (minor) |
| Adding new module files | Yes (minor) |
| Adding rows to subject-line-patterns.csv | Yes (patch) |
| Updating brand kit guidance text | Yes (minor) |
| Changing frozenAssetPaths | No — requires minor version bump |
| Changing bundle export names | No — requires major version bump |
| Changing worker entrypoint path | No — requires major version bump |
| Adding a new platform adapter | Yes (minor, in new file only) |
