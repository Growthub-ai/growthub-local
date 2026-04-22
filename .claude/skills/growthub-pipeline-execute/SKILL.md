---
name: growthub-pipeline-execute
description: Headlessly assemble, validate, and execute a Growthub pipeline via `growthub pipeline {assemble,validate,execute}` against the hosted runtime, typed by CMS SDK v1 `ExecuteWorkflowInput` / `DynamicRegistryPipeline`. Use when the user wants a scripted (non-interactive) workflow execution with JSON input, streaming NDJSON events, or an artifact URL returned from a one-liner.
---

# Growthub Pipeline Execute — Headless Scripting Path

Source of truth: `cli/src/commands/pipeline.ts` (`registerPipelineCommands`), `cli/src/runtime/hosted-execution-client/`, `packages/api-contract/src/execution.ts` (CMS SDK v1 public contract).

Pair this skill with:

- `growthub-auth` — required pre-flight (hosted session must be active).
- `growthub-cms-sdk-v1` — type your JSON inputs (`ExecuteWorkflowInput`, `DynamicRegistryPipeline`) and parse streaming events (`ExecutionEvent`).
- `growthub-video-generation` / future image / slides / text skills — the per-family node adapter rules that govern correct bindings.

For interactive assembly + save + execute, use `growthub-discover` instead.

## Environment resolution

Use the first available entrypoint (`REPO` = repo root):

1. `growthub pipeline …` — installed public CLI
2. `node "$REPO/cli/dist/index.js" pipeline …` — branch-built dist
3. `bash "$REPO/scripts/demo-cli.sh" cli -- pipeline …` — tsx loader, no build required

## Command surface

| Command | Purpose |
|---|---|
| `growthub pipeline` | Default: interactive assembler (`runPipelineAssembler`) |
| `growthub pipeline assemble` | Interactive assembly |
| `growthub pipeline validate <file-or-json>` | Validate a pipeline without executing |
| `growthub pipeline execute <file-or-json> [--json]` | Execute the pipeline against the hosted runtime |

Both `validate` and `execute` accept a path to a JSON file OR an inline JSON string.

`--json` on `execute` suppresses the rich terminal UI and returns a machine-readable result.

## Pre-flight (auth)

```bash
growthub auth whoami --json | jq -e '.authenticated == true' >/dev/null \
  || { echo "run growthub auth login first" >&2; exit 1; }
```

Hosted session is read from `$PAPERCLIP_HOME` and checked with `isSessionExpired()` inside `pipeline execute`. If expired, the command throws `Hosted session expired. Run 'growthub auth login' again.` — do not retry silently; surface that to the user.

## Input JSON shape — `DynamicRegistryPipeline`

The CLI accepts this internal shape and compiles it to the hosted wire shape via `compileToHostedWorkflowConfig`:

```json
{
  "pipelineId": "my-pipeline",
  "threadId": "optional-thread-id",
  "executionMode": "hosted",
  "metadata": {
    "workflowName": "My Workflow",
    "description": "",
    "hostedWorkflowId": "optional-if-updating-existing"
  },
  "nodes": [
    {
      "id": "node_img_1",
      "slug": "image-generation",
      "bindings": {
        "prompt": "Simple abstract gradient sphere on white background"
      },
      "upstreamNodeIds": []
    }
  ]
}
```

If `metadata.hostedWorkflowId` is set, the execution updates that saved workflow; otherwise a new hosted workflow is saved as part of execute.

## Type alignment — CMS SDK v1

When constructing the JSON programmatically, type it with the public contract:

```ts
import type { ExecuteWorkflowInput } from "@growthub/api-contract/execution";
import { CAPABILITY_FAMILIES } from "@growthub/api-contract/capabilities";
import { isExecutionEvent } from "@growthub/api-contract/events";
```

The hosted runtime returns `ExecuteWorkflowResult` whose shape matches the CMS SDK v1 types. Every NDJSON line parses cleanly through `isExecutionEvent`. See the `growthub-cms-sdk-v1` skill for field taxonomy.

