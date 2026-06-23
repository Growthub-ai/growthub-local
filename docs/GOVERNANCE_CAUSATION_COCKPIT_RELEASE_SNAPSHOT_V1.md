# Governance Causation Cockpit Release Snapshot V1

Release snapshot for the **Governance Causation Cockpit** — roadmap item **R3**
of [`CEO_PRIMITIVE_COCKPIT_ROADMAP_V1`](./CEO_PRIMITIVE_COCKPIT_ROADMAP_V1.md),
and the verbatim realization of the worked example in
[`GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1`](./GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md) §3.

Companion docs:

- [`docs/GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md`](./GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md)
- [`docs/CEO_PRIMITIVE_COCKPIT_ROADMAP_V1.md`](./CEO_PRIMITIVE_COCKPIT_ROADMAP_V1.md)
- [`docs/GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md) (the mirror-target release)

## Source-of-truth summary

The receipt stream already records the facts. Every mutation lane emits the
same canonical `AgentOutcomeReceipt` into `workspace:agent-outcomes`
(`lib/workspace-outcome-receipts.js`), and `GET /api/workspace/agent-outcomes`
already returns the stream plus the governance summary. This feature adds the
ONE thing that was missing — **detection / observability** of route-shopping:
correlating a blocked `untrusted-direct` receipt with a later `execution-proof`
attempt **by the same actor**. It adds **no new API, no new PATCH field, no new
schema, no new persistence, and no new visual grammar** — it is a pure deriver
plus a cockpit view over state that already exists.

This is the canonical Governed Cockpit Entry-Point Pattern applied end to end:
state → pure deriver → cockpit view inside the existing Workspace Helper
sidecar, reachable through the four (here: three — cockpits are slash-entered,
mirroring the shipped CEO cockpit) limited surfaces.

## Files changed by phase

### Phase 1 — Pure deriver (the only seam between state and UI)
- `…/apps/workspace/lib/governance-causation-console.js` (new, pure) —
  `deriveRouteShoppingSignals(receipts)` and the cockpit wrapper
  `deriveGovernanceCausation({ receipts })`. No React, no network calls, no
  filesystem, no config writes, no browser storage, no CSS. Correlates strictly
  within a single actor's chronological timeline (server `seq` first, then
  `createdAt`, then stable index); one block is consumed by at most one
  follow-on; a second block before any proof supersedes the first (closest
  pair). Severity is derived from evidence only (proximity + repeat count +
  whether the follow-on succeeded). Truthful telemetry: a missing/unparseable
  `createdAt` yields `elapsedMs: null` (never `0`); out-of-order timestamps
  clamp to `>= 0`. The `handoff` prefers the EXECUTION-PROOF receipt's object
  refs (the row sandbox-run actually executed), so "Open" lands on a row
  Background Tasks can render — not the direct-PATCH target. Receipts are
  already secret-redacted at write time; the deriver additionally truncates
  every surfaced string and never echoes raw payloads.

### Phase 2 — Cockpit (mirrors CeoCockpit's state model exactly)
- `…/app/data-model/components/GovernanceCausationCockpit.jsx` (new) — reads the
  ONE existing endpoint (`GET /api/workspace/agent-outcomes`), runs the pure
  deriver, and renders the SAME grammar the CEO cockpit uses: a
  `dm-swarm-section-row` totals line, a single **"Needs your attention"**
  (`dm-field-label`) emphasized card, then the capped "All signals" list with an
  overflow disclosure (`GOVERNANCE_VISIBLE_CAP = 50`, mirroring
  `CEO_FLEET_VISIBLE_CAP`). Cards are flat (mirror `CeoReportCard`): no
  expand/collapse, no hidden state — every piece of evidence is inline. The only
  icon is the inherited **ArrowUpRight** (the CEO hand-off affordance); no new
  icon, color, or visual grammar. **Every UI state is rendered — no blank first
  frame:** `loading` (first fetch) → "Reading the receipt stream…"; `error` →
  message + **Retry** (never a misleading "all clear", and prior receipts are
  kept so a transient refresh failure does not blank a populated cockpit);
  `empty-activity` (0 receipts); `clear` (receipts > 0, 0 signals); `watch`
  (signals, none high) and `alert` (≥1 high) → attention + history. A restrained
  text **Refresh** closes the habitual loop (open → review → Open → act →
  Refresh → confirm cleared). Read-only: never patches config, never calls
  `sandbox-run`; every "Open" routes through the same `handleOpenArtifact`
  router the CEO cockpit uses.

### Phase 3 — The limited surfaces (additive)
- `…/app/data-model/components/helper-commands.js` — one `HELPER_COMMANDS` row:
  `/governance`, `mutates: false`, `view: "governance"` (passes
  `isGovernedHelperCommand`).
- `…/app/data-model/components/HelperSidecar.jsx` — import the cockpit; one
  `inGovernanceView = activeView === "governance"` sentinel (kept separate from
  the swarm/CEO sentinels so their machinery is untouched); the back affordance
  and header title; one body-switch mount; the chat-body gate now also excludes
  the governance view. No second sidecar framework.
- Rail: **no new pill** — cockpits are slash-entered, mirroring the shipped CEO
  cockpit (the rail carries only the "Ask helper" pill).

### Phase 4 — Tests and docs
- `scripts/unit-governance-causation-console.test.mjs` (19 tests, `node --test`)
  — core correlation + positive/negative/adversarial API-contract probes:
  realistic multi-actor streams with lane noise, malformed/partial receipts,
  malformed `objectRefs`, secret-shaped/oversized strings (bounded, not
  expanded), out-of-order timestamps, closest-pair supersede, a 1000-receipt
  stream, non-string actors, the unattributed bucket, and the execution-proof
  hand-off preference.
- `cli/src/__tests__/kit-custom-workspace-starter.test.ts` — four new describe
  blocks: file presence + four surfaces, kit.json frozen paths, pure-deriver
  behavior (dynamic import), and purity/secret-safety assertions (10 tests).
- JSX/deriver transpile-checked with `esbuild` (valid JSX, resolvable imports).
- `cli/assets/.../kit.json` — the two new assets added to `frozenAssetPaths`.
- This snapshot; `CEO_PRIMITIVE_COCKPIT_ROADMAP_V1.md` R3 marked shipped.

## Contract changes

None. The api-contract version literals are unchanged
(`WORKSPACE_OUTCOME_CONTRACT_VERSION` stays `1`). The roadmap permitted an
*optional* additive `routeShopSignals?` on `WorkspaceGovernanceSummary`; this
release takes the **UI-only** path the pattern doc explicitly allows (§3.2), so
the contract surface does not move at all.

## Route-shop detection (the shipped definition)

A signal is emitted when, within one actor's timeline:

```text
lane: "untrusted-direct" / outcomeStatus: "blocked"   (the direct lane refused)
  …later, same actor…
lane: "execution-proof"                                (a sandbox-run attempt)
```

Each signal carries: `actor`, `blockedReceiptId`, `followOnReceiptId`,
`objectRefs` (what they reached for), `elapsedMs` (+ `elapsedLabel`),
`policyVerdict` (why the direct lane refused), `followOnOutcome` /
`followOnSucceeded`, `repeatIndex`, `severity` (low | medium | high), a plain
`headline`, and a `handoff` artifact to the existing swarm-run surface.

The cockpit rolls signals into a status: `clear` (no confirmed shops) ·
`watch` (signals, none high) · `alert` (at least one high), plus an `attention`
pick (highest severity, most recent).

## Gates

- `node --test scripts/unit-governance-causation-console.test.mjs` — 19/19 ✓
- `node --test scripts/unit-helper-command-registry.test.mjs` — 7/7 ✓ (the live
  `/governance` entry passes `isGovernedHelperCommand`)
- `npx vitest run src/__tests__/kit-custom-workspace-starter.test.ts` — the 10
  new tests pass; the suite's pre-existing failures (unrelated:
  `ALLOWED_PATCH_FIELDS` literal, `getApiRegistrySandboxToolState`, sandbox
  draft/registry panels) are unchanged (240→250 passing, failures held at 10).
- `node scripts/check-worker-kits.mjs` ✓ · `node scripts/check-version-sync.mjs`
  ✓ · `node scripts/check-cli-package.mjs` ✓

## No-new-authority confirmation

No new runtime (no execution; the cockpit reads only). No new persistence layer
(reads `workspace:agent-outcomes`; writes nothing; browser storage untouched).
No new API route (reads the existing `GET /api/workspace/agent-outcomes`). No
new PATCH allowlist field. No new object type or schema. No direct mutation from
the slash command or cockpit UI. No secrets surfaced — receipts are
secret-redacted at write time and the deriver re-clips defensively. No new
visual grammar — only the existing `dm-*` primitives and the inherited icon set.

## Known limitations

- Correlation is per-actor; receipts with no `actor` are grouped under a single
  `unattributed` bucket and never merged with a named actor (a deliberate floor,
  not a guess).
- Severity is heuristic over the three evidence signals named above; it is
  observability, not enforcement — the gate already closes route-shopping
  (`sandbox-run/route.js`, `workflow/publish/route.js`). This cockpit makes the
  *behavior* visible; it never blocks or executes.
- The stream is the existing rolling 200-receipt window; correlations older than
  the window are not reconstructed (no new persistence was added by design).
