---
name: governed-workspace-mutation
description: The two canonical workspace API calls and the verified mutation protocol — PATCH /api/workspace (4-field allowlist) and POST /api/workspace/sandbox-run (sandbox execution). Read this before changing workspace configuration or executing anything, in any agent harness. Every shape and error below was verified against the live workspace runtime, not inferred from docs.
triggers:
  - change workspace config
  - patch the workspace
  - add a data model object
  - run a sandbox
  - execute a workflow row
  - publish a draft graph
progressiveDisclosure: false
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Every mutation went through PATCH /api/workspace or POST /api/workspace/sandbox-run — no direct config/sidecar file writes while the app is running, no invented routes.
    - PATCH bodies contain only changed allowlisted keys, never the whole config.
    - Each mutation was verified by its success envelope before any dependent step ran.
    - Draft graphs were proven with useDraft true before being published onto the row.
    - No credential value crossed the wire — env-ref names only.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers: []
subSkills: []
mcpTools: []
---

# Governed Workspace Mutation — the two canonical calls

This workspace already contains the machinery you would otherwise write. Dashboards, widgets, data objects, API registry rows, sandbox environments, and agent-swarm graphs are **governed objects that hold state** in `growthub.config.json`. You do not code features against them — you mutate them through exactly **two** API calls, and the runtime does validation, persistence, run history, and row stamping for you.

| Intent | The one true call |
|---|---|
| Change workspace configuration | `PATCH /api/workspace` |
| Execute a `sandbox-environment` row (incl. agent-swarm graphs) | `POST /api/workspace/sandbox-run` |

Everything else is a read (`GET /api/workspace`) or a specialised governed lane (`refresh-sources`, `test-source`, `helper/query|apply`, `patch/preflight`, `workflow/publish`). There is no third mutation path. Route truth in this tree: `apps/workspace/app/api/workspace/route.js`, `apps/workspace/app/api/workspace/sandbox-run/route.js`, `apps/workspace/app/api/workspace/patch/preflight/route.js`, `apps/workspace/app/api/workspace/workflow/publish/route.js`.

**This boundary is runtime-enforced, not advisory.** `PATCH /api/workspace` runs every body through the mutation policy (`apps/workspace/lib/workspace-patch-policy.js`) before any write; violations return **HTTP 422** with structured `violations[] = { code, path, message }`. An agent that ignores this card does not get a different outcome — it gets a 422. SDK types: `@growthub/api-contract/workspace-patch`.

## First-session traversal (token-budgeted, any harness)

Seven reads, in order, regardless of how the operator has personalised the workspace — these anchors are invariant:

1. `SKILL.md` (workspace root) — discovery entry
2. `.growthub-fork/project.md` — session memory (your prior state)
3. `AGENTS.md` — agent contract
4. `.growthub-fork/policy.json` — what you may touch
5. tail of `.growthub-fork/trace.jsonl` — recent governed events
6. `GET /api/workspace` → `workspaceConfig` + `workspaceConfigPersistence` — live config and whether saves are possible (`canSave`, `guidance`)
7. `apps/workspace/lib/workspace-schema.js` — what valid edits look like (only when you are about to mutate)

Then state your plan in terms of governed objects, not new code.

## The verified mutation protocol (runtime-enforced)

Every mutation follows **read → preflight → prove → publish → confirm**. This is not ceremony the agent may skip — the runtime enforces the load-bearing steps.

```
1. READ       GET /api/workspace                       → workspaceConfig, persistence mode
2. PREFLIGHT  POST /api/workspace/patch/preflight      → dry-runs the exact PATCH gates
              (mutation policy + merged-config schema)  and returns structured reasons;
              fix every reason before the real PATCH
3. PROVE      data sources    → POST /api/workspace/test-source
              sandbox rows    → POST /api/workspace/sandbox-run (the run IS the test)
              workflow drafts → sandbox-run with {"useDraft": true} — executes the draft
                                without publishing; stamps the run + its draftSha256
                                into the server-owned run history
4. PUBLISH    config keys     → PATCH /api/workspace with ONLY the changed allowlisted key
              workflow drafts → POST /api/workspace/workflow/publish — the ONLY transition
                                from draft to live (see below)
5. CONFIRM    require the success envelope before any dependent step. A failed call
              means nothing downstream may be applied.
```

