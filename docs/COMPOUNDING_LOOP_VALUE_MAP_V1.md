# Compounding Loop Value Map V1

The product value of running Growthub Local's shipped governed loop. One loop,
one owned artifact, evidence that compounds — producing many product outcomes
from the same primitives, locally or deployed.

Versions from manifests (per [`docs/ARTIFACT_VERSIONS.md`](./ARTIFACT_VERSIONS.md)):
`@growthub/cli@0.14.6`, `@growthub/create-growthub-local@0.14.6`,
`@growthub/api-contract@1.5.2`.

Read with: [`SWARM_RUN_CONTRACT_V1`](./SWARM_RUN_CONTRACT_V1.md) ·
[`WORKSPACE_CEO_PRIMITIVE_V1`](./WORKSPACE_CEO_PRIMITIVE_V1.md) ·
[`GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1`](./GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md) ·
[`AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK`](./AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md) ·
[`PROJECT_MANAGEMENT_WORKSPACE_TEMPLATE`](./PROJECT_MANAGEMENT_WORKSPACE_TEMPLATE.md)

---

## The thesis: the workspace gets more valuable the more it is used

The loop is a shipped surface — a command interface, a runtime, and a scorecard:

- **Commands:** `/loop`, `/swarm`, `/ceo`, `/goal`, `/workflows`, `/register-api`, `/create-object` (`helper-commands.js`).
- **Runtime:** propose → apply → `POST /api/workspace/sandbox-run` → receipt → cockpit (`SWARM_RUN_CONTRACT_V1`, `orchestration-agent-swarm.js`).
- **Scorecard:** the CEO Loop Scorecard — `Created · Ready · Launched · Completed · Blocked · Reviewed` (`workspace-schema.js`).
- **Oversight:** the CEO fleet console inside `/ceo` (`CeoCockpit.jsx` → `CeoFleetView`: every swarm workflow as a direct report — `{total} · {runnable} · {blocked} · {failing}`), with **Agent Teams** as reusable blueprints (config) and **History** as the runtime fleet.

In plain words the loop is `DISCOVER → PLAN → EXECUTE → VERIFY → ITERATE`, which is
the operating framework's `state → eligibility → guidance → action → evidence →
next state`.

| Phase | What runs it |
| --- | --- |
| DISCOVER | `/ceo` + Workspace Lens derive the next move from config + receipts |
| PLAN | `/loop` / `/swarm` / helper `query` propose (review before anything runs) |
| EXECUTE | `helper/apply` → `sandbox-run` |
| VERIFY | `agent-outcomes` receipts, live source records, truthful telemetry, browser proof |
| ITERATE | new evidence re-derives the next state and scorecard |

**Why it compounds (the actual moat):** every run deposits evidence that makes
the next run better — *without changing the model*. Receipts sharpen `/ceo`'s
next-move derivation; source-record refreshes keep widgets live; squash-merged
work becomes graded training data that fine-tunes the local model that runs the
next loop. This is the white paper's claim made concrete — operational quality
rises with `causal density × resonance × evidence × capability trust ×
governance`. And the value is portable: export the artifact and a clone
reproduces the same readiness.

---

## What the loop produces on live, governed objects

Widgets are not static — they feed live data through the shipped chain
**API Registry row → server-side test/profile → governed Data Source →
`refresh-sources` → source records → live-backed Data Model object → widget**
(`workspace-chart-values.js` projects rows *or hydrated source records*;
`workspace-metadata-store.js` marks objects `isLiveBacked` with `stale-source`
freshness signalling).

Mature governed objects every outcome rides: the **workspace artifact**
(forkable, deployable), **Data Model rows** (durable state), **`sandbox-environment`
rows** (`runLocality`/`adapter`/`browserAccess`/`schedulerRegistryId`/`orchestrationConfig`),
the **`agent-swarm-v1` graph**, the **helper** (`build_dashboard`/`create_widget`
are the widget-help intents), the **CEO fleet + Agent Teams**, and
**self-healing forks**.

---

## Product outcomes (same loop, different result)

**1 — Self-improving ops cockpit.** `/ceo` surfaces the single next move from
evidence; winning swarms are saved as Agent Teams; each completed loop tightens
the next derivation. Value compounds per use and ships inside the artifact.

**2 — Auditable frontier research.** `/goal` + `/swarm` (searcher → synthesizer →
critic) over `Sources`/`Findings`/`Evidence`/`Reports` produces output where every
claim is receipt-backed, browser-proofed, and replayable by another agent —
not a chat you have to trust. Local intelligence to iterate; `schedulerRegistryId`
to scale runs to serverless.

**3 — A private model that gets better at *your* workspace.** The seeded
`alignment-loop` (`workspace-expert → executor-worker → critic-grader`) plus the
four helpers run a full flywheel: harvest agent traces (boosting squash-merged
work as ground truth) → grade through the live critic via `sandbox-run` → upload
to `training-traces` → export Unsloth QLoRA JSONL. The fine-tuned adapter becomes
the next `localModel` on the swarm rows — the loop trains the worker that runs
the loop, fully local.

**4 — Any use case as a deployable "work package."** Dashboards, interfaces, and
workflow-APIs are all built the Project-Management way — objects + `sandbox-environment`
row + workflow + live-backed dashboard. `/create-object`, the widget-help intents,
and the API cockpit assemble a real, shippable app surface per use case under one
mental model.

**5 — A product factory via forks.** Spin a governed workspace per client / domain
(`growthub discover` / `kit download` / starter / repo-import / skill-import);
self-healing forks + drift detection + dry-run heal plans keep every variant
upgradeable. One starter family → many independently-deployable apps.

**6 — Marketing / Engineering / Sales on one evidence layer.** Each runs the
identical governed loop over its own objects (`Campaigns`/`Assets`/`Reviews`;
`Tasks`/`Incidents`/`Releases`; `Accounts`/`Opportunities`/`Activities`), so a
campaign result, a merge, and a closed deal all land as receipts/source records
that compound the *shared* model and feed each other.

---

## Why it is safe enough to deploy and hand off

The mutation firewall is enforced, not aspirational: helper is propose-first;
`PATCH /api/workspace` is allowlisted and rejects credential-shaped fields and
direct live-workflow mutation; draft → live happens only through
`workflow/publish` verified against `sandbox-run` lineage; telemetry is
truthful-only (missing renders `—`, never faked); secrets are env-ref slugs that
never enter prompts, proposals, source records, or browser state; `browserAccess`
is a row capability inherited through graph policy.

**The product-level claim:** Growthub Local is the DevOps layer for agentic work
— local-first, deployable as a Next.js app in its own governed runtime, operated
by one shipped loop, and it gets smarter with use because the same artifact
accumulates the evidence that powers the next cycle.
