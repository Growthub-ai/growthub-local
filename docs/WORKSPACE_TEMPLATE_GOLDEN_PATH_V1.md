# Workspace Template Golden Path V1 — Private Variant → Marketplace Template

The canonical, production-proven path for converting ANY private-repo
workspace variant (a customized `growthub.config.json`) into a clean,
non-secret, seeded workspace template that users and agents can export from
the Growthub Discover CLI — exactly the way the `project-management` (ops)
and `gtm-os` templates ship today.

Proven end-to-end on the GTM OS conversion (PR #270,
`docs/proofs/pr270/PROOF.md` — "GTM OS workspace template" section):
28 governed objects, 2 dashboards, 11 api-registry rows, exported through
the committed dist CLI, booted, and browser-verified.

## The one mechanism

There is exactly ONE template mechanism — do not invent parallel ones:

```
templates/seeded-configs/<slug>.config.json      (in the starter kit assets)
        │  applied by applySeededConfig (cli/src/starter/init.ts)
        ▼
growthub starter init --out <dir> --seed-config <slug>
        ▲  surfaced by the WORKSPACE_TEMPLATES registry (cli/src/commands/kit.ts)
        │
growthub kit list / inspect <slug> / download <slug>   +  the Discover hub
```

`applySeededConfig` merges the seed OVER the blank starter config
(`mergeDataModelObjects` upserts objects by id). Nothing else is required
for the seed to work — the registry entry only makes it discoverable.

## Phase 1 — Export a non-secret seed from the private variant

Run the exporter against the variant's live runtime config:

```bash
node scripts/export-workspace-seed-template.mjs \
  --config <variant>/apps/workspace/growthub.config.json \
  --slug <slug> \
  --out /tmp/<slug>.config.json \
  --definition-rows <id1,id2,...>   # ONLY governed-definition objects
```

The sanitation contract (enforced by the script — read it, don't re-derive):

- **Schemas preserved, everything else stripped.** Every Data Model object
  keeps id / label / source / objectType / columns / binding /
  fieldSettings / icon. Rows ship EMPTY unless the object id is in the
  `--definition-rows` allowlist (agent setup, nav folders, sandbox/swarm
  workflow definitions, team blueprints — configuration, never data).
- **PII / run data never ships.** CRM people, verification results,
  writeback runs, helper threads, source evidence → `rows: []`. Emails
  anywhere are redacted to `operator@example.com`.
- **API Registry boundary.** Rows keep auth by env key NAME only
  (`authRef`); `status` resets to `needs-connection`; sync evidence
  (`syncStatus`/`syncProof`/`syncCheckedAt`, `lastTested`, `lastResponse`)
  is cleared; `connectionIds` is EMPTIED — connection ids are
  operator-owned post-OAuth and must never ship (this exact violation was
  caught and stripped in the GTM OS import).
- **Evidence keys cleared everywhere** (`lastResponse`, `lastTested`,
  `lastRunId`, `lastSourceId`, `lastApplied`, `lastSkipped` — name-matched,
  so draft/receipt variants are covered).
- **Widgets keep identity, binding, layout, chart config; cached row data
  is emptied** (`config.rows`, `config.binding.rows`) — a fresh workspace
  re-hydrates from its own objects.
- **Provenance contract stamped**: `provenance.template = <slug>`,
  `provenance.templateKind = "workspace-template"` (the starter-kit seed
  tests assert these), plus a `seedTemplate` block naming the generator.
- **Verification gate**: the serialized output is scanned for secret and
  PII patterns (provider keys, JWTs, bearer values, webhook URLs, hex
  blobs, emails). ANY finding aborts with exit 1 and writes nothing.

## Phase 2 — Register on the canonical pathway

1. Copy the verified seed to
   `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/templates/seeded-configs/<slug>.config.json`.
2. Add ONE entry to `WORKSPACE_TEMPLATES` in `cli/src/commands/kit.ts`
   (item KitListItem + `seedSlug` + `defaultOut` + `workspaceName` +
   `aliases`). Everything else — list, inspect, download, the interactive
   picker, the printed create command — derives from the table.
3. **Keep the committed `cli/dist/index.js` in sync**: this repo slice
   cannot rebuild the bundle (the private monorepo build regenerates it),
   so apply the SAME registry addition in the same shape to the dist file.
   src and dist must never drift.
4. Mirror the two seed-contract vitest cases in
   `cli/src/__tests__/kit-custom-workspace-starter.test.ts` (provenance +
   rows schema; no secrets / no connectionIds) and the picker listing in
   `kit-command.test.ts` — copy the `gtm-os` cases.

## Phase 3 — Prove it (never close on source claims)

```bash
# Config-level (fast — always run):
node scripts/workspace-template-smoke.mjs --slug <slug>

# Full boot readback (run before shipping):
node scripts/workspace-template-smoke.mjs --slug <slug> --boot --port 3779 \
  [--link-node-modules <existing apps/workspace/node_modules>]
```

The smoke is real end to end: it resolves the CLI (installed `growthub` →
`cli/dist/index.js` → `scripts/demo-cli.sh`), inspects the template on the
kit surface, runs a REAL `starter init` export into a temp dir, verifies the
merged config (objects merged, rows contract, api-registry hygiene,
secret/PII grep), and with `--boot` starts `next dev` and reads back
`/api/workspace` — served object count, dashboards, and registry hygiene
must match the merged export. GREEN exit 0 is the bar.

Finish with a browser pass on the booted export: Builder home lists the
template's dashboards, each dashboard opens with its widgets, and
`/data-model` renders the objects (definition rows visible, stripped
objects honestly empty). Bank screenshots with your PR.

Release gates before pushing: `check:worker-kits`, `check:cli-package`,
`check:monorepo-boundary`, `freeze:check`,
`check:version-sync -- --require-bump-if-source-changed`, `release:check`.

## Honesty rules (learned the hard way)

- The strict `validateWorkspaceConfig` gate validates PATCH bodies, NOT
  config files — it rejects the working ops template and every merged
  template identically. Do not "fix" a template to satisfy it; the
  acceptance proof is the real boot + served readback.
- A `--check-only` run that passes is not a proof; the smoke's boot
  readback is. Template application, merge, and serving are three
  different failure surfaces.
- If the exporter's secret gate fires, fix the VARIANT (move the value to
  `.env.local`, reference it by env key name) — never weaken the gate.
- Definition-row allowlists are per-variant judgment: a row that encodes a
  workflow/blueprint is configuration; a row produced BY running one is
  evidence and stays out.
