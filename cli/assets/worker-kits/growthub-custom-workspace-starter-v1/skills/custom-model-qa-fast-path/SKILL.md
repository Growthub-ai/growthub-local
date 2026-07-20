---
name: custom-model-qa-fast-path
description: Export, reuse, boot, pre-warm, configure, and prove a governed llama.cpp custom model with a GGUF base plus adapter and optional Upstash Redis cache. Use when an agent must help a non-technical user establish a safe local custom-model workflow, recover an existing temp QA workspace, diagnose Apple Metal startup, verify signed inference manifests, or capture secret-redacted production-readiness evidence.
---

# Custom Model QA Fast Path

Read `docs/CUSTOM_MODEL_QA_FAST_PATH_V1.md` from the source repo for the full
operator runbook. In an exported workspace, also read
`skills/governed-workspace-mutation/SKILL.md` before any mutation or run.

## Required order

1. Reuse a healthy existing temp export before creating another one.
2. Record the export path, app URL, git commit, and current runtime health.
3. Resolve the base GGUF and adapter from user-confirmed paths; hash both.
4. Bind llama.cpp to `127.0.0.1`; never expose an unauthenticated model server
   to the LAN or internet.
5. Try the normal host profile once. On a real Metal/XPC initialization
   failure, use the documented conservative CPU profile and continue.
6. Pre-warm with a small deterministic request. Require HTTP 200, the tuned
   alias, and schema-valid output.
7. Put Redis/provider credentials only in the server environment or deployment
   secret store. Never print or persist them.
8. Read workspace reality, preflight, PATCH only allowlisted config, prove the
   draft with `sandbox-run`, publish through `workflow/publish`, then run live.
9. Require persisted invocation evidence and `manifest.status: verified`.
10. Restart the exported app after environment changes. Prove Upstash using
    the workspace add-on `/ping`, then prove MISS → HIT on an identical request.
11. Capture secret-redacted receipts, hashes, statuses, and a browser-visible
    result. Leave explicit blockers when any link is missing.

## Safety invariants

- Do not write inside the source repo or `instances/`; use the canonical temp
  exporter for new workspaces.
- Do not overwrite a stable export merely to reproduce setup.
- Do not store credentials in workspace config, source records, docs, git,
  screenshots, terminal transcripts, or chat.
- Do not hand-edit generated manifests or claim a listening port as inference
  proof.
- Do not bypass preflight, the PATCH allowlist, sandbox-run, or publish.
- Do not raise context, batching, parallelism, or GPU use until the bounded
  consumer-hardware profile is stable.

## Completion evidence

Return the app URL; base/adapter hashes; tuned alias; pre-warm status; live run,
source, and receipt IDs; manifest status/SHA; Upstash probe receipt/status;
cache MISS/HIT statuses; and screenshot paths. Redact every secret value.