## Run patterns

### A — one-shot JSON execution (headless, scripting)

```bash
growthub pipeline execute ./pipeline.json --json \
  | tee /tmp/exec.json \
  | jq '{executionId, status, artifacts: .summary.artifacts}'
```

Exit code is non-zero on validation failure or execution error.

### B — inline JSON

```bash
growthub pipeline execute '{
  "pipelineId": "oneshot",
  "executionMode": "hosted",
  "nodes": [{"id":"n1","slug":"image-generation","bindings":{"prompt":"..."}}]
}' --json
```

### C — validate-only (no credits consumed)

```bash
growthub pipeline validate ./pipeline.json --json
```

Use this before `execute` to catch missing-binding or unknown-slug errors without running the hosted workflow.

### D — streaming events (omit `--json`)

Without `--json`, the CLI renders a pre-execution summary box + per-event progress. Under the hood it subscribes to the NDJSON stream via `onEvent` — events conform to `ExecutionEvent` from `@growthub/api-contract/events`:

- `node_start` / `node_complete` / `node_error`
- `progress`
- `credit_warning`
- `complete` / `error`

## Saved vs ad-hoc execution

- **Ad-hoc** — omit `metadata.hostedWorkflowId`. The CLI saves a new hosted workflow as part of execute, then runs it. The resulting `workflowId` is printed.
- **Update existing** — pass `metadata.hostedWorkflowId` explicitly. The saved workflow's config is overwritten with the new pipeline before execution.
- **Saved Workflows lifecycle** (archive / delete) — do not try to do that from `pipeline execute`; use Saved Workflows via `growthub-discover`.

## Non-negotiable rules

1. Always validate first in scripted paths; never blind-execute unvalidated JSON in CI.
2. Respect auth — never retry on `Hosted session expired` without a fresh `auth login`.
3. Use `executionMode: "hosted"`. Local-only mocks are not a substitute for real hosted execution.
4. Do not hand-construct the hosted wire shape (`buildHostedWorkflowConfig`). Pass the `DynamicRegistryPipeline` shape and let the CLI compile it.
5. For family-specific bindings (video, image, slides, text), follow the per-family adapter skill (e.g. `growthub-video-generation` for `refs[].dataUrl`). Do not invent new slot names.
6. Never print raw session tokens or redacted hosted URLs in logs.

## Success criteria

Execution is successful when all are true:

1. `growthub pipeline validate` returned `valid: true` before execute.
2. `growthub pipeline execute --json` produced `{ "status": "succeeded", "executionId": "...", "workflowId": "..." }`.
3. `summary.artifacts` (or equivalent) contains at least one artifact ref with a resolvable URL.
4. No `node_error` / top-level `error` events appeared in the NDJSON stream.
5. User-provided bindings are reflected unchanged in the hosted config (no silent swaps).

## Required response format to the user

Return:

- `executionId`
- `workflowId` (and whether it was newly-saved or updated)
- final artifact URL(s)
- exact bindings shipped (for reference-image payloads: confirm typed `dataUrl` was used)
- streaming event counts (`node_start`, `node_complete`, any `credit_warning`)

If execution failed, name the exact failing event (`node_error` / `error`), the node slug involved, and the error string. Do not retry automatically more than once — surface the error to the user.

## Anti-patterns

- Do not duplicate auth-gated logic by hitting `/api/execute-workflow` directly — go through `pipeline execute` so session, telemetry, and save-then-execute stay consistent.
- Do not mix execution results with provider-assembly (`ProviderAssemblyResult` from `@growthub/api-contract/providers`) — they're separate primitives.
- Do not rely on `pipelineId` for idempotency — use `metadata.hostedWorkflowId` when you need to overwrite a specific saved workflow.
- Do not run `execute` in a loop against the same pipeline without `credit_warning` handling.
