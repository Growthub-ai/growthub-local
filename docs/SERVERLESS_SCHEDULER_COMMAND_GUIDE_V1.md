# Serverless Scheduler Command Guide V1

This guide documents the validated serverless scheduler release in PR #258.
The work is complete and the live smoke has passed.

The validated path is:

```txt
/schedule command
→ Schedule Cockpit
→ QStash product capability
→ serverless trigger on the workflow input node
→ signed QStash destination delivery
→ signed callback
→ last-run proof on the owning workflow row
→ receipt ledger
```

## What Was Validated

Validated branch:

- PR: `#258`
- branch: `claude/pr-257-implementation-plan-uqatrp`
- head: `62a4c55b`

Validated workspace row:

- object: `sandbox-probe`
- row: `registry-workflow`
- schedule id:
  `growthub-upstash-workspace-builder-default-sandbox-probe-registry-workflow-1`

Validated external source of truth:

- Upstash QStash EU Region log
- message id:
  `msg_26hZCxZCuWyyTWPmSVBrNC1RADUuxQAEww9zQsH9mgTuv9Zfrv46YHQ6K5vf6uH`
- destination:
  `https://slimy-garlics-switch.loca.lt/api/workspace/workflows/upstash`
- status: `DELIVERED`
- created: `Jun 27, 18:57:00`
- delivered: `Jun 27, 18:57:01`
- duration: `587ms`

Validated payload:

```json
{
  "kind": "growthub-scheduled-run-v1",
  "scheduleId": "growthub-upstash-workspace-builder-default-sandbox-probe-registry-workflow-1",
  "workspaceId": "workspace-builder-default",
  "objectId": "sandbox-probe",
  "rowId": "registry-workflow",
  "version": "1",
  "triggerInput": ""
}
```

Validated workspace proof:

```txt
lastScheduledRunStatus=200
lastScheduledRunSucceededAt=2026-06-27T22:57:02.224Z
lastScheduledRunMessageId=msg_26hZCxZCuWyyTWPmSVBrNC1RADUuxQAEww9zQsH9mgTuv9Zfrv46YHQ6K5vf6uH
lastResponse="Scheduled run ok (HTTP 200)."
```

Validated receipts:

```txt
aor_mqwylvwc_0e9ocp  workspace-add-on-sync
  Upstash QStash/Workflow installed after provider sync probe.

aor_mqwym1zp_krbgab  workspace-add-on-schedule
  Schedule bound to registry-workflow; row serverless + input trigger synced.

aor_mqwym7d5_svzuts  workspace-add-on-schedule-run
  Manual scheduler run published for registry-workflow.

aor_mqwymews_u41tvs  workspace-scheduled-run
  Scheduled serverless run of registry-workflow completed via Upstash.

aor_mqwymfpy_83tr3s  workspace-scheduled-run-callback
  registry-workflow scheduled run synced (HTTP 200).

aor_mqwyna8z_186dmc  workspace-add-on-schedule
  Schedule uninstalled; row reverted to local + manual trigger.
```

## How To Use `/schedule`

1. Open the workspace.
2. Open Workspace Helper.
3. Type `/schedule`.
4. Select the `/schedule` command.
5. The Schedule Cockpit opens inside the helper sidecar.

The cockpit shows:

- total workflow count
- scheduled workflows
- ready workflows
- blocked workflows
- local-only workflows
- QStash-backed workflows
- per-row readiness state
- installed schedule id
- cron
- region
- last run status
- actions such as readiness, pause, downgrade, and workflow open

In the validated run, the cockpit showed:

```txt
3 workflows · 1 scheduled · 0 ready · 2 blocked
registry-workflow
Serverless
QStash
* * * * *
eu-central-1
Last run 200
Scheduled
```

## How It Works

### 1. Product Capability

The Upstash QStash product is installed as an API Registry row:

```txt
integrationId=upstash-qstash-workflow
authRef=QSTASH
executionLane=serverless-scheduler
syncStatus=verified
```

The row stores provider/product proof and env references. It does not store
tokens or signing keys.

### 2. Workflow Ownership

The workflow row owns the schedule:

```txt
objectId=sandbox-probe
rowId=registry-workflow
runLocality=serverless
scheduleId=growthub-upstash-workspace-builder-default-sandbox-probe-registry-workflow-1
schedulerRegistryId=upstash-qstash-workflow
schedulerProviderId=upstash
schedulerProductId=upstash-qstash
schedulerRegion=eu-central-1
schedulerCron=* * * * *
```

The provider row is capability. The workflow row is ownership.

### 3. Trigger Input Node

Serverless scheduling is expressed on the workflow input node, not as a separate
workflow object.

When scheduled, the input node carries:

```txt
inputMode=serverless-schedule
triggerKind=serverless-scheduler
schedule.scheduleId=<owning schedule id>
schedule.schedulerRegistryId=upstash-qstash-workflow
schedule.providerId=upstash
schedule.productId=upstash-qstash
schedule.destinationUrl=/api/workspace/workflows/upstash
schedule.callbackUrl=/api/workspace/add-ons/upstash/callback
```

This keeps the graph's runtime semantics in the graph itself. The schedule does
not bypass the workflow canvas.

### 4. Destination Route

QStash sends the scheduled run to:

```txt
POST /api/workspace/workflows/upstash
```

The destination validates the signed QStash delivery and checks that the live
workspace row still owns the schedule id. A valid delivery executes the existing
workflow graph path and returns the scheduled run result.

### 5. Callback Route

QStash sends the callback to:

```txt
POST /api/workspace/add-ons/upstash/callback?scheduleId=<schedule id>
```

The callback validates the signature, resolves the owning workflow row, and
writes last-run proof back to that row.

### 6. Receipts

Every meaningful step writes an outcome receipt:

- product sync
- schedule install
- scheduler run publish
- scheduled run completion
- callback sync
- uninstall / downgrade

The receipt stream is the audit trail agents and humans use to prove what
happened.

## Success Criteria

The serverless scheduler loop is successful when all of these are true:

- `/schedule` opens the Schedule Cockpit
- QStash product sync is verified
- a deterministic schedule id is created
- the workflow row owns the schedule
- the input trigger node is synced to `serverless-scheduler`
- QStash delivers the workflow destination request
- QStash delivers the callback
- the owning workflow row records `lastScheduledRunStatus=200`
- the owning workflow row records `lastResponse="Scheduled run ok (HTTP 200)."`
- receipts show the full lifecycle

Those conditions were met in the PR #258 live smoke.