Drafting on behalf of a user? Prefer the helper lane — `POST /api/workspace/helper/query` proposes (no writes), a human reviews, `helper/apply` validates and writes with a receipt (its final `ok: true` is only reachable after the write succeeds). The PATCH allowlist is the helper's hard ceiling too (`docs/WORKSPACE_HELPER_CONTRACT_V1.md` in the source repo).

## Workflow publish — server-authoritative

Live workflow state on sandbox-environment rows is **publish-owned**. The mutation policy blocks direct PATCH from: changing `orchestrationGraph` / `orchestrationConfig` / `orchestrationPublishedAt` / `orchestrationDeltas`, bumping `version`, or transitioning `lifecycleStatus` to `"live"` (echoing persisted values is always fine; moving a live row back to draft — pausing — remains a direct operator action).

`POST /api/workspace/workflow/publish` with `{ objectId, name }` verifies, against server-owned state:

1. a saved draft exists (`orchestrationDraftConfig` / `orchestrationDraftGraph`);
2. the draft test passed (`orchestrationDraftTestPassed`) **and** the tested config equals the saved draft byte-for-byte;
3. **lineage**: the row's `orchestrationDraftLastRunId` resolves to a record in the sandbox run history whose `exitCode` is 0 and whose `draftSha256` (stamped by sandbox-run from the exact graph it executed, before execution) matches this draft — the attestation fields alone are PATCH-writable and therefore never trusted;
4. the draft parses as a valid orchestration graph.

Then it bumps `version`, moves draft → live, clears draft state, stamps `orchestrationPublishedAt`, appends the `orchestrationDeltas` record (with `publishedSha256`), sets `lifecycleStatus: "live"`, and persists. Failure codes: `no_draft`, `draft_not_tested`, `draft_changed_after_test`, `draft_run_not_verified`, `invalid_graph`, `read_only`.

## Call 1 — `PATCH /api/workspace`

**Permanent allowlist — exactly four keys:** `dashboards`, `widgetTypes`, `canvas`, `dataModel`. Verified live: any other key is rejected before validation.

```bash
# Read first (response key: workspaceConfig; persistence: workspaceConfigPersistence)
curl -s "$WS/api/workspace" | jq '.workspaceConfig.dataModel'

# Patch ONLY the key you changed — each allowlisted key is replaced whole,
# so send the complete updated value FOR THAT KEY and nothing else.
curl -s -X PATCH "$WS/api/workspace" -H 'content-type: application/json' \
  -d '{"dataModel": {"objects": [ ... ]}}'
# Success → 200 {"workspaceConfig": <next full config>}
```

**Observed error envelopes — handle all of them, never retry blindly:**

| Status | Observed body | Agent action |
|---|---|---|
| 400 | `{"error":"patch contains unknown fields","details":[...],"allowed":["dashboards","widgetTypes","canvas","dataModel"]}` | Remove the key. There is no other route — `branding`, `capabilities`, `integrations`, `id`, `provenance` are read-only through this API. |
| 400 | `{"error":"patch must be a plain object"}` | Body must be a JSON object, not an array/scalar. |
| 400 | `{"error":"invalid workspace config: <joined errors>","details":[...]}` | Fix each entry in `details`; read `workspace-schema.js`, don't guess. |
| 422 | `{"error":"patch rejected by workspace mutation policy","violations":[{code,path,message}],"preflight":...}` | Read each violation's `message` — it names the governed alternative (publish route, refresh-sources, source records). Never look for a workaround; preflight the corrected body. |
| 409 | `{"error":"workspace config is read-only in this runtime", "guidance": ...}` | Surface `guidance` to the user (edit `growthub.config.json` locally, or `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true` on a writable runtime). Never work around it. |
| 500 | persistence fault | Report; do not mutate files behind the adapter's back. |

