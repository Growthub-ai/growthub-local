# Custom Models V1 — 16-state real browser proof

Using Codex IAB via `browser-client.mjs`. Backend: `iab`. Live action layer:
`tab.cua.<method>`. Readback layer: `tab.playwright.evaluate` / DOM snapshot,
corroborated by `GET /api/workspace`, Ollama's OpenAI-compatible response, and
the persisted sandbox source record.

The first eight states prove the initial customer journey and the actual runner
invocation. The runner's 8 GB machine preflight result is retained as process
evidence and is **not** called a trained model. States 9–16 use the explicitly
labelled existing-installed-model QA fixture to prove the post-model product
outcomes: exact-tag invocation, Custom Models cockpit, workflow creation,
draft test, publish, live run, output hash, and trace harvest.

| # | Screenshot | Proven UI state |
|---|---|---|
| 01 | `01-helper-setup.png` | Workspace home → Ask helper → first-use governed helper setup |
| 02 | `02-training-ledger.png` | `/training` command opens the real training ledger in the helper |
| 03 | `03-training-runtime-eligible.png` | 11 qualified traces, floor 10, no run receipt yet |
| 04 | `04-trace-mapping.png` | QA trace fields visibly mapped and labelled as seed QA evidence |
| 05 | `05-training-plan-ready.png` | Default local pipeline, discovered base/runtime/folder/tools |
| 06 | `06-preinit-invoked.png` | Finalize invokes the governed pre-init process |
| 07 | `07-start-training-ready.png` | 9/9 pre-init, endpoint 200, six validated argv steps, Start enabled |
| 08 | `08-training-runner-invoked.png` | Start click reaches runner preflight and records the measured-machine result |
| 09 | `09-custom-model-verified.png` | Real API Registry test returns exact model tag and advances checklist to 6/8 |
| 10 | `10-custom-models-cockpit.png` | Verified model renders in the operational cockpit |
| 11 | `11-model-workflow-draft.png` | Create workflow produces the real three-node governed draft |
| 12 | `12-workflow-api-binding.png` | API Registry node is bound to the mothership policy with clean side panel |
| 13 | `13-workflow-test-passed.png` | Draft test completes 3/3 nodes and unlocks Publish |
| 14 | `14-workflow-live.png` | Publish produces v2/live workflow |
| 15 | `15-workflow-completed-output.png` | Re-tested and republished workflow is v3/live with persisted run evidence |
| 16 | `16-custom-model-loop-complete.png` | Cockpit shows 2 harvested traces, 1 proven run, 1 workflow, 207 tokens |

Machine-readable claims and invariant values are in
[`FINAL-READBACK.json`](./FINAL-READBACK.json). The persisted run proves HTTP
200, served model `workspace-local-tuned-v1`, output hash
`1f37aeadea28c884`, two invocation receipts, two distillation traces, and trace
root hash `ac1a95888c1349d0`.
