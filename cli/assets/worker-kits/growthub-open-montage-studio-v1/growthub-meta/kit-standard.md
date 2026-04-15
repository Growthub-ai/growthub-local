# Kit Standard Compliance — Open Montage Studio

## Kit Identity

| Field | Value |
|---|---|
| Kit ID | `growthub-open-montage-studio-v1` |
| Schema version | 2 |
| Type | worker |
| Family | studio |
| Execution mode | export |
| Activation modes | export |
| CLI min version | 0.3.50 |

## Five-Layer Architecture Compliance

| Layer | Status | Evidence |
|---|---|---|
| 1. Contract | Complete | `kit.json` (schema v2), `bundles/` manifest |
| 2. Cognitive | Complete | `workers/open-montage-studio-operator/CLAUDE.md`, `skills.md` |
| 3. Production | Complete | 10 templates, output standards, examples |
| 4. Runtime | Complete | Setup scripts, runtime assumptions, validation checklist |
| 5. Activation | Complete | `QUICKSTART.md`, export-based activation |

## Contributor Checklist

- [x] Self-contained kit folder exists under `cli/assets/worker-kits/`
- [x] `kit.json` exists and is complete (schema v2)
- [x] Bundle manifest exists and is complete
- [x] Payload files are present (all `frozenAssetPaths` exist)
- [x] Catalog registration exists in `cli/src/kits/catalog.ts`
- [x] Kit validates via `growthub kit validate <path>`
- [x] Real local adapter test passes through Working Directory

## Differentiators from Other Kits

| Feature | This Kit | Higgsfield Kit |
|---|---|---|
| Production substrate | OpenMontage (12 pipelines, 52 tools) | Open Higgsfield AI (4 studios) |
| Pipeline count | 12 | 1 (visual production) |
| CMS node integration | First-class bridge adapter | Not present |
| Provider count | 14 video + 10 image + 4 TTS | 1 (Muapi) |
| Execution modes | local-fork, agent-only, hybrid | local-fork, browser-hosted, desktop-app |
| Composition engine | Remotion + FFmpeg | Higgsfield studios |
| Zero-key capability | Full (Piper + archives + Remotion) | Limited |
