# Workspace Causal Simulation V1

A pure, deterministic **predictive deriver** for the governed workspace. It is
the forward-looking continuation of the Causation ITT eligibility drivers
(`docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`): those answer *what is eligible
next*; this answers *what is the likely outcome of a use case, what does
completing it unlock, and which causal drivers most move that prediction*.

This document keeps two things strictly separate, because conflating them is a
category error: **§1 is biological intuition only — it is not the
implementation. §2 is the implementation, and it contains no ants.**

---

## §1 — Biological grounding (intuition pump ONLY; not code)

Real ant colonies solve path problems through **stigmergy**: no ant holds a
global map; each senses local pheromone, acts, and deposits more pheromone in
proportion to outcome quality; evaporation discounts stale trails. Over many
local, evidence-driven decisions the colony's *aggregate* behavior converges on
good paths — an emergent prediction about which route pays off, derived from
recorded experience rather than central planning.

The single transferable idea is this and only this: **a good prediction about
what to do next can be derived deterministically from accumulated local
evidence, without a central oracle.** Nothing below simulates an ant, a
pheromone, or a colony. The biology is the reason the *shape* of the mechanism
is sound; it is not the mechanism.

---

## §2 — Technical mechanism (the actual implementation; no metaphor)

`apps/workspace/lib/workspace-simulation.js` — a pure function over the same
`{ workspaceConfig, workspaceSourceRecords, metadataGraph }` envelope every
other deriver consumes. No I/O, no fetch, no fs, no mutation, never throws.

### 2.1 Inputs — the workspace's own causal substrate

1. **Eligibility substrate.** `deriveWorkspaceState(input)`
   (`workspace-activation.js`) yields the target use case's lens steps, each
   already classified `complete | pending | blocked | optional`. This is the
   config-derived topology — what the human and the agent both see.
2. **Empirical run evidence.** `collectRunEvidence` scans the recorded last run
   on every `sandbox-environment` row (`row.lastResponse`) for ok/failed
   outcomes and parsed swarm reward scores. It returns a **Laplace-smoothed**
   base success rate: `(ok + 1) / (ok + failed + 2)` — so zero evidence yields
   `0.5`, never a false `0` or `1`.

### 2.2 Prediction — sequential reliability

Per incomplete required step, the success probability is the empirical base
blended with mean reward, gated down for `blocked` steps (their prerequisite is
unmet). The analytic outcome is the **product** over the path:
`P(complete) = Π p(step)` — a sequential-reliability model.

### 2.3 Simulation — a seeded "simulated reality"

`simulateDepthDistribution` runs a **seeded** (mulberry32, reproducible)
Monte-Carlo first-failure-depth model: each trial advances step by step,
clearing a step with its probability or stopping when the prerequisite chain
breaks. The output is a distribution — completion rate plus `p50`/`p90`/`mean`
depth — i.e. how far a typical attempt gets. Same seed ⇒ identical result.

### 2.4 Causal drivers — counterfactual sensitivity

For each incomplete step, the **marginal lift** in `P(complete)` if that one
step were resolved (`p → 1`): `impact = Π/p(step) − Π`. Steps are ranked by
impact — the derived "fix this first" signal. Lower-probability gates (blocked
prerequisites) carry the largest lift and rank to the top. This is causation
*derivation*, not a guess: it is the partial derivative of the outcome with
respect to each driver, computed over the governed config topology.

### 2.5 Output (typed envelope)

```
{ kind: "growthub-workspace-simulation-v1", version: 1,
  target:      { lensId, label, complete },
  prediction:  { successProbability, completionRate, confidence, expectedOutcome, rationale },
  drivers:     [ { stepId, label, kind: "prerequisite"|"next-step", probability, impact, detail } ],
  trajectory:  { predictedComplete, predictedStepsToComplete, steps: [ { stepId, predictedStatus, ... } ] },
  distribution:{ trials, seed, completionRate, depthHistogram, meanDepth, p50Depth, p90Depth },
  evidence:    { runs, okRuns, failedRuns, rewardSamples, meanReward, baseSuccess } }
```

---

## §3 — Product surface

`GET /api/workspace/simulation` (read-only; mirrors `swarm-condition/route.js`)
returns this envelope for any use case:

```
GET /api/workspace/simulation?lensId=deploy&trials=2000&seed=7
```

For users this is a **prediction / prototype / simulated reality** for any
workspace use case — "if I pursue deploy readiness, I'm ~62% likely to complete
it; the dominant blocker is the durable-store prerequisite; here is the
predicted step path and the completion distribution." For agents it is the
predictive complement to the swarm condition packet: the same derived truth the
human sees, as a machine-readable forecast — so a swarm can prioritise the
highest-impact driver instead of guessing.

Because it is a pure deriver, the prediction sharpens automatically as the
workspace accumulates run evidence: every recorded run becomes a stronger prior
for tomorrow's forecast. State → eligibility → **prediction** → action →
evidence → sharper prediction.

---

## §4 — Boundaries

- **No SDK contract change.** `@growthub/api-contract` is untouched.
- **No new schema, no new mutation path.** It reads `deriveWorkspaceState` and
  recorded run evidence; it writes nothing. Writes still flow only through
  `PATCH /api/workspace` and `POST /api/workspace/sandbox-run`.
- **Deterministic.** Seeded RNG; same inputs + seed ⇒ identical output.
- **Never asserts completion without evidence.** Confidence is a function of
  recorded run volume; zero-evidence predictions say so.

## §5 — Validation

`scripts/unit-workspace-simulation.test.mjs` — 10 tests: seeded-RNG
determinism, Laplace priors, already-complete certainty, sequential-reliability
identity, Monte-Carlo tracking the analytic prediction, blocked-step gating +
prerequisite drivers, counterfactual driver ranking, seed/trials clamping, and
never-throws on blank/garbage input.

Run: `node --test scripts/unit-workspace-simulation.test.mjs`
