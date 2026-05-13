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

## Local Intelligence metadata vs sandbox execution (operator truth)

Three surfaces stay **orthogonal by design** (safe at scale: no secret fan-out, no second workflow engine):

| Surface | Persists where | What it does |
| --- | --- | --- |
| **Growthub CLI — Local Intelligence** | Paperclip home `native-intelligence/config.json` | Resolves and calls the OpenAI-compatible local model for planning / sandbox **CLI** tasks. |
| **Sandbox row — `localModelId`, `localIntelligenceAdapterMode`** | `growthub.config.json` via `PATCH /api/workspace` (`dataModel`) | **Metadata** for audits, UI, and optional **non-secret** hints to local scripts (see below). Does not start Ollama from the browser. |
| **`POST /api/workspace/sandbox-run`** | Sidecar source records + row `lastResponse` | Runs the selected **sandbox adapter** (`local-process`, `local-agent-host`, serverless, …). |

When `runLocality` is **`local`**, the sandbox-run route may set **non-secret** process env for the adapter child only:

- `GROWTHUB_SANDBOX_LOCAL_MODEL_ID`
- `GROWTHUB_SANDBOX_LOCAL_INTELLIGENCE_MODE`

Scripts opt in by reading these variables; values are length-capped and never include API keys. **Configure the actual model runtime in the CLI** (Local Intelligence); keep the row fields aligned for humans and automation.

**Trace export (CLI):** appending JSONL requires `GROWTHUB_LOCAL_INTELLIGENCE_TRACE_APPEND=1` (fail-closed default). Exported lines are **redacted** for common secret patterns before append.

**Server logs (workspace):** set `GROWTHUB_SANDBOX_RUN_LOG_JSON=1` to emit one JSON line per run (`type=growthub.sandbox.run`, `configFingerprint`, timing, **no** env values).

## Extension points

- Custom adapters: `apps/workspace/lib/adapters/sandboxes/adapters/` (see `README.md` there).
