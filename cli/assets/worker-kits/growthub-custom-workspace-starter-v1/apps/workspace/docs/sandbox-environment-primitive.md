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

## Local agent auth onboarding

Sandbox rows whose **`adapter` is `local-agent-host`** route execution through whichever local agent CLI is registered for `agentHost` (Claude Code, Codex, Cursor, Gemini, OpenCode, Pi, Qwen, Hermes, OpenClaw Gateway). The record sidecar exposes a **uniform** auth onboarding panel beside the existing **Run sandbox** bar — the mental model is identical for every host:

1. **Check status** — probes the host CLI for reachability and (where the catalog declares one) a real auth-status subcommand.
2. **Run login** — only shown when the host catalog declares a documented `loginCommand`. Spawns it server-side and surfaces stdout / stderr / login URL.
3. **Log out** — only shown when the host catalog declares a documented `logoutCommand`.
4. **Run sandbox** — existing button (unchanged execution path).

Per-host capabilities (binary path, install hint, login/logout subcommands, notes for hosts without a documented login flow) are declared in **`apps/workspace/lib/sandbox-agent-host-catalog.js`**. Adding a new host means adding one entry there — never extending the auth helper or the panel component. The catalog is the single source of truth for "what does this host's onboarding look like?".

Wired through `POST /api/workspace/sandbox-agent-auth/{status,login,logout}` and the helper at `apps/workspace/lib/sandbox-agent-auth.js`. The Claude flow mirrors the upstream Paperclip server route in `server/src/routes/agents.ts` (`claude auth login` / `claude auth logout`) so behaviour matches the hosted agents surface.

### Status semantics — uniform across every host

| Status      | Meaning                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| `active`    | A real auth probe confirmed authentication (login exit 0, or `auth status` exit 0). |
| `reachable` | The CLI is callable (`--version` exit 0) — but authentication is **not** yet confirmed. |
| `stale`     | The CLI is reachable but printed auth-shaped failure output.                     |
| `missing`   | The binary is not on PATH.                                                       |
| `checking`  | Transient UI state during a probe.                                               |
| `unknown`   | Indeterminate.                                                                   |

A `--version` (or equivalent reachability) probe **never** promotes to `active`. The next sandbox-run is the source of truth for session readiness.

### Authority invariants

- Auth setup is **separate** from the `local-agent-host` execution adapter — the adapter at `lib/adapters/sandboxes/default-local-agent-host.js` stays execution-only and does not mutate any host config file.
- Raw host tokens **never** enter `growthub.config.json`. Each CLI manages its own on-disk auth state. The sandbox row stores only safe metadata: `agentAuthStatus`, `agentAuthProvider`, `agentAuthLastChecked`, `agentAuthLastExitCode`, `agentAuthLastMessage`, `agentAuthLastLoginUrl`.
- Token-shaped output (`sk-ant-…`, `sk-…`, JWT, `Bearer …`, prefix patterns like `access_token=`, `api_key=`) is redacted server-side before crossing the response boundary.
- The schema rejects out-of-band PATCHes that try to stash a secret field (`token`, `apiKey`, `accessToken`, `refreshToken`, `bearer`, `password`, `secret`, `sessionKey`) on a sandbox row.
- The panel is hidden when `runLocality === "serverless"` (the local CLI is irrelevant in that case), when `adapter !== "local-agent-host"`, or when `agentHost` is not registered in the host auth catalog.
- Hosts without a documented login subcommand show only the **Check status** button plus the catalog's `notes` line directing the operator to sign in via the host CLI directly. No invented subcommands.

## Browser / local agent fast lane

Browser-capable workflows are **not a new runtime** — they are local sandbox rows (`local-process` or `local-agent-host`) exposed through a first-party no-code panel in the record drawer. The lane is an exposure of contracts that already exist:

- **Eligibility** is derived (pure, evidence-driven) by `apps/workspace/lib/sandbox-browser-agent-flow.js`. A row is browser-relevant when it carries safe metadata (`browserMode`, `requiresBrowser`, `browserProfile`, `platform`), its graph declares a browser-tagged node, or persisted run history already contains browser/notebook proof. `local-intelligence` rows and non-sandbox objects never surface the panel.
- **Run inputs** come from templates in `apps/workspace/lib/sandbox-browser-run-inputs.js` (`browser-research`, `notebook-brief`, `profile-review`, `manual-browser-smoke`). Templates only pre-fill the existing `growthub-workflow-run-inputs-v1` envelope — they execute nothing. Execution is always `POST /api/workspace/sandbox-run`.
- **Input delivery**: for local runs with `runInputs`, the route exposes the runner-safe projection (secretRefs stripped, values redacted) to the spawned process as `GROWTHUB_RUN_INPUTS_JSON`, so command/script rows consume manual inputs with no new adapter.
- **Proof** is normalized by `extractBrowserProof` from persisted run receipts only: `{ platform, targetUrl, initialUrl, currentUrl, title, reachedTarget, browserExitCode, artifact, fallbackUsed }`. NotebookLM-style `notebook` proof normalizes to browser proof (`platform: "notebooklm"`, `chromeExitCode` → `browserExitCode`). `reachedTarget` and artifact claims are read verbatim from run output — never synthesized; fallback runs demote below "connected" truthfully. Row status fields alone never promote the lane.

### Safety invariants (operator-owned sessions)

- `sendMode` is constrained to `read-only | draft-only | manual-review | operator-approved-action`; the default is `read-only`.
- Any externally mutating sendMode requires `operatorApproved: true` **and** an explicit target — and required operator-approval booleans are satisfied only by an explicit `true`, never a default.
- Credential-shaped field ids and token-shaped values are rejected before an envelope is built; the server re-redacts via `normalizeRunInputsEnvelope`, and the schema still rejects token-shaped row fields. `inputSummary` persists field ids only — never values.
- No credential extraction, cookie dumping, login/CAPTCHA bypass, stealth automation, or batch external actions. First-pass allowed behaviour is reading user-visible content, navigating to operator-provided targets, drafting, and generating artifacts.
- Browser/session-cache access is **local-only**. `runLocality: serverless` rows show a read-only note; future hosted browser execution delegates through the existing `schedulerRegistryId` API Registry lane — no parallel contract.
