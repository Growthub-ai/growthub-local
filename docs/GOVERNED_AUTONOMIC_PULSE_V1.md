# Governed Autonomic Pulse V1 — heartbeat sensors, policy findings, governed recovery

**Status:** shipped surface. The `/pulse` cockpit is the workspace's autonomic
heartbeat lens: it senses run health (stall / timeout / failure) from governed
proof columns, evaluates human-authored `workspace-policy` rows against the
live condition packet, and hands every recovery to an EXISTING governed route.
It follows the [Governed Cockpit Entry-Point Pattern V1](./GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md)
exactly — one read-only command, one pure deriver, one sidecar cockpit, receipts
folded back — and adds **no new API route, no new PATCH field, no new runtime,
and no new persistence**.

This is the projection layer of the autonomic loop described against PR #263:
the workspace running itself on governance — sense (derivers) → compare (policy
rows) → recover/propose (existing routes + helper proposals) → receipt →
re-derive — clocked by the existing scheduler lane, hosted serverless.

---

## Topology (all under `apps/workspace/` in the starter kit)

```
lib/autonomic-pulse-console.js                 # PURE deriver — the brain
app/data-model/components/PulseCockpit.jsx     # sidecar cockpit — the lens
app/data-model/components/helper-commands.js   # /pulse (mutates:false, view:"pulse")
app/data-model/components/HelperSidecar.jsx    # activeView === "pulse" mount
scripts/unit-autonomic-pulse.test.mjs          # contract lock (repo root)
```

Four surfaces, same as `/schedule` and `/ceo`: the command registry entry, the
sidecar `activeView`, the cockpit component, and the pure deriver. No rail
changes, no route changes.

---

## Heartbeat sensing (serverless watchdog, projected over governed proof)

The destination door executes published graphs within
`SERVERLESS_RUN_BUDGET_MS` (a shared constant exported by
`workspace-add-on-scheduler.js` and used by the route's `timeoutMs`, so the
sensor can never drift from the real budget) and **stamps
`lastScheduledRunAttemptedAt` BEFORE executing the graph** — this pre-run
stamp is the heartbeat premise: a run that hangs, exhausts the budget, or dies
mid-graph leaves a dangling attempt the sensor can see; without it a stuck run
would leave no trace and read healthy forever. Completion then writes the
success/failure timestamp. The sensor (`senseRunHeartbeat`) classifies each
workflow row:

| State | Rule |
| --- | --- |
| `idle` | no attempt, no completion, no status |
| `running` | attempt newer than any completion, within budget + grace |
| `healthy` | latest signal is a success |
| `failed` | failure reason present, failure newer than success, or non-2xx status |
| `stalled` | attempt newer than any completion AND older than **budget (60s) + grace (120s)** |

This is the same watchdog shape the upstream Paperclip heartbeat service applies
to agent runs (queued → running → stuck detection → recovery), projected over
the governed `lastScheduledRun*` columns so **a run that goes bad can never sit
stuck without a visible, recoverable finding**. Grace covers provider retry
delivery and cold-start jitter (deliberately wider than the QStash ±10s
first-party signing tolerance — different trust problem, different envelope).

Determinism rule: the deriver **never reads the clock**. Callers pass `nowMs`;
with no clock the sensor reports `running (no-clock)` — conservative, never a
false stall alarm — and every unit test pins fixed timestamps.

### Recovery (the "never stuck" contract — binding-aware)

Every `stalled`/`failed` heartbeat carries a `recovery` hand-off to an existing
governed surface, chosen by what the row is actually bound to — the pulse
never targets a provider route the row isn't bound to:

| Binding | Recovery | Surface |
| --- | --- | --- |
| Scheduler-bound (scheduleId + provider) | readiness rescan (read-only); paused+stalled chains `resume`, explicitly marked `mutating: true` | `POST /api/workspace/add-ons/[providerId]/schedule` (with the same defaultProvider fallback ScheduleCockpit uses) |
| Inbound-bound (webhook / api-request) | fresh test event; publish stays proof-gated | workflow sidecar |
| Unbound | open the canvas to re-run or bind | workflow canvas |

Resume re-verifies readiness server-side (existing behavior), so recovery can
never re-arm a drifted binding. Recovery HTTP failures are surfaced, never
swallowed — a scan that didn't run is reported as exactly that.

---

## Policy rows — rules, preferences, and the use-case goal, with ZERO new schema

There is **no new object type, no new preset, and no schema change**. Policy
rows live in a plain **custom business object** the user creates through the
existing governed `create_object` helper lane (the cockpit's empty state seeds
exactly that proposal). The pulse resolves it by convention — object id or
label `workspace-policy` — and only ever READS it. This is the contract law
applied: a capability may exist only as a projection of state already in the
contract; custom objects ARE existing contract state.

