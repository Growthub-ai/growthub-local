---
name: growthub-workspace-template-export
description: >
  Convert any private-repo workspace variant (a customized
  growthub.config.json) into a clean, non-secret, production-ready seeded
  workspace template registered on the canonical Discover CLI pathway —
  export + sanitize with a verification gate, register the seed +
  WORKSPACE_TEMPLATES entry (src AND committed dist), mirror the seed
  contract tests, and prove it with the real starter-init smoke, a boot,
  and a browser readback. Use when the user asks to turn a workspace
  variant/config into a template, export a seeded config from a private
  repo, add a workspace template to kit list/discover, or QA a template
  export end to end (e.g. the gtm-os and project-management templates).
helpers:
  - scripts/export-workspace-seed-template.mjs
  - scripts/workspace-template-smoke.mjs
subSkills: []
selfEval:
  criteria:
    - the seed was produced by scripts/export-workspace-seed-template.mjs (or verified equivalent) with ZERO secret/PII findings — env-ref authRef names only, needs-connection statuses, EMPTY connectionIds, evidence keys cleared, widget row caches emptied, provenance.template/templateKind stamped
    - the template rides ONLY the canonical pathway (templates/seeded-configs/<slug>.config.json + one WORKSPACE_TEMPLATES entry) with cli/src/commands/kit.ts and the committed cli/dist/index.js updated in the same shape — no parallel mechanism
    - seed-contract vitest cases are mirrored for the new slug (provenance + rows schema; no secrets / no connectionIds; picker listing)
    - scripts/workspace-template-smoke.mjs is GREEN at config level for the new slug AND the existing project-management slug (regression), and GREEN with --boot for the new slug (served objects/dashboards/registry hygiene match the merged export)
    - a browser pass on the booted export confirmed Builder home lists the template dashboards, a dashboard opens with widgets, and /data-model renders the objects — with screenshots delivered
    - all release gates green (check:worker-kits, check:cli-package, check:monorepo-boundary, freeze:check, version-sync --require-bump-if-source-changed, release:check)
  maxRetries: 3
---

# growthub-workspace-template-export

Golden-path doc (read it first, in full):
**`docs/WORKSPACE_TEMPLATE_GOLDEN_PATH_V1.md`** — the one mechanism, the
sanitation contract, the registration steps, and the honesty rules. This
skill is the executable summary; the doc is the contract. Reference
implementation: the `gtm-os` template (seed, registry entry, tests, smoke,
proof in `docs/proofs/pr270/PROOF.md`).

## Core loop

1. **Recon** — read `cli/src/starter/init.ts` (`applySeededConfig` merge),
   `cli/src/commands/kit.ts` (`WORKSPACE_TEMPLATES` registry), and one
   existing seed (`templates/seeded-configs/gtm-os.config.json`). The
   pathway is slug-file + registry entry; nothing else.
2. **Export + sanitize** — run
   `node scripts/export-workspace-seed-template.mjs --config <variant
   config> --slug <slug> --out /tmp/<slug>.config.json --definition-rows
   <governed definition object ids>`. The script enforces the whole
   sanitation contract and refuses to write on any secret/PII finding.
   Definition rows are configuration (blueprints, nav, agent setup) —
   never run evidence, never CRM/PII data.
3. **Adversarial audit of the seed** — even a validated exporter output
   gets a manual pass: entropy scan for token-shaped strings, api-registry
   rows carry env-ref NAMES + `needs-connection` + empty `connectionIds`,
   no `.records` shapes, dashboards/canvas widget row caches empty.
4. **Register** — copy the seed into
   `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/templates/seeded-configs/<slug>.config.json`;
   add ONE `WORKSPACE_TEMPLATES` entry in `cli/src/commands/kit.ts`; apply
   the SAME change in the same shape to the committed `cli/dist/index.js`
   (this repo slice cannot rebuild the bundle — src and dist must not
   drift); mirror the seed-contract + picker vitest cases.
5. **Prove** — `node scripts/workspace-template-smoke.mjs --slug <slug>`
   (config level, plus `project-management` as regression), then
   `--boot --port 3779 [--link-node-modules <dir>]` for the served
   readback. Finish with a browser pass on the booted export (dashboards
   render with widgets, `/data-model` lists the objects) and bank
   screenshots. Then run every release gate.

## Hard rules

- Secrets: `.env.local` / runtime env only; seeds carry env-key NAMES
  (`authRef`) and nothing else. The exporter's verification gate is a
  hard stop — fix the variant, never weaken the gate.
- Mirror, don't invent: one seed file + one registry entry. No new
  template mechanisms, no per-template routes, no config forks.
- Connection ids, sync proofs, run receipts, and test evidence are
  operator-owned runtime state — they NEVER ship in a template.
- Proof is a real export + boot + browser readback, not source claims.
  The strict `validateWorkspaceConfig` rejecting the merged file is
  expected (it gates PATCH bodies) — the boot is the acceptance test.
- Keep the committed dist in lockstep with src for every registry edit.