**Status precision:** unknown top-level keys — including full-config bodies and `workspaceSourceRecords` — are caught by the route's legacy allowlist check first and return **400** with `allowed[]`; the policy's named reasons for those cases (`unknown_field`, `full_config_body`, `source_records_through_patch`) surface through **preflight**. The **422** policy rejection covers content violations *inside* allowlisted keys: `live_workflow_field`, `live_publish_via_patch`, `credential_field`, `history_smuggling`, `oversized_patch` (2 MB body), `oversized_row` (128 KB, echoes exempt), `oversized_object` (500 rows), `oversized_node_config` (64 KB).

**Validator facts verified live:**

- A fresh workspace has **no `dataModel` key** — your first `dataModel` PATCH creates it.
- Every `dataModel.objects[]` entry requires `id` (unique non-empty string), `label` (non-empty string), `rows` (array). `columns` must be a string array when present.
- Secret-shaped fields are rejected by name on sandbox rows (`apiKey`, `token`, `accessToken`, `refreshToken`, `bearer`, `password`, `secret`, `sessionKey`) with: *"auth secrets must stay in the local CLI's own store"*. Rows carry `authRef` / env-ref **names** only.
- `dataModel` edits must not create widgets or touch `canvas` as a side effect. Binding an object to a dashboard is a separate action on an existing View widget.
- `workspaceSourceRecords` is GET-only hydration; sidecar writes flow through `POST /api/workspace/refresh-sources`, never PATCH.

## Call 2 — `POST /api/workspace/sandbox-run`

```bash
curl -s -X POST "$WS/api/workspace/sandbox-run" -H 'content-type: application/json' \
  -d '{"objectId": "<object id>", "name": "<row Name>"}'
# Draft proof: add "useDraft": true (+ optional "draftGraph") — runs the draft
# orchestration graph without publishing it onto the row.
```

**Row-shape facts verified live (the traps):**

- The row's identity column is **`Name` — capital N** (Data Model grid convention). A row keyed `name` returns 404 `no sandbox row named <x> in object <y>`.
- The executed payload is **`row.command`** (for `local-process`: written to a temp entry file and run by `bash`/`node`/`python3` per `runtime`). For agent hosts, `row.instructions` is prefixed above `command`. Unknown columns are stored but **silently not executed** — a row with only `prompt` "succeeds" with empty stdout.
- Object lookup requires both `id` match **and** `objectType: "sandbox-environment"`.
- Other observed failures: unregistered adapter → 404 with a `hint`; unsupported runtime → 400 with `supportedRuntimes`; `runLocality: "serverless"` requires `schedulerRegistryId` (validator-enforced) and rejects `local-agent-host`.

**Success envelope (observed):** `{ ok: true, status: "connected", runId, adapter, runtime, exitCode, durationMs, persisted: true, sourceId: "sandbox:<objectId>:<slug(Name)>", response }` — `response` carries `stdout`, `stderr`, `envRefsResolved`/`envRefsMissing` (slug names only, never values), `networkAllow`, `allowList`, `browserAccess`, `adapterMeta`, `exports`.

**Side effects you get for free — never replicate manually:** a versioned record appended to `growthub.source-records.json` under the `sourceId` (history accumulates per invocation), and the row stamped with `status`, `lastTested`, `lastRunId`, `lastSourceId`, `lastResponse`.

## Agent Outcome Loop V1 — receipts, lanes, and the cockpit

Every mutation lane emits the **same canonical receipt** (`@growthub/api-contract/workspace-outcome::AgentOutcomeReceipt`) into the server-owned stream `workspace:agent-outcomes` in `growthub.source-records.json`. A receipt answers: what was intended, what changed, was it preflighted, was it proven (runId/sourceId/draftSha256), was it published (version/publishedSha256), what should happen next (`nextActions`), and how to roll back or replay (`rollbackRef`). Receipts are secret-redacted and bounded — summaries and references, never raw payloads.

**Lane classification — every lane is named; none is an unlabelled bypass:**