Conventional columns: `Name, ruleKind, threshold, severity, autoApprove,
enabled, goal, description`.

Rule kinds V1: `max-stalled-runs`, `max-failed-runs`, `max-blocked-workflows`,
`max-drifted-workflows`, `max-blocked-attempts`, `max-missing-secrets`,
`require-deployment-live`, `pulse-cadence-minutes`. An unknown `ruleKind` is
reported as a finding — a policy the workspace cannot evaluate is itself a
governance signal, never silently ignored.

`pulse-cadence-minutes` is the watchdog-of-the-watchdog: **only a successful
beat counts** — a heartbeat workflow failing on schedule is stale, not fresh.
A stale beat hands to a readiness rescan; an absent `workspace-pulse` workflow
seeds a governed proposal (intent-pinned) to create one — the pulse hires
itself through the same proposal gate as everything else.

### The auto-approve clamp (trust boundary)

A policy row may declare `autoApprove`, but the deriver **clamps** it twice:

1. **Kind clamp** — only recovery kinds in `SAFE_AUTO_RECOVERY_KINDS`
   (`readiness` — read-only rescans) may auto-run. Rows attempting to
   auto-approve a mutating hand-off are marked `autoApproveClamped` and stay
   manual. The paused-card `resume` chain is a mutation and is **never**
   auto-run — it exists only behind the per-card human click.
2. **Scope clamp** — auto-recovery executes exactly
   `model.autoRecoveryTargets`: the union of `targetCardIds` on the breached
   auto-approved findings, restricted to cards whose recovery is the safe
   kind. The button's count is the work it does; it can never run wider than
   what the findings authorize, and every per-card outcome (including
   failures) is aggregated, never masked.

Autonomy inherits the security model; it never bypasses it. This mirrors
`.growthub-fork/policy.json → autoApprove` in spirit while keeping V1 scope to
read-only recovery.

---

## The condition packet (agent-legible, MCP-aligned)

`derivePulseCockpit` returns the cockpit view-model, which **is** the agent
condition packet in the binding-loop sense
([`GOVERNED_CAPABILITY_BINDING_LOOP_V1.md`](./GOVERNED_CAPABILITY_BINDING_LOOP_V1.md)):
counts (stalled/failed/running/healthy/blocked/drifted/missing-secrets),
governance (`blockedAttempts` folded from receipts), deployment posture (from
`workspace-app-registry` + `vercel-projects` governed rows), pulse proof, policy
findings with governed `nextAction`s, and a single prioritized `attention`
(stalled → failed → worst finding).

MCP alignment ([`GOVERNED_MCP_CONSOLE_V1.md`](./GOVERNED_MCP_CONSOLE_V1.md)):
the pulse is the same class of read-only intelligence as `app_readiness` /
`outcome_ledger`, and every hand-off mirrors the `next_actions` contract —
read → reason → governed mutate → re-read. Agents may consume the packet
directly or reach the identical truth through `growthub serve --mcp`. The
packet's `mcp` block names the correlation. (An additive `pulse_status` MCP
tool over this same deriver is the natural Phase B follow-up in
`cli/src/commands/workspace-derivation-commands.ts`.)

---

## Automated gates

```bash
pnpm test:autonomic-pulse        # 15 contract tests (repo root)
pnpm test:schedule-cockpit       # regression: shared sidecar + command registry
node --test scripts/unit-helper-command-registry.test.mjs
```

Locked invariants: `/pulse` is read-only view command; sidecar mount source-scan;
NO `workspace-policy` preset may exist (policy resolves from a governed custom
object by id/label convention);
sensor state table incl. no-clock conservatism; stalled ⇒ recovery present;
paused+stalled chains resume; inbound failure recovers via retest lane; policy
threshold semantics; auto-approve clamp bites on unsafe kinds; unknown rules
reported; cadence rule flags silent and absent pulse; deployment posture rows;
full-packet determinism (same inputs ⇒ deep-equal output); every hand-off is in
the closed governed-surface list.

---

## Anti-patterns (must not happen)

- No new API route, PATCH field, object type, preset, executor, scheduler, or
  persistence backend. Policy is rows in a user-created custom object — adding
  a dedicated preset for it is the exact violation the unit suite locks out.
- No cockpit mutation: the deriver stays pure; the component only calls
  existing governed routes or seeds helper proposals.
- No auto-approve beyond `SAFE_AUTO_RECOVERY_KINDS` — widening that list is a
  contract change requiring its own review, tests, and doc update.
- No clock reads inside the deriver; no stall claims without a caller clock.
- No policy evaluation that silently skips rows it doesn't understand.
- No second heartbeat vocabulary — sensor tags extend the existing delta-tag
  discipline (`serverless-readiness.js`), they don't replace it.
