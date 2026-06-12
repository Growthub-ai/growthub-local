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

Everything else is a read (`GET /api/workspace`) or a specialised governed lane (`refresh-sources`, `test-source`, `helper/query|apply`). There is no third mutation path. Route truth in this tree: `apps/workspace/app/api/workspace/route.js` and `apps/workspace/app/api/workspace/sandbox-run/route.js`.

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

## The verified mutation protocol

Every mutation follows **read → validate → prove → publish → confirm**. Each step uses capability that already exists; none of it is optional ceremony — skipping a step is how value gets destroyed.

```
1. READ      GET /api/workspace                  → workspaceConfig, persistence mode
2. VALIDATE  shape the change against workspace-schema.js (or let helper/query draft it)
3. PROVE     test before binding/publishing:
               data sources   → POST /api/workspace/test-source
               sandbox rows   → POST /api/workspace/sandbox-run (the run IS the test)
               draft graphs   → sandbox-run with {"useDraft": true} — executes the draft
                                without publishing it onto the row
4. PUBLISH   PATCH /api/workspace with ONLY the changed allowlisted key
5. CONFIRM   require HTTP 200 + the returned workspaceConfig before any dependent
             step. A failed PATCH means nothing downstream may be applied.
```

Drafting on behalf of a user? Prefer the helper lane — `POST /api/workspace/helper/query` proposes (no writes), a human reviews, `helper/apply` validates and writes with a receipt. The PATCH allowlist is the helper's hard ceiling too (`docs/WORKSPACE_HELPER_CONTRACT_V1.md` in the source repo).

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
| 409 | `{"error":"workspace config is read-only in this runtime", "guidance": ...}` | Surface `guidance` to the user (edit `growthub.config.json` locally, or `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true` on a writable runtime). Never work around it. |
| 500 | persistence fault | Report; do not mutate files behind the adapter's back. |

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

## Workspace-first rule

Before writing any code, ask: **does a governed object already represent this?** A scheduled job is a sandbox row. An external API is an API Registry row. A data view is a Data Model object bound to a View widget. A multi-agent workflow is a sandbox row with an `agent-swarm-v1` orchestration graph. If the capability exists as an object, your work is two API calls — not a new module. Extend objects; do not deviate into parallel code paths.

## Anti-patterns — boundary violations

- Writing `growthub.config.json` or `growthub.source-records.json` directly while the app is the runtime authority, or inventing a new mutation route/server action.
- PATCHing the whole config back, or keys outside the four-field allowlist.
- Proceeding after a failed PATCH, or publishing a graph that never had a successful draft run.
- Executing sandbox/swarm work via ad-hoc shell instead of `sandbox-run` (you lose run lineage and row stamping).
- Putting credential values in rows, prompts, or PATCH bodies.
- Hand-editing `.growthub-fork/trace.jsonl` or `policy.json` — CLI-written, append-only.
- Keying sandbox rows with lowercase `name`, or putting the payload anywhere but `command`.

If this workspace's route files have diverged from this card, the route files win — runtime implementation overrides docs.
