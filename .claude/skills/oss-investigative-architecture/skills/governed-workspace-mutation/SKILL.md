---
name: governed-workspace-mutation
description: Contract card for the two canonical governed-workspace API calls — PATCH /api/workspace (config mutation, 4-field allowlist) and POST /api/workspace/sandbox-run (sandbox execution). Read this before any agent makes a workspace-configuration mutation so the call is correct, token-efficient, and never violates the authority boundary.
progressiveDisclosure: false
---

# Governed Workspace Mutation — the two canonical API calls

A governed Growthub workspace (`growthub-custom-workspace-starter-v1` and every fork of it) has exactly **two** canonical mutation calls. Everything else an agent does against the workspace runtime is a read, or it is out of bounds.

| Intent | One true call |
|---|---|
| Change workspace configuration (`growthub.config.json`) | `PATCH /api/workspace` |
| Execute a sandbox-environment row (incl. agent-swarm graphs) | `POST /api/workspace/sandbox-run` |

Authority source: `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md` §"Authority boundary". Route truth: `apps/workspace/app/api/workspace/route.js` and `apps/workspace/app/api/workspace/sandbox-run/route.js` (paths relative to the starter kit / fork).

## Call 1 — `PATCH /api/workspace`

**Permanent allowlist — exactly four keys:** `dashboards`, `widgetTypes`, `canvas`, `dataModel`. Any other key in the body is rejected before validation (HTTP 400 with `details: [unknownKeys]` and `allowed: [...]`). Other config fields (branding, capabilities, integrations, `id`) are preserved through the round-trip but never accepted on PATCH.

**Token-efficient recipe — read, modify one key, send only that key:**

```bash
# 1. Read current config (response key: workspaceConfig)
curl -s "$WS/api/workspace" | jq '.workspaceConfig.dataModel'

# 2. Patch ONLY the allowlisted key you changed — never echo the whole config
curl -s -X PATCH "$WS/api/workspace" \
  -H 'content-type: application/json' \
  -d '{"dataModel": <full updated dataModel value>}'
# Success → { "workspaceConfig": <next full config> }
```

Each allowlisted key is replaced whole (sanitized object passes through `writeWorkspaceConfig`), so send the complete updated value **for that key**, but never include keys you did not change.

**Error envelope — handle all four, never retry blindly:**

| Status | Meaning | Agent action |
|---|---|---|
| 400 `patch contains unknown fields` | Key outside the allowlist | Remove the key. Do not look for another route — there is none. |
| 400 `INVALID_WORKSPACE_CONFIG` | Validator (`apps/workspace/lib/workspace-schema.js`) rejected the value | Fix per `details`; read the schema file, don't guess. |
| 409 `workspace config is read-only in this runtime` | Serverless / read-only persistence adapter | Surface the response's `guidance` to the user (edit `growthub.config.json` locally, or `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true` on a writable runtime). Never work around it. |
| 500 `WORKSPACE_PERSISTENCE_PATH_REFUSED` / other | Persistence fault | Report; do not mutate files behind the adapter's back. |

**Hard invariants (topology §Authority boundary):**

- `dataModel.objects[]` edits must **not** create widgets or mutate canvas placement as a side effect. Binding an object to a dashboard is a separate user action on an existing View widget.
- `workspaceSourceRecords` (the sidecar) is GET-only hydration data — sidecar writes flow through `POST /api/workspace/refresh-sources`, never through PATCH.
- The schema rejects secret-shaped fields (`token`, `apiKey`, `accessToken`, `refreshToken`, `bearer`, `password`, `secret`, `sessionKey`) on sandbox rows. Rows carry `authRef` / env-ref **names** only — never credential values.
- Sandbox-environment rows are not View-widget sources; do not bind them.

**Drafting on behalf of a user?** Prefer the governed helper lane — `growthub workspace helper query` (propose, no writes) → human review → `helper apply` (validated write + receipt). The PATCH allowlist is the helper's hard ceiling too; see `docs/WORKSPACE_HELPER_CONTRACT_V1.md`.

## Call 2 — `POST /api/workspace/sandbox-run`

Executes one row of a `sandbox-environment` governed Data Model object through the registered sandbox adapter. This is the **only** execution entry — agent-swarm graphs, local agent hosts, and serverless schedulers all go through it.

```bash
curl -s -X POST "$WS/api/workspace/sandbox-run" \
  -H 'content-type: application/json' \
  -d '{"objectId": "<dataModel object id>", "name": "<row name>"}'
# Optional: "useDraft": true, "draftGraph": <string|object> for orchestration-graph drafts
```

**Response (success):** `{ ok, status: "connected"|"failed", runId, adapter, runtime, exitCode, durationMs, persisted, sourceId, response }` where `response` (also stamped onto the row as `lastResponse`) carries `runLocality`, `stdout`, `stderr`, `envRefsResolved`/`envRefsMissing` (**slug names only — never values**), `networkAllow`, `allowList`, `browserAccess`, `adapterMeta`.

**Side effects you get for free (do not replicate manually):**

1. A versioned run record appended to `growthub.source-records.json`, keyed `sandbox:<objectId>:<slug(name)>` — full history travels with the workspace artifact.
2. The row stamped with `status`, `lastTested`, `lastRunId`, `lastSourceId`, `lastResponse`.

**Locality is data, not code:** `runLocality: "local"` (default for blank/unknown) resolves an adapter under `apps/workspace/lib/adapters/sandboxes/`; `"serverless"` delegates via outbound POST to the API Registry row named by `schedulerRegistryId` using the `growthub-sandbox-run-v1` envelope (credentials resolve server-side from `authRef`; the wire carries slugs and booleans, never secrets). `local-agent-host` is rejected in serverless locality. Reference: starter kit `apps/workspace/docs/sandbox-environment-primitive.md`.

## Anti-patterns — violations of the boundary

- Inventing a new mutation route, server action, or direct file write to `growthub.config.json` / `growthub.source-records.json` while the app is the runtime authority.
- PATCHing keys outside the four-field allowlist, or "batching" non-allowlisted fields hoping they pass.
- Creating widgets or touching `canvas` as a side effect of a `dataModel` edit.
- Executing sandbox/swarm work via ad-hoc shell instead of `sandbox-run` (you lose the source-record lineage and row stamping).
- Placing credential values in rows, prompts, or PATCH bodies — only `authRef` / env-ref names cross the wire.
- Hand-editing `.growthub-fork/trace.jsonl` or `policy.json` — those are CLI-written, append-only surfaces.

## Verify before you claim

Every statement above is checkable in one read pass: `route.js` (allowlist + error codes), `sandbox-run/route.js` (request/response + persistence), `workspace-schema.js` (validator), `GOVERNED_WORKSPACE_TOPOLOGY_V1.md` (boundary), `WORKSPACE_HELPER_CONTRACT_V1.md` (propose→apply lane). If a workspace fork has diverged, its own route files override this card — runtime implementation overrides docs.
