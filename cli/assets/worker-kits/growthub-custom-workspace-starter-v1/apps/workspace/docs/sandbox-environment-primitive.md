# Sandbox Environment (governed data object)

`objectType: "sandbox-environment"` is an execution-plane manual object alongside Data Source, API Registry, People, Tasks, and Custom tables. Rows live in **`growthub.config.json#dataModel.objects[]`** — the same PATCH allowlist (`dataModel`) and validator (`apps/workspace/lib/workspace-schema.js`) as every other governed object.

## Persistence and upgrades

Deployed workspaces that adopted an older sandbox preset **without** `runLocality` / `schedulerRegistryId` columns keep working: `POST /api/workspace/sandbox-run` treats blank or unknown `runLocality` as **`local`** (`normalizeRunLocality` + `DEFAULT_SANDBOX_RUN_LOCALITY`). Persisted rows pick up defaults at **read time**, so operators do not have to replay migrations for existing JSON on disk until they decide to expose the new controls in the table.

Operators who want the radios and scheduler FK in the Data Model grid should add columns `runLocality` and `schedulerRegistryId` to the object (matching the preset) and save via the normal PATCH path.

## Where it runs (`runLocality`)

| Value | Behaviour |
| --- | --- |
| **`local`** (default when unset / empty / unknown) | `lib/adapters/sandboxes/` resolves an adapter (`local-process`, `local-agent-host`, drop-zone). Spawn + capture happen on the Next.js host. Secrets come only from server-resolved **`envRefs`** / env. |
| **`serverless`** | No local agent-host spawn. Outbound **`POST`** to the URL merged from API Registry row identified by **`schedulerRegistryId`** (same pattern as Data Source **`registryId`**: `integrationId`, `authRef`, `baseUrl`, `endpoint`, headers resolved server-side). Body kind **`growthub-sandbox-run-v1`**. **`local-agent-host`** is rejected in this locality. Responses map to **`stdout`** / **`stderr`** / **`exitCode`** so `lastResponse` and **`growthub.source-records.json`** stay uniform. |

The scheduler webhook is deliberately thin **any** reachable HTTPS handler (Supabase Edge, Upstash/QStash-queued worker, `vercel.json` cron hitting your URL, DIY). Postgres / KV-backed workflow queues in workspace config describe *where persistence lives*, not the sandbox row itself; the **`schedulerRegistryId`** row is only the outbound HTTP binding.

Agents and streamed APIs elsewhere in the sandbox stay orthogonal: serverless swaps **who invokes** the sandbox run boundary, not the rest of workspace networking.

## Credential surface

Sandbox rows reference **`authRef` / named env refs** — never literals in browser or config records. Scheduling uses the referenced API Registry row’s **`authRef`** merge rules identical to **`/api/workspace/test-source`**.

## Not a widget source

Workspace Builder excludes **`sandbox-environment`** from View widget bindings (execution records, not tabular KPI sources). See **`data-sources-api-registry.md`** in this folder.

## Extension points

- Custom adapters: `apps/workspace/lib/adapters/sandboxes/adapters/` (see `README.md` there).

## Claude Code local auth onboarding

Sandbox rows whose **`adapter` is `local-agent-host`** and **`agentHost` is `claude_local`** require the Claude Code CLI to be authenticated on the local machine before a run will succeed. The record sidecar exposes a dedicated **Claude Code local auth** panel beside the existing **Run sandbox** bar:

- **Check status** — probes `claude --version` to verify the CLI is on PATH.
- **Run Claude login** — spawns `claude auth login` and surfaces stdout / stderr / login URL.
- **Log out** — spawns `claude auth logout`.

The flows are wired through `POST /api/workspace/sandbox-agent-auth/{status,claude-login,claude-logout}` and share the helper in `apps/workspace/lib/sandbox-agent-auth.js`. They mirror the upstream Paperclip server route in `server/src/routes/agents.ts` so behaviour matches the hosted agents surface.

Authority invariants:

- Claude auth setup is **separate** from the `local-agent-host` execution adapter — the adapter at `lib/adapters/sandboxes/default-local-agent-host.js` stays execution-only and does not mutate any host config file.
- Raw Claude tokens **never** enter `growthub.config.json`. The CLI manages its own on-disk auth state. The sandbox row stores only safe metadata: `agentAuthStatus`, `agentAuthProvider`, `agentAuthLastChecked`, `agentAuthLastExitCode`, `agentAuthLastMessage`, `agentAuthLastLoginUrl`.
- Token-shaped output in stdout / stderr is redacted server-side before crossing the response boundary.
- The panel is hidden when `agentHost` is anything other than `claude_local`, and when `runLocality === "serverless"` (the local CLI is irrelevant in that case).
