# Browser Proof Protocol V1

The single canonical real-browser QA golden path for any customer-visible claim in `growthub-local`. Playbooks and skills **reference this document instead of restating the steps** — the marketplace provider playbook Phase 7 was the most rigorous statement of this protocol and is the source it was extracted from.

Consumers:

- [`docs/MARKETPLACE_PROVIDER_PLAYBOOK_V1.md`](./MARKETPLACE_PROVIDER_PLAYBOOK_V1.md) Phase 7 (adds provider-specific assertions)
- [`docs/WORKSPACE_TEMPLATE_GOLDEN_PATH_V1.md`](./WORKSPACE_TEMPLATE_GOLDEN_PATH_V1.md) Phase 3 (adds template smoke + readback)
- [`docs/AGENTIC_PRODUCT_PR_REVIEW_LOOP.md`](./AGENTIC_PRODUCT_PR_REVIEW_LOOP.md) steps 4–5 (adds the flagship customer journey)
- `.claude/skills/growthub-marketplace-provider/SKILL.md`, `.claude/skills/growthub-workspace-template-export/SKILL.md`

Governing principle: **tests alone never close a customer-visible change.** Prove it as a real user, in a real browser, on a real boot, with screenshots. "Routes return 200" is necessary, never sufficient.

---

## The protocol

1. **Boot the canonical export** — `node scripts/export-seed-workspace.mjs` → activation 5/5, cockpit spine 100%, `next dev` on `:3777`, `GET /api/workspace` → 200. Never QA against the repo tree; the exported workspace is the artifact customers get.
2. **Drive Chromium via playwright-core** (`executablePath: "/opt/pw-browsers/chromium"`, `NO_PROXY=127.0.0.1`). Script the run — every assertion is a pass/fail line, every state a PNG.
3. **Clean states first** (no credentials, no seeded feature state): capture every touched surface in its honest empty/default state before configuring anything.
4. **Honest failure** — exercise the negative path THROUGH THE UI (fake credentials, invalid input) → assert the real route returns its structured rejection (e.g. HTTP 422 + message) AND the message renders. No crash, nothing persisted. A feature that cannot fail honestly is not proven.
5. **Closed loop** — drive the full journey through the UI against a protocol-shaped local mock where an external side exists: configure → act through the governed door → assert the external side received the record AND the correlation stamps/receipt ids landed back on the governed object → re-derived surfaces (e.g. `/settings/apps`, `/data-model?object=api-registry`) reflect the real rows → tampered credential → 401.
6. **Secret grep** — `growthub.config.json`, receipts, row JSON, and every API response captured in the run must never contain a credential value (provider keys, JWTs, bearer values, webhook URLs, hex blobs). This step is universal, not provider-specific.
7. **Deliver the screenshots** — one PNG per state in steps 3–5, banked with the PR (pattern: [`docs/proofs/pr270/`](./proofs/pr270)).

Useful deep links for drivers: `/settings/add-ons?provider=<id>`, `/data-model?object=<objectId>`, `/data-model?helper=open`, `/workflows?object=<id>&row=<row>&field=orchestrationConfig`.

## Evidence language

When an agent host provides an in-app browser, follow the proof-order and evidence block in [`AGENTS.md`](../AGENTS.md) §Growthub Browser QA (backend, current URL, visible surface, action layer, readback layer). Never print secrets, cookies, or bearer values while proving browser state.

## Variant deltas (what each consumer adds — not replaces)

| Consumer | Adds on top of the core protocol |
|---|---|
| Marketplace provider | Provider grid/install-card states, product gating, `/settings/apps` icon + popover, registry table rows, lane actions with sync stamps |
| Workspace template export | `scripts/workspace-template-smoke.mjs --slug <slug> [--boot]` config + readback gates before the browser pass; Builder home lists dashboards; `/data-model` renders objects |
| Product PR loop | Flagship journey: Workspace Map → Data Model → Workflow Canvas → run → Run Console timeline → raw proof; both data path and human interactive path in the PR body |

## Anti-patterns

- Restating these steps in a playbook instead of linking here (drift accident).
- Skipping the honest-failure or secret-grep steps because the change "isn't a provider."
- Substituting headless route/data checks for the human-visible interactive pass.
- QA against the repo tree or a hand-rolled `next dev` instead of the canonical export script.
