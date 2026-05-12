# Sandbox Adapters

Drop one `.js` file per execution target here. Each file calls `registerSandboxAdapter()` once at module load.

This is the thin agnostic extension point for the **`sandbox-environment` governed Data Model object**. Two default adapters ship eagerly with every workspace, loaded by `lib/adapters/sandboxes/index.js`:

- **`local-process`** (`default-local-process.js`) — spawns python3 / node / bash inside an isolated `/tmp/growthub-sandbox-*` workdir with timeout + captured stdio. Use this when the row is a deterministic script.
- **`local-agent-host`** (`default-local-agent-host.js`) — Paperclip thin local adapter. Routes the row through whichever local agent host CLI the operator has on PATH (Claude Code, Codex, Cursor, Gemini, OpenCode, Pi, Qwen, Hermes, OpenClaw Gateway). Cross-platform — works on macOS, Windows, and Linux. Slugs mirror the canonical `AGENT_ADAPTER_TYPES` enum so a row is portable to the upstream Paperclip server adapter registry without translation.

Files added to this drop-zone are loaded by `adapter-loader.js` on the first sandbox-run route invocation. Use the drop-zone for hardened isolation primitives (firejail, gVisor, Docker, Fly Machines, e2b, modal.com) or for additional agent host targets the canonical catalog does not yet cover.

## Adapter shape

```js
import { registerSandboxAdapter } from "../sandbox-adapter-registry.js";

registerSandboxAdapter({
  id: "your-target-slug",                // stable adapter slug, must match the row's `adapter` column
  label: "Human-readable label",
  description: "1-line capability hint for the drawer dropdown",
  locality: "local" | "serverless" | "remote",
  supportedRuntimes: ["python", "node"],
  run: async (request) => RunResult
});
```

`request` is a sealed envelope minted by the sandbox-run route. It includes a freshly-created workdir (under `/tmp/growthub-sandbox-*`), the user's `command`, the `runtime`, the `timeoutMs`, the `networkAllow` boolean, the explicit `allowList`, and a server-resolved `env` object plus the audit-only `envRefSlugs` / `envRefsMissing` arrays. **Never** reach outside `request.env` for credentials and never log secret values, even on error paths.

`RunResult` must include `{ ok, exitCode, durationMs, stdout, stderr, error?, adapterMeta? }`. The route writes the full result into `growthub.source-records.json` keyed by the sandbox row's stable sourceId, and also stamps `status` / `lastTested` / `lastResponse` on the row in `growthub.config.json` via the standard governed PATCH path.

## Hard rules

1. **No credential resolution inside the adapter** — the route already resolved env refs server-side. Adapters consume `request.env` only.
2. **No filesystem writes outside the workdir** — workdir is the single owned scratch space; the route cleans it after the run.
3. **No mutation of `growthub.config.json` or `growthub.source-records.json`** — the route owns versioned record persistence.
4. **No browser-side execution** — adapters run server-side only. The browser never imports this folder.
5. **No silent secret logging** — even on stderr, redact env values before returning.

## Agent CLI commands

```bash
# List registered sandbox adapters (id + label + locality + supported runtimes)
curl -s http://localhost:3000/api/workspace/sandbox-adapters

# Run a single sandbox row by objectId + sandbox name
curl -s -X POST http://localhost:3000/api/workspace/sandbox-run \
  -H "Content-Type: application/json" \
  -d '{
    "objectId": "my-sandboxes",
    "name": "data-prep"
  }'
```

Versioned run history lives in `growthub.source-records.json` under `sandbox:<objectId>:<slug(name)>` and survives fork export/import alongside the rest of the workspace artifact.

## Serverless scheduling (`runLocality === "serverless"`)

When the sandbox row’s **`runLocality`** is **`serverless`**, the sandbox-run route does **not** call `run()` on `local-process` / `local-agent-host`. Execution is delegated to an HTTP scheduler:

1. **`schedulerRegistryId`** must equal an API Registry row’s **`integrationId`** (webhook-capable deployment URL + method + **`authRef`**).
2. The route mints **`growthub-sandbox-run-v1`** JSON (no secrets inline) and **POST**s using the merged registry/request shape (parity with outbound test routes).
3. The handler translates its own queue (KV, Postgres, cron tick, etc.) into a normal JSON or text reply; the route maps that reply into **`stdout`**, optional **`stderr`**, and **`exitCode`** — same **`lastResponse`** / sidecar semantics as **local**.
4. Drop-zone adapters labelled **`locality: "serverless"`** are **not** used for delegation today; outbound HTTP replaces them so operators wire **already-supported** integrations + infra without a second resolver graph.