| Lane | Route | Trust class |
|---|---|---|
| `untrusted-direct` | `PATCH /api/workspace` (+ preflight) | Full policy firewall |
| `execution-proof` | `POST /api/workspace/sandbox-run` | Produces run lineage |
| `server-authoritative` | `POST /api/workspace/workflow/publish` | Owns draft → live |
| `governed-proposal` | `POST /api/workspace/helper/apply` | Privileged: human-reviewed; swarm graphs are server-built/validated (`buildSandboxRowFromSwarmProposal`), never model-authored verbatim |

**The cockpit:** `GET /api/workspace/agent-outcomes` returns the receipt stream (newest first) plus a derived governance summary — blocked attempts, publishes, drafts awaiting test, drafts tested-but-unpublished, live rows with failed last runs, live rows without proof, helper applies. This is how an operator manages a workspace full of agents without reading logs.

**First-session continuation:** before acting, read the stream. Cite `receiptId`s, continue from `nextActions`, and inspect `rollbackRef` (previous version + delta index for publishes; sourceId for runs) before redoing anyone's work. Rejections come with `repairPlan[]` — follow it instead of retrying variations.

**Outcome completion:** for regular user work, do not stop at "proposal created" or "run attempted" when the requested business outcome requires deliverables. The completion proof must live in governed state: successful run ids or source ids, connected output rows, durable storage/reference paths where applicable, review status, and a concise documentation/receipt trail. Failed or partial rows stay as evidence, but they do not count as delivered outputs. Human-review states remain explicit; an agent can execute and persist, but it does not silently approve or launch work that requires workspace-admin or super-admin judgment.

## Intelligence layer — graph + blast radius (read-only)

After a mutation lands, the platform **understands** it. Two read-only, secret-free surfaces:

- **World model** — `GET /api/workspace/metadata-graph` projects the live config + source-record sidecar into a typed node/edge graph (`buildWorkspaceMetadataStore → buildWorkspaceMetadataGraph`, `lib/workspace-metadata-graph.js`); the Workspace Map (`/workspace-map`) renders the same graph. Every governed object becomes nodes; every dependency a deterministic edge (`bindsToObject`, `usesField`, `containsWidget`, `readsObject`/`writesObject`, `materializes`, …). A landed mutation expands this graph — the workspace knows more about itself than before.
- **Causal impact** — the graph ships single-hop `findDependents(graph, nodeId)`; the transitive closure (the real blast radius) is `deriveBlastRadius(graph, nodeId)` in `lib/workspace-metadata-impact.js` — a deterministic, cycle-safe BFS of incoming edges returning every reachable dependent with hop distance and via-relation. This is the difference between *"what directly uses this field?"* (catalog) and *"if this field changes, which widgets, dashboards, and delivered workspace kits go stale?"* (intelligence). Verified live: editing `customers.mrr` → widget (`usesField`) → dashboard (`containsWidget`) → workerKit (`materializes`). Conceptual map: `docs/OPERATING_THE_GOVERNED_UNIVERSE_V1.md` in the source repo.

