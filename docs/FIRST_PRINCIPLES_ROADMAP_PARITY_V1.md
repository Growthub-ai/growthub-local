# First-Principles Roadmap Parity V1 — shared blast-radius grammar

**Gate:** `pnpm test:roadmap-parity` (`scripts/unit-first-principles-roadmap-parity.test.mjs`)

**Companion (GH App):** `docs/PRODUCT-ROADMAP-ALIGNMENT-V2-FIRST-PRINCIPLES.md` — S3, dependency and impact intelligence.

## What this freezes

The GH App hosted read model ports this repo's blast-radius deriver
(`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-metadata-impact.js`,
kind `growthub-workspace-blast-radius-v1`) as `gh-app-hosted-blast-radius-v1`
over the enterprise edge taxonomy (Routine → workflow version / trigger /
destination / connector / package, Project → isolate, Deployment →
artifact/config, App → capability, Model → corpus / training receipt).

Both sides must keep identical semantics:

1. Kind and version constants (`growthub-workspace-blast-radius-v1`, version 1, default cap 500).
2. Transitive reverse-dependency closure via breadth-first walk — first reach is the shortest dependency path.
3. Deterministic ordering: distance → type → id; byte-identical output for reordered input.
4. Single-visit cycle termination.
5. Honest truncation: `truncated: true` plus the `(truncated)` summary suffix — never a silent cap.
6. Unknown origin: `origin: null` plus an explicit warning — never a fabricated result.
7. Frozen summary sentence shapes for impact and no-impact.

## Why a gate instead of prose

The hosted port is a copy, not an import — the two repos do not share a
package for this grammar yet. Until the deriver is promoted into the shared
contract seam, any semantic change here MUST fail this gate so the change is
made deliberately on both sides in the same release window.

When the deriver is promoted into `@growthub/api-contract`, delete this gate
and the hosted copy in the same change.
