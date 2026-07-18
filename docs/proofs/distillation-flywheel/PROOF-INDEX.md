# Distillation Utilization — Live Closed-Loop Proof Index

Real-browser + real-HTTP capture of the custom-models **utilization** closed
loop on a fresh exported boot, extending the 16-state journey proofs
(`../custom-model-pipeline/states-16-live/`). Every PNG is the real UI;
every readback field is read from the DOM or derived from the live governed
rows; **every chat completion in this set is a real HTTP round trip with a
real 200** — no response body is fabricated by the harness.

## Capture provenance

- **Boot:** `GROWTHUB_KIT_EXPORTS_HOME=… node scripts/export-seed-workspace-model-qa.mjs`
  → fresh `next dev` on `http://127.0.0.1:3777` (same lane as the 16-state capture;
  ledger-hydration parity asserted: graded=11, ready=true, floor=10).
- **Model endpoint:** `node scripts/lib/distillation-teacher-endpoint.mjs`
  → a REAL local OpenAI-compatible HTTP server on `127.0.0.1:11434`. The
  content it serves under the workspace tag is **teacher-generated**
  (produced by dispatched Claude agent runs — the teacher/professor dynamic;
  provenance declared in `scripts/lib/distillation-teacher-pack.json`), and
  **every exchange is harvested** to a `growthub-distillation-trace-v1`
  JSONL — serving IS trace capture. This is the mothership-proxy
  realization of the custom model: honest about what generates the content,
  real about every byte on the wire.
- **Harness:** `BASE_URL=… MODEL_URL=… APP_DIR=… HARVEST=… node
  scripts/e2e-distillation-utilization-playwright.mjs` → **15/15 live checks**.
- **Provenance legend:**
  - `derived` — pure derivation over the live governed rows;
  - `live-http-transport, simulated-model` — the HTTP round trip, status
    codes, payloads, browser captures, and workflow executions are REAL and
    observed on the wire; the MODEL IDENTITY is a stand-in (teacher-pack
    content served under the workspace tag — no weights were trained). Tag
    verification here proves the VERIFICATION PLUMBING (tag contract), not
    that a tuned model exists;
  - `cli-stamped` — written into the sidecar file by the harness through the
    CLI-owned lane (filesystem persistence mode);
  - the training receipt wired for the ladder is a labeled FIXTURE
    (`runnerMode: "fixture"`) — same class as the 16-state capture's
    "simulated (stamped receipt)" provenance. The physical fine-tune remains
    the operator's deferred step.

## Real defects found and fixed BY this proof (strict-contract dividends)

