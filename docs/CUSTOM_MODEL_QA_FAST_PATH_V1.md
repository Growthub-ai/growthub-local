# Governed Custom Model QA Fast Path V1

This is the reusable agent-assisted path from a disposable exported workspace
to a real local custom-model proof. It is designed for non-technical operators,
consumer Apple hardware, models or adapters stored on any mounted drive, and an
optional Upstash Redis add-on.

The proof bar is one continuous chain:

1. export and boot the owned workspace artifact;
2. pre-warm the exact base model plus adapter on loopback;
3. register only artifact references and SHA-256 identities;
4. test the draft through `sandbox-run`;
5. publish through the server-authoritative workflow route;
6. run live and confirm a persisted, signed, verified manifest;
7. confirm Upstash from the workspace runtime, then prove a cache hit.

Never paste provider tokens, Redis tokens, cookies, or `.env.local` contents
into chat, logs, screenshots, source records, workspace config, or git.

## 1. Reuse before creating

An agent must first look for a healthy existing temp export and reuse it. A
new export loses warm dependencies, cache state, and useful run evidence.

For a new disposable workspace, use the canonical seed exporter:

```bash
GROWTHUB_KIT_EXPORTS_HOME="/path/outside/the/repo" \
  node scripts/export-seed-workspace.mjs
```

The script refuses repo-local and `instances/` targets, creates a timestamped
run, seeds before boot, validates the exported implementation, installs the
app, and starts `next dev --webpack`. Keep the repo-runtime lane and exported
workspace lane separate.

For an existing export, do not run the exporter again. Record its app path,
URL, process, current git commit, and health response. Restart only that app
when runtime environment variables changed.

## 2. Resolve artifacts without drive assumptions

Let the agent locate candidates; let the human confirm ambiguous choices.
Use variables instead of embedding a username, volume label, or absolute path
in committed files:

```bash
export GROWTHUB_MODEL_BASE_GGUF="/mounted-drive/models/base.q4_k_m.gguf"
export GROWTHUB_MODEL_ADAPTER_GGUF="/mounted-drive/models/adapter.gguf"
export GROWTHUB_MODEL_ALIAS="workspace-local-tuned-v1"
```

Before starting a server, verify both files are readable and calculate their
SHA-256 values. The governed API Registry row stores the hashes and artifact
references; it never stores credentials. A moved drive needs a path repair,
not a fabricated identity.

## 3. Start and pre-warm llama.cpp

Bind to loopback only. Start with the host's normal llama.cpp defaults. On
consumer Apple Silicon, Metal is appropriate when it initializes reliably.
If macOS reports a Metal/XPC initialization failure, use the bounded CPU-safe
profile below instead of repeatedly relaunching a broken GPU process:

```bash
llama-server \
  --model "$GROWTHUB_MODEL_BASE_GGUF" \
  --lora "$GROWTHUB_MODEL_ADAPTER_GGUF" \
  --alias "$GROWTHUB_MODEL_ALIAS" \
  --host 127.0.0.1 --port 18081 \
  --ctx-size 1024 --batch-size 64 --ubatch-size 32 --parallel 1 \
  --n-gpu-layers 0 --device none --flash-attn off --no-warmup
```

These conservative values favor broad consumer-machine compatibility over
throughput. Increase context, batching, parallelism, or GPU layers only after
the baseline proof is stable.

Pre-warm with one small deterministic OpenAI-compatible request. Require:

- HTTP 200;
- the configured tuned alias in `model`;
- schema-valid output;
- no provider key for a loopback-only server.

Do not claim readiness from a listening port alone.

## 4. Connect the governed workspace

Use the runtime contract in
`skills/governed-workspace-mutation/SKILL.md`. The sequence is:

```text
GET /api/workspace
POST /api/workspace/patch/preflight
PATCH /api/workspace
POST /api/workspace/sandbox-run { useDraft: true }
POST /api/workspace/workflow/publish
POST /api/workspace/sandbox-run
GET /api/workspace
```

Register an API Registry model row with:

- loopback `baseUrl` and `/v1/chat/completions` endpoint;
- expected tuned model alias;
- base-model and adapter SHA-256 identities;
- bounded cache, schema, routing, and redaction policy.

Register the mothership policy and reference it from an existing
`sandbox-environment` workflow. Add both registry IDs and the precise
`objectId:Name` workflow ref to the app registry before app-scoped execution.

Direct PATCH cannot create `inferenceManifests`. A successful draft run
produces the signed manifest evidence; `workflow/publish` is the only route
that can bind it to the live row. A live run is complete only when its receipt
is persisted and `manifest.status` is `verified`.

## 5. Configure Upstash without leaking credentials

Use the workspace add-on flow. Keep the REST URL and token in the exported
app's server-only environment file or deployment secret store. Never place
them in `growthub.config.json` or an agent message.

After adding or rotating credentials, restart the exported app so its server
process receives the new environment. Then run the add-on sync/probe and
require the workspace runtime itself to report `/ping` HTTP 200. A shell-level
`PING` is useful diagnosis but is not workspace proof.

Set a stable operator-owned `GROWTHUB_INFERENCE_CACHE_NAMESPACE`. Prove the
sequence on an identical cacheable request:

```text
first run:  MISS and remote cache ready
second run: HIT with the same cache key and scope
```

Cache keys include tenant, app, and integration scope. Never weaken that
derivation to make a demo hit.

## 6. Evidence to retain

Bank only secret-redacted evidence:

- export/app path and boot URL;
- git commit and runtime timestamp;
- model alias plus base/adapter hashes;
- llama.cpp health and deterministic pre-warm result;
- sandbox run ID, invocation source ID, and verification receipt ID;
- manifest status and manifest SHA;
- Upstash add-on receipt and `/ping` status;
- first-run/second-run cache statuses and hashed cache identity;
- browser screenshot of the visible Run Console or Data Model result.

Do not retain raw `.env` content, tokens, auth headers, provider payload
credentials, or unredacted environment dumps.

## Banked PR #289 reality

The reusable temp export on 2026-07-20 proved this path on consumer Apple
hardware:

- the exact external-drive base GGUF plus adapter loaded through llama.cpp;
- the tuned alias returned HTTP 200 with the schema-valid `stable` result;
- governed live run `run_mrsmy6pm_cvyqqs` persisted receipt
  `infr_bdd89d4f356e582e1558_94783b85a4a11c11` with a verified manifest;
- after restarting the same exported app, the Upstash add-on sync persisted
  receipt `aor_mrsn4h4g_c93l28` and its runtime `/ping` returned HTTP 200.

Artifact paths and all credentials are intentionally omitted. The hashes in
the governed receipts are the portable identity proof.

