---
name: growthub-marketplace-provider
description: >
  Ship a new official workspace marketplace provider (plugin) + install
  products at Supabase/Vercel parity: source-truth recon of the existing
  provider grammar, one-place provider definition, governed api-registry
  rows, /settings/apps icon derivation, circular badge icons, unit +
  source-truth tests, and the mandatory real-browser closed-loop QA with
  screenshot proof on a booted export. Use when the user asks to add or
  integrate a marketplace provider/plugin (Neon, Planetscale, Stripe, any
  SaaS), add install products, wire provider icons, or QA a provider
  end-to-end as a real user.
helpers: []
subSkills: []
selfEval:
  criteria:
    - provider + products are defined ONLY in workspace-add-ons.js using the existing grammar (authMode/basic pair, executionLane, credentialRoles) with no new detection keys or per-provider route forks
    - api-registry provider and product rows land through withMarketplaceProviderRegistry / withMarketplaceProductRegistry with status connected, syncStatus verified, and a live-probe syncProof
    - no secret value appears in growthub.config.json, receipts, row JSON, or any browser response (grep-verified)
    - browser QA ran against a fresh export-seed-workspace boot with clean-state, honest-422, closed-loop, and /settings/apps icon screenshots delivered
    - all provider suites + existing Vercel/Upstash/inbound suites pass and release gates (worker-kits, monorepo-boundary, version-sync, pr-ready) are green
  maxRetries: 3
---

# growthub-marketplace-provider

Playbook doc (read it first, in full):
**`docs/MARKETPLACE_PROVIDER_PLAYBOOK_V1.md`** — phases 0–7 plus the
future-agent TODO ledger and the final-edit checklist. This skill is the
executable summary; the playbook is the contract.

Kit root: `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`.

## Core loop

1. **Recon (Phase 0)** — reconstruct the live contract from source, never
   memory. Minimum reads: `lib/workspace-add-ons.js` (provider/product
   grammar, row builders, lane helpers), the four generic provider routes
   under `app/api/workspace/add-ons/providers/[providerId]/`, one
   lane-scoped door (`add-ons/[providerId]/data` or `/schedule`),
   `app/components/WorkspaceAddOnsMarketplace.jsx` (install journey),
   `app/settings/apps/page.jsx` (`attachExternalAppLinks`), and the
   Vercel + Supabase unit suites in `scripts/` (the test shape to mirror).
2. **Define (Phase 1)** — one provider entry + products array in
   `workspace-add-ons.js`. Lock identity (providerId / integrationId /
   authRef / concrete env keys). Reuse an existing `executionLane` when the
   capability class exists. Account probe uses `authMode: "bearer"` or the
   basic pair — extend the generic lane with declared contract keys
   (`fallback`, `aliasEnv`, `tokenHeaderName`) rather than forking routes.
   Encode the provider's REAL current REST endpoints and payload field
   names (check their live API docs) in `probe` + `resourceDiscovery`.
3. **Rows (Phase 3)** — provider/product rows land only through the
   existing upserts into the api-registry object; external records become
   `data-source` objects with the correlation spine (registryId,
   externalTable, lastSync* stamps, receipt ids). Oversight = the
   `/settings/apps` governed link (icon + popover + dedupe), NOT a new
   cockpit or helper command.
4. **Icons (Phase 5)** — `public/integrations/<provider>/provider.png` +
   per-product PNGs as 448×448 circular badges, official brand glyph at
   ~56% inset, transparent corners. Compose with the pre-installed
   Chromium if only a raw glyph exists (recipe in the playbook).
5. **Tests + gates (Phase 6)** — unit suite (grammar, builders, secret
   absence, source-truth file assertions), root `test:*` script, CI job
   block, version lockstep bump, then `check:worker-kits`,
   `check:monorepo-boundary`, `check-resolver-registry`, `freeze-check`,
   `pr-ready`.
6. **Browser proof (Phase 7 — non-negotiable)** — boot
   `scripts/export-seed-workspace.mjs`, drive playwright-core Chromium
   (`/opt/pw-browsers/chromium`, `NO_PROXY=127.0.0.1`): clean states →
   honest 422 with fake creds through the UI → closed loop against a
   protocol-shaped local mock (connect → install → registry table at
   `/data-model?object=api-registry` → lane actions → external side
   received the record → sync stamps + receipts → live `/settings/apps`
   icon → tampered credential 401) → secret grep → deliver screenshots.

## Hard rules

- Secrets: `.env.local` / runtime env only; every surface carries env-ref
  names. Verify server-side; the browser holds nothing.
- Mirror, don't invent: no parallel row shapes, oversight surfaces,
  persistence backends, or detection keys.
- Every governed action receipts to `workspace:agent-outcomes`, including
  blocked outcomes.
- QA is performed as a real user on a real boot with real screenshots —
  unit tests alone never close a provider.
