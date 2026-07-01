# Governed Capability Binding V1

This freezes the reusable pattern the Upstash QStash serverless scheduler proved,
generalized so the whole real provider universe becomes governed, no-code,
agent-operable workspace capabilities — without a second runtime, a second
mutation lane, or a changed user click-path.

It is the contract behind Marketplace V2: the marketplace scales from one
provider to a real 2026 catalog across categories, and every entry closes the
same loop `/schedule` proved.

## The primitive

A **governed capability binding** is complete only when it closes a four-layer
loop. A provider row in the API Registry is just layer 1 — the *capability
truth*. It is not a product until it also has a canvas node, a cockpit lens, and
an action→receipt edge.

```
1. Capability   API Registry data-object row (provider/product verified)
2. Node surface an api-registry-call / trigger node correlated to that row
3. Cockpit lens a pure deriver → counts + attention + per-card nextAction
4. Action edge  governed route → provider call → receipt (the reward)
                → re-derive (next /command shows the state advanced)
```

The layer-3 view-model is simultaneously the **human dopamine surface** and the
**agent RL condition packet**: state + evidence + available tools. The layer-4
receipt's `outcomeStatus` (`published` vs `blocked`/`failed`) is the reward
signal both consume. Same `state → derivation → eligibility → action → evidence
→ next state` engine; only the reader differs.

## Layer 1 — Capability (API Registry, no deviation)

Every capability is a governed API Registry row, installed through the existing
marketplace routes and written through the governed workspace boundary. The
descriptor lives in `lib/marketplace-catalog.js` and carries the atoms QStash
forged, plus two the closed loop requires:

- forged atoms: `providerId`, `integrationId`, `authRef`, `executionLane`,
  `requiredEnv`/`optionalEnv`, `probe`, `connectorKind`, `capabilities`, `category`
- **`auth`** — the auth-scheme atom (`bearer` | `basic` | `header`), with
  `headerName`, `prefix`, `tokenEnv`/`userEnv`+`passEnv`, and `extraHeaders`
  (version pins). QStash hardcoded HTTP-Basic `email:key`; this atom admits the
  real universe. Interpreted once by `buildProviderAuthHeaders`
  (`lib/capability-binding.js`).
- **`nodeSurface`** — `api-registry-call` (send / query / deploy / inference) or
  `trigger` (schedulers). Declares how the capability appears on the canvas.

Secret rule (unchanged): descriptors and rows carry env KEY NAMES only. A token
value only ever exists inside request headers, server-side.

## Layer 2 — Node surface (correlated to the governed object)

A capability is usable on the workflow canvas only as a node whose `registryId`
points at its API Registry `integrationId`. `bindCapabilityNode`
(`lib/workspace-add-ons.js`) is the pure transform that correlates an
`api-registry-call` node to the row (the non-scheduler analog of
`syncTriggerNodeForSchedule`). A route applies its result through
`PATCH /api/workspace` — the binding never writes directly.

## Layer 3 — Cockpit lens (dopamine + RL)

`deriveCapabilityCockpit({ lane, ... })` (`lib/capability-cockpit-console.js`)
is the lane-parameterized generalization of `deriveScheduleCockpit`. It is a
PURE deriver — no new object, no new PATCH field — that reuses the existing
`scanServerlessReadiness` causation driver to gate `api-registry-call` nodes on
server-side credentials and no secret leak. It emits `counts`, a single
`attention` next-move, and per-card `nextAction`.

A `mutates:false` helper command opens each lens: `/schedule`, `/deploy`,
`/data` (`app/data-model/components/helper-commands.js`). Commands are lens
doors, never action runners.

## Layer 4 — Action edge (the receipt reward)

`buildCapabilityActionRequest` / `parseCapabilityActionResponse`
(`lib/capability-binding.js`) build the governed provider request (auth in
headers only) and parse a non-secret proof. The governed route
`POST /api/workspace/capabilities/[providerId]/[productId]/run` calls the
provider, writes last-run proof onto the owning row through the governed
workspace write, and records a `workspace:agent-outcomes` receipt. The next
`/deploy` or `/data` re-derives and shows the state advanced — closing the loop.

## V2 proof providers

- **Vercel — `/deploy`** (`deploy` lane, bearer). The closest non-scheduler
  mirror of QStash: an async action (trigger a deployment, poll `readyState`).
  Node surface `api-registry-call`; reward = deployment succeeded.
- **Supabase — `/data`** (`workspace-data` lane, custom-header `apikey`). The
  PostgREST host resolves from `SUPABASE_URL` via the same `probe.baseUrlEnv`
  pattern Upstash uses. Node surface `api-registry-call`; reward = rows read/written.

Both flow through the same governed marketplace routes, receipts, and API
Registry object as QStash. The remaining catalog providers (Resend, Slack,
Postmark, SendGrid, Twilio, Stripe, OpenAI, Anthropic, Cohere, Pinecone, GitHub,
Cloudflare, Linear, Notion) are registered as verified capability rows with the
`auth` atom + node surface, ready to be promoted to a per-lane cockpit by
filling in only the provider-specific action steps.

## Governance rules (unchanged from Official Plugins V1)

- config changes go through `PATCH /api/workspace`
- capability execution goes through the governed capability run / sync routes
- receipts are written to `workspace:agent-outcomes`
- secrets remain server-side; UI hands off to governed routes
- the QStash serverless-scheduler path is untouched: scheduler detection stays
  keyed on `executionLane === "serverless-scheduler"`, so no catalog capability
  can be mistaken for a schedule.

## The method (why this order)

The hardest capability (QStash: external auth + async execution + signed
callback + row proof + receipts + cockpit) was built first. Its shards became
the atoms. Generalizing those atoms — the `auth` scheme, the node surface, the
cockpit lens, the action→receipt edge — turns "we integrated one provider" into
"we have a marketplace." Product taste arranges the atoms (categories, search,
cockpit counts, one clear next move); it never mutates them.