Both are derived projections — they own no state and mutate nothing. `deriveBlastRadius` is the spine of a pure deriver family (stale surfaces, workflow impact, provenance lineage, app readiness, contract compliance, and `derivePatchImpact` — the shared add/modify/**remove** impact model). Use them to size a change *before* you PATCH (pair with `patch/preflight`) and to explain what an accepted mutation affects.

These same derivers are surfaced to external agents (Codex / Claude Code) through the **agent-facing MCP console** (`growthub serve --mcp`, a CLI surface — note this workspace skill declares no `mcpTools`): **read + dry-run (`preflight_patch`) + governed hand-off (`next_actions`), never a mutation tool.** The console reads this graph, dry-runs against Law, and emits the exact governed call — reality still changes only through the routes above. Canonical contract: `docs/GOVERNED_MCP_CONSOLE_V1.md` in the source repo.

## Applications as governed entities (Control Plane V1)

Applications are first-class governed objects, not loose files. The source of truth is the `workspace-app-registry` Data Model object (objectType `"app-surface"`, preset ships in the Data Model) — one row per application, referencing its governed parts by id: `dashboardIds`, `workflowRefs` (`objectId:RowName`), `dataSourceIds`, `registryIds`. Rows mutate through the normal PATCH lane (policy + receipts apply).

- **Read the fleet first:** `GET /api/workspace/apps` — registered apps with resolved links, health rollup (`ready`/`blocked`/`empty` + computed blockers), the single next action with a deep link into the real surface, the app-scoped **assignment packet** (goal, blockers, allowed routes, forbidden actions, expected evidence, object refs), plus `detected[]` filesystem app surfaces (advisory — registration is the governed act) and the Fleet lens state.
- **Work app-scoped:** take the assignment packet's `objectRefs` as your mutation scope; everything outside it is out of bounds. **Scope is runtime-enforced on every governed route, not just PATCH** — send `x-growthub-app-scope: <appId>` on every call. Rejections are a structured `AppScopeViolation` envelope (`violationType`, `offendingPaths`, `repairPlan[]`, `allowedObjectIds`) — follow the repair plan, never route-shop.

**Scope-enforcement matrix (what the header does per route):**

| Route | Scoped behavior |
|---|---|
| `PATCH /api/workspace` | changed/new dataModel objects + dashboards must be in the app's refs; `canvas`/`widgetTypes` are workspace-global → rejected |
| `POST /api/workspace/patch/preflight` | returns `appScopeVerdict` — mirrors the real PATCH exactly; if `allowed:false`, the PATCH will 422 identically |
| `POST /api/workspace/sandbox-run` | workflow must be in `workflowRefs` (or its object in scope) |
| `POST /api/workspace/workflow/publish` | same workflow check; publish is never blocked by app health (it's how "not live" blockers clear) |
| `POST /api/workspace/test-source` | `integrationId` must be in the app's `registryIds` |
| `POST /api/workspace/refresh-sources` | every `sourceIds[]` entry must be in `dataSourceIds` (or a derived sidecar sourceId) |
| `POST /api/workspace/helper/apply` | **operator-only** — always rejected under app scope (`route_operator_only`) |

Need a wider scope? Register the object/ref on the app's registry row first — that edit is itself in scope via the registry object. Every scoped rejection and success lands in the receipt stream with `appId`, and receipts carry a server-side `seq` + `prevReceiptSha256` hash chain (tamper-evident; a signed anchor is future work).
- **Humans see the same truth:** the Fleet lens renders in Workspace Lens (`/workspace-lens`, filter "Fleet") with one card step per app; `GET /api/workspace/swarm-condition?lensId=fleet` is the same state as an agent packet. SDK: `@growthub/api-contract/workspace-apps`.

## Workspace-first rule

Before writing any code, ask: **does a governed object already represent this?** A scheduled job is a sandbox row. An external API is an API Registry row. A data view is a Data Model object bound to a View widget. A multi-agent workflow is a sandbox row with an `agent-swarm-v1` orchestration graph. If the capability exists as an object, your work is two API calls — not a new module. Extend objects; do not deviate into parallel code paths.

## Anti-patterns — the runtime blocks these; don't waste tokens trying

- Writing `growthub.config.json` or `growthub.source-records.json` directly while the app is the runtime authority, or inventing a new mutation route/server action.
- PATCHing the whole config back (`full_config_body`), keys outside the allowlist (400), or `workspaceSourceRecords` (`source_records_through_patch`).
- PATCHing live workflow fields, bumping `version`, or setting `lifecycleStatus: "live"` directly (`live_workflow_field` / `live_publish_via_patch` — use `workflow/publish`).
- Forging the draft attestation via PATCH — publish cross-checks the run history's `draftSha256` (`draft_run_not_verified`).
- Proceeding after a failed PATCH or publish.
- Smuggling run history into rows (`history_smuggling`) or inlining megabyte payloads (`oversized_*`) — bulk data lives in source records.
- Executing sandbox/swarm work via ad-hoc shell instead of `sandbox-run` (you lose run lineage and row stamping).
- Putting credential values in rows, prompts, or PATCH bodies (`credential_field` + schema rejection).
- Hand-editing `.growthub-fork/trace.jsonl` or `policy.json` — CLI-written, append-only.
- Keying sandbox rows with lowercase `name`, or putting the payload anywhere but `command`.

If this workspace's route files have diverged from this card, the route files win — runtime implementation overrides docs.
