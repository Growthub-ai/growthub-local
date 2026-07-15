# Agent Native Scheduler Input Method V1

Status: implemented and QA-proven in Growthub Local

Release: `@growthub/cli` and `@growthub/create-growthub-local` 0.14.16

## Outcome

Growthub Local now exposes **Agent Native Scheduler** as a robot-icon input profile over the existing authenticated API Request thin bridge. It does not create a parallel scheduler, endpoint, credential store, queue, or workflow engine.

```text
native Codex heartbeat
-> persistent Codex task
-> authenticated API Registry destination
-> published governed sandbox workflow
-> bounded serverless generation
-> terminal child reconciliation
-> artifact recovery and byte QA
-> rendered visual QA
-> governed output persistence
-> returned previews and receipts
-> pending human approval
```

The stored configuration remains runtime-compatible:

```yaml
inputMode: api-request
inputProfile: agent-native-scheduler
schedulerOwner: agent-native
agentSchedulerAdapter: codex-task
agentSchedulerTaskRef: ""
agentSchedulerTimezone: America/New_York
```

Codex is the only enabled, validated adapter. Claude Code cloud and Gemini are visible but disabled as coming-soon options. Any attempted disabled selection normalizes to `codex-task`.

## Real smoke proof

The feature walkthrough used isolated governed row `sandbox-environments/growthub-agent-native-scheduler-weekly-image-generation`; it did not mutate an active client cadence.

| Gate | Proof |
|---|---|
| Draft run | `run_mrmlr9rb_s9twu2` |
| Hosted execution | `e4f7a4e2-0a13-4baa-880d-c49eb7c1b8d7` |
| Terminal image children | 1/1 completed |
| Artifact | JPEG, 928x1152, 624,659 bytes |
| SHA-256 | `68b245e296c6f47830feda9b33db234f7d710e436b80e3c344ef6c4101543479` |
| Rendered QA | Passed |

Provider metadata advertised PNG/1024x1024, but the downloaded bytes proved JPEG/928x1152. Byte evidence is authoritative. For portrait creative, append `--4:5` to the final image-model prompt; the validated model-safe `928x1152` rendition is accepted as 4:5 when composition and safe-margin QA pass.

## Production closed-loop proof

The final scheduled proof shows the existing Growthub AgenticOS cadence returning five previews and durable output rows `growthub-agenticos-v3-mrmjh0q0-01` through `-05`, with:

- destination receipt `aor_mrmjjjy6_mf8mg0`;
- binding receipt `aor_mrmje458_jr24st`;
- publish receipt `aor_mrmjcpta_7g5tmm`;
- JPEG 928x1152 and SHA-256 verification;
- `pending_super_admin_review` and `not_sent` boundaries;
- per-image QA returned to the persistent task.

## Evidence index

All screenshots and the original artifact are committed under [`docs/proofs/agent-native-scheduler-input-method`](./proofs/agent-native-scheduler-input-method):

1. `01-draft-workflow.png`
2. `02-agent-native-dropdown.png`
3. `03-codex-only-adapters.png`
4. `04-draft-test-input-envelope.png`
5. `05-draft-run-running.png`
6. `06-smoke-artifact-rendered.png`
7. `07-smoke-artifact-original.jpg`
8. `08-user-end-to-end-scheduled-proof.png`

## Golden path

1. Configure the input node as Agent Native Scheduler.
2. Keep canonical `inputMode=api-request` and use the existing `growthub-api-trigger` binding.
3. Draft-test the smallest atomic outcome once.
4. Require terminal child, artifact count, byte/MIME/dimension, rendered QA, and durable lineage.
5. Publish only after the draft proof passes.
6. Create and read back the native Codex cadence.
7. Accept only a real heartbeat that creates new downstream lineage and returns previews to the task.
8. Leave outputs pending human review and unsent.

## Implementation map

- Profile contract: `apps/workspace/lib/agent-native-scheduler.js`
- Input UI: `apps/workspace/app/data-model/components/OrchestrationNodeConfigPanel.jsx`
- Workflow surface label: `apps/workspace/app/workflows/WorkflowSurface.jsx`
- API Registry/add-ons projection: `apps/workspace/lib/workspace-add-ons.js`
- MCP metadata projection: `apps/workspace/lib/workspace-metadata-store.js` and `workspace-metadata-graph.js`
- Contract tests: `apps/workspace/lib/agent-native-scheduler.test.js`

All implementation paths above are rooted at `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/`.

## Temporary export acceptance — July 15, 2026

The canonical feature-work export lane was run from this branch:

```text
node scripts/export-seed-workspace.mjs --no-dev
```

Exported workspace:

```text
/Users/antonio/growthub-worker-kit-exports/feature-work-2026-07-15T21-55-09-952Z/growthub-custom-workspace-starter-v1/apps/workspace
```

The official exporter reported `export OK`; the seed validator reported activation `5/5` and API Registry cockpit score `100`. Ten release-boundary files were then compared between the source kit and the temporary exported workspace using byte equality and SHA-256. All ten matched exactly:

| Exported file | SHA-256 |
|---|---|
| `lib/agent-native-scheduler.js` | `7616b8506d5c383f5547202a4e39308922aa4283aabccbd86ffcd03218dffb08` |
| `lib/agent-native-scheduler.test.js` | `20287a29c1cce05fea6ad8921c631481768bb759dd67cd5dfa690943c4c4611f` |
| `lib/workspace-add-ons.js` | `6e099dab13e56240ef4fece1f8bd84534cd7f41566768656e1b8a38df834269f` |
| `lib/workspace-metadata-graph.js` | `da74c1f889a6008915350eb595b4236ef4c5fd8833a95ec4d532211a24d10427` |
| `lib/workspace-metadata-store.js` | `2b6727ee481ca4dac3c9e3ae0229c8d74e2edaa3cac10b81932a060e4b1f288a` |
| `app/data-model/components/OrchestrationNodeConfigPanel.jsx` | `a43c712c839f5202c75b531104fd9648da2514a698ebe4ade211a119b1f02f94` |
| `app/workflows/WorkflowSurface.jsx` | `da6b548e212ae39102ee5a446ee81a6271e4e8c4daf616fc290795aa8e759d9e` |
| `app/globals.css` | `6386969e39f8f1e4236e177905ba6e0be8fb58a3185cf266ff6b84c403a39cbc` |
| `package.json` | `ad6300791c90748970e2d3a5459956a26f747117c5e2b0b9a0ff4aa5000a44bb` |
| `package-lock.json` | `7bf52dc1817200bb1bde9d5169b1e6f4bc5883e2fe54eb458b27469f71d3b606` |

The Agent Native Scheduler contract suite was executed from inside that exported workspace and passed `3/3`. This confirms the code shipped by the Growthub Local export feature is byte-for-byte identical to the reviewed source kit and behaves identically at the contract boundary.
