# Live Runpod Provider Proof — Harness & Evidence Index

This directory banks the LIVE counterpart of the faked-transport Runpod
conformance suite: the governed production transport and the registered
Runpod adapter executed against the real Runpod control plane, observing an
operator-deployed test pod.

Classification follows PROOF-INDEX.md rules — nothing below is marked
**Passed (live)** until the live run has actually executed and banked its
evidence here.

## Status

| Stage | Status |
| --- | --- |
| Harness (`scripts/e2e-compute-runpod-live-proof.mjs`) | **Complete** — offline self-test green (`--mock`: 5 checks; `--mock --release`: 6 checks) |
| Live execution | **Passed (live)** — 5 checks banked 2026-07-21 against the operator-deployed Runpod pod |
| Screenshots (`--screens`) | **Passed (rendered)** — normal user journey banked through Workspace home → Ask helper → `/custom-models`, then Management → Training runs |

## Live execution result

The governed DNS-pinned transport reached the real Runpod REST and GraphQL
control planes from a direct-egress execution host. The observation adopted
pod `x09405suvupalc` (`Growthub-local-compute`) while it was `RUNNING`, banked
a non-zero live provider quote, normalized the lifecycle to
`compute-running`, and proved that the pod-id set was byte-identical before
and after execution. No pod was created, stopped, or terminated.

SSH access to the pod is NOT required: the full observation lifecycle
(inventory → quote → capabilities → status → optional reversible stop)
rides the Runpod REST + GraphQL APIs through the governed transport.

## How to reproduce the live proof

```bash
# 1. Live observation proof (creates NOTHING; adopts the deployed pod):
RUNPOD_API_KEY=<key> RUNPOD_LIVE_POD_ID=<pod id> \
  node scripts/e2e-compute-runpod-live-proof.mjs --write-evidence

# 2. Optional reversible governed stop at the end (volume kept; pod
#    restartable from the console; still bills volume until terminated):
RUNPOD_API_KEY=<key> RUNPOD_LIVE_POD_ID=<pod id> \
  node scripts/e2e-compute-runpod-live-proof.mjs --write-evidence --release

# 3. Golden screenshots from the banked live evidence (offline):
node scripts/e2e-compute-runpod-live-proof.mjs --screens
```

Credential hygiene: the key travels only as the env NAME `RUNPOD_API_KEY`;
the harness asserts every banked JSON is secret-free (no key value, no
Authorization header) before writing it. Rotate any key that has been
shared over chat or ticketing systems once testing completes.

## What the live stages prove

| Check | What it proves |
| --- | --- |
| LIVE-1 pod inventory | the governed DNS-pinned transport reaches the real control plane and finds the operator's deployed pod |
| LIVE-2 capacity quote | real GraphQL price/stock observation → per-hour cost basis > 0 (never a zero-cost yes) |
| LIVE-3 capabilities | honesty boundaries hold against the live surface (no volume → no checkpoint claim; no multi-node claim) |
| LIVE-4 lifecycle observation | the real pod's `desiredStatus` maps to the normalized governed event grammar |
| LIVE-5 zero creates | the pod-id set is byte-identical before/after — observation adopted, never duplicated paid capacity |
| LIVE-6 governed stop (opt-in) | reversible stop acknowledged and confirmed by re-observation; release remains honestly UNCONFIRMED (volume persists and bills until terminated) |

## Evidence inventory (written by the live run)

- `live-00-summary.json` — run summary + the normalized compute block
- `live-01-pod-inventory.json` — redacted pod inventory (id/name/status/GPU/$hr)
- `live-02-capacity-quote.json` — live quote with per-hour cost basis
- `live-03-capabilities.json` — capability honesty snapshot
- `live-04-compute-read-surface.json` — `GET /api/workspace/compute` readback (written by `--screens`)
- `01-live-workspace-data-model.png`, `02-live-custom-models-cockpit.png` — golden screenshots of the workspace deriving customer state from the live evidence

The rendered proof was also exercised manually in Codex IAB through the same
normal user path. No direct `/custom-models` route or synthetic 404 page is
used by the capture harness.