1. **Bodyless chat POST** — the orchestration-graph runner sent NO request
   body when a node had no `bodyTemplate`, so every custom-model workflow
   node 400'd against a compliant OpenAI server (Ollama/vLLM). Fixed at the
   right layer: the runner now builds the canonical chat body from the
   governed record's own declared capability (`capabilities:
   "chat-completions"` + `expectedModelTag`), JSON-safe for any prompt,
   identical across persistence adapters. `bodyTemplate` remains the
   explicit override.
2. **Bodyless endpoint test** — `POST /api/workspace/test-api-record` sent
   no body either, so "Test" against a real model server read as failure;
   it now sends the canonical identity probe for chat-completions records.
3. **Duplicate atomic identity rows** — the Training Handoff apply step
   blind-appended the custom-model api-registry row on every prepare;
   now an upsert by `integrationId`.
4. **Real runs could never reach `complete`** — only seeded fixtures carried
   `outputHash`; the sandbox-run runtime now hashes its own stdout.
5. **Forgeable run proof** — the /custom-models ladder trusted PATCH-writable
   row stamps; the runtime sidecar (`sandbox:<objectId>:<row>`, PATCH-blocked)
   is now authoritative when present: a `lastRunId` with no matching runtime
   record demotes.

## Full journey — 16-state recapture on this branch (`journey-16-states/`)

`e2e-custom-model-16-states-playwright.mjs` re-run on a fresh boot of THIS
branch: **14/18 live checks** with every state's screenshot + readback
captured (states 00–16, including the negative gates: unsafe input blocks
Prepare, base-tag never verifies, classified `fine_tune_oom` → resume).
The four missed checks are container-environment, not regressions:
state-08's REAL preinit ran `pip` and honestly surfaced this container's
SSL-intercepting proxy as a classified failure (screenshotted — the
troubleshooting loop working on a real machine constraint), and the failed
probe's resets cleared the later terminal stamps (states 03/14/16 depend on
them mid-script). The same states are proven live by the utilization set
below on the same boot: util-01 (deploy/first-invocation = states 12–14) and
util-04 (cockpit = state 16, with the model-loop card rendered from live
evidence).

## State map

| # | State | Screenshot | Readback | What is proven | Lane |
| --- | --- | --- | --- | --- | --- |
| util-00 | Live boot eligible | `util-00-live-boot-eligible.png` | `util-00-live-boot-eligible-readback.json` | browser ⟺ API ⟺ `deriveDistillationPipelineState` agree (graded 11 / floor 10) | derived |
| util-01 | First invocation · HTTP 200 | `util-01-first-invocation-200.png` | `util-01-first-invocation-200-readback.json` | the APP SERVER calls the endpoint through `POST /api/workspace/test-api-record` → real 200 chat completion → stamped on the registry row → `deriveEndpointVerification` proves served == tuned tag | live-http |
| util-02 | Utilization across clusters | — | `util-02-utilization-clusters-readback.json` | the SHIPPED `captureChatCompletion()` drives 4 real business prompts (GTM, narrative continuity, code transformation, probe) — 200 × 4, tuned tag on every reply, `model-invocation` receipts written | live-http |
| util-03 | Harvest receipt | — | `util-03-harvest-receipt-readback.json` | the endpoint harvested every live exchange (22 traces) → root-hashed `trace-capture` receipt in the sidecar → provably NOT a training run (`deriveTrainingRunState` unchanged) | live-http |
| util-04 | One-click workflow + cockpit complete | `util-04-cockpit-complete.png` | `util-04-cockpit-complete-readback.json` | the cockpit's one-click lane end-to-end: draft PATCH → **real draft test-run** (orchestration-graph adapter executes the api-registry-call against the endpoint) → attest → `POST /api/workspace/workflow/publish` → **live run whose stdout IS the chat completion**, with the runtime-hashed `outputHash` — `/custom-models` reads **complete · verified**, rendering the continuum (Harvest/Train/Evaluate/Serve), usage (runs · workflows · tokens · call nodes), permissions, and the one-click utilization actions | live-http |
| util-05 | Demotion negative + recovery | `util-05-demotion-negative.png` | `util-05-demotion-negative-readback.json` | the endpoint REALLY serves the base tag (still a 200) → cockpit demotes to `deployed`, mothership proxy falls back to `local-base` (the model keeps answering) → a real re-invocation restores `complete` | live-http |
| util-06 | Data-model tables | `util-06-table-apiRegistry.png`, `util-06-table-modelTrainingRun.png`, `util-06-table-trainingTraces.png` | `util-06-data-model-tables-readback.json` | the governed tables themselves — api-registry (endpoint + stamped completion), model-training-run (distillation receipt), training-traces — the single source of truth every claim above derives from; no secrets in any row | derived |
| util-07 | Teacher provenance | — | `util-07-teacher-provenance-readback.json` | the chain: teacher pack (agent-generated, provenance declared) → served bytes → harvested traces (reasoning present) → sidecar root hash | live-http |

## Governance negatives observed during capture (not staged)

- Direct PATCH of runtime-owned sandbox fields (`lastRunId`, `lastResponse`)
  → **422 patch rejected by workspace mutation policy** — which is exactly
  why the one-click lane goes draft → test-run → attest → publish.
- Live `orchestrationConfig` on a new row via PATCH → refused
  (`live_workflow_field`), forcing the `orchestrationDraft*` path.
- A base-model response never verifies and demotes the cockpit to
  `deployed` while the proxy keeps the model serviceable.

## What remains operator-real

The physical fine-tune that would replace the teacher-backed realization
with locally trained weights runs on operator hardware (same deferred class
as the 16-state capture). The loop proven here is the exact loop that model
drops into: the registry row, verification, workflow lane, harvest, and
cockpit do not change — only the process behind `127.0.0.1:11434` does.
