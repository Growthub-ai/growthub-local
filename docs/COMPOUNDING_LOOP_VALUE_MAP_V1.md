# Compounding Loop Value Map V1

What to run **on the loop surface that already ships** in the stable Growthub
Local workspace. The loop is not a concept to introduce and not a gap to close —
it is a live command interface and a governed runtime. This map names the
shipped loop primitives and the high-value work that compounds on top of them.

Versions are read from manifests (per [`docs/ARTIFACT_VERSIONS.md`](./ARTIFACT_VERSIONS.md)):
`@growthub/cli@0.14.6`, `@growthub/create-growthub-local@0.14.6`,
`@growthub/api-contract@1.5.2`.

Read with:

- [`docs/SWARM_RUN_CONTRACT_V1.md`](./SWARM_RUN_CONTRACT_V1.md)
- [`docs/WORKSPACE_CEO_PRIMITIVE_V1.md`](./WORKSPACE_CEO_PRIMITIVE_V1.md)
- [`docs/GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md`](./GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md)
- [`docs/AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md`](./AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md)
- [`docs/PROJECT_MANAGEMENT_WORKSPACE_TEMPLATE.md`](./PROJECT_MANAGEMENT_WORKSPACE_TEMPLATE.md)

---

## 1. The loop already ships — these are the exact surfaces

The loop is a first-class part of the production-stable workspace. It exists as a
**command interface**, a **governed runtime**, and a **scorecard**:

| Shipped surface | Where it lives | What it is |
| --- | --- | --- |
| `/loop` | `helper-commands.js` (`scope: workspace`, `mutates: true`) | Slash command that seeds a governed recurring-loop proposal |
| `/swarm` | `helper-commands.js` (`intent: swarm`) | Proposes a governed `agent-swarm-v1` workflow row |
| `/ceo` | `helper-commands.js` (`view: ceo`) | Opens the CEO oversight cockpit — read-only fleet view |
| `/goal` `/workflows` `/register-api` `/create-object` | `helper-commands.js` | Set goal, open Background Tasks, seed governed creation proposals |
| **CEO Loop Scorecard** | `workspace-schema.js` → CEO Daily Operating Dashboard | Shipped loop lifecycle: **Created · Ready · Launched · Completed · Blocked · Reviewed** |
| **alignment-loop swarm** | `templates/seeded-configs/alignment-loop.config.json` | Seeded live loop: `workspace-expert → executor-worker → critic-grader` |
| **Swarm Run Contract** | `docs/SWARM_RUN_CONTRACT_V1.md` + `lib/orchestration-agent-swarm.js` | propose → apply → `sandbox-run` → receipt → cockpit (one executor) |
| **Distillation pipeline** | `helpers/{harvest,grade,upload,export}-*.mjs` | Trace harvest → critic grade → upload → Unsloth JSONL export |

The loop's lifecycle is not something this doc defines. The shipped CEO Loop
Scorecard already enumerates it, and the operating framework already states the
rule it runs on: `state → eligibility → guidance → action → evidence → next
state`. The user-facing `DISCOVER → PLAN → EXECUTE → VERIFY → ITERATE` phrasing
is the same lifecycle in plain words. The mapping below is for reference, not a
new model:

| Plain phrase | Shipped scorecard stage(s) | Shipped surface that performs it |
| --- | --- | --- |
| DISCOVER | (derive state) | `/ceo` bootstrap, Workspace Lens, `growthub workspace status --json` |
| PLAN | Created → Ready | `/loop`, `/swarm`, helper `query` (propose-only) |
| EXECUTE | Launched | `helper/apply` → `POST /api/workspace/sandbox-run` |
| VERIFY | Completed / Blocked / Reviewed | `agent-outcomes` receipts, source records, truthful telemetry |
| ITERATE | (feeds next Created) | updated config + receipts re-derive Lens/CEO |

**Governance fact (already enforced):** a mutating command only *seeds a proposal
request*. It still travels `helper query → review → helper/apply → receipt`. No
command runs `sandbox-run` directly and none patches config directly
(`isGovernedHelperCommand`, `SWARM_RUN_CONTRACT_V1` §11). Everything below
inherits this for free.

---

## 2. The mature governed objects every use case rides

These ship today and are the carriers the loop operates on:

- **Workspace artifact** — the owned, forkable, deployable unit (`growthub.config.json` + `apps/workspace` + `.growthub-fork/` + receipts + trace).
- **Data Model rows** — durable business/execution state; `PATCH /api/workspace` allowlist (`dashboards | widgetTypes | canvas | dataModel`).
- **`sandbox-environment` rows** — execution boundary: `runLocality`, `adapter`, `agentHost`, `browserAccess`, `networkAllow`, `schedulerRegistryId`, `orchestrationConfig`.
- **`agent-swarm-v1` graph** — orchestrator + subagents + synthesis node; `validateAgentSwarmGraph` is the static gate; `orchestration-agent-swarm.js` the only executor.
- **API Registry → resolver → Data Source → source record** — the test→profile→resolve→bind→refresh chain.
- **Helper** — propose → review → apply → receipt; `build_dashboard` / `create_widget` are the **widget help** intents; credentials stripped server-side.
- **CEO cockpit / Workspace Lens** — read-models over config + receipts (`deriveCeoBootstrapState()`, `deriveCeoCockpit()`); Agent Teams are reusable blueprints.
- **Self-healing forks + worker kits/templates** — drift detection, additive heals, templates as boot surfaces.

---

## 3. High-value work to run on the shipped loop

Each item below is expressed as the shipped loop running over the shipped
objects — what you type, what applies, what proves it. Each runs **local-now**
and exports as a **deployable Next.js app** in its own governed runtime.

### A. Compounding the workspace itself

Run the CEO loop on the workspace as the subject. `/ceo` derives what's
incomplete from config + receipts; helper `query` proposes the next
object/dashboard/workflow; `/loop` proposes the recurring cadence; `helper/apply`
writes it; `agent-outcomes` + fork drift detection prove the change is additive.
Each cycle's receipts make the next `/ceo` derivation sharper — the scorecard's
Reviewed column feeds the next Created.

### B. Frontier-lab AI research

`/goal` sets the verifiable question; `/swarm` proposes a research graph
(searcher → synthesizer → critic) over `Sources`/`Findings`/`Evidence`/`Reports`
objects; API Registry rows give governed search/data endpoints and `browserAccess`
grants live-source reads only where the row allows; the run executes through
`sandbox-run`; truthful telemetry + source-record run history are the evidence;
the critic lane grades findings; graded findings feed the next swarm. Local
intelligence (Ollama) for cheap iteration; `schedulerRegistryId` to scale a run
to serverless.

### C. Distillation & fine-tuning

The seeded `alignment-loop` swarm and the four helpers already run this end to
end: `harvest-cursor-traces.mjs` pairs prompts with executed work (boosting
`mergedToMain` squash-merged work as ground truth) → `grade-raw-pairs.mjs` scores
each pair through the live `critic-grader` row via `sandbox-run` →
`upload-graded-traces.mjs` appends `qualityScore ≥ threshold` rows into the
`training-traces` object → `export-training-traces.mjs` emits Unsloth-ready QLoRA
JSONL and flips `exported: true`. The fine-tuned adapter becomes the next
`localModel` on the swarm rows — the loop trains the worker that runs the loop.

### D. Use-case dashboards / interfaces / workflow-APIs as work packages

The Project Management template's pattern (objects + `sandbox-environment` row +
workflow + dashboard) generalizes to any domain. `/create-object` proposes the
business objects; helper `build_dashboard` / `create_widget` is the widget help
that proposes layout + bindings; `/register-api` + the API cockpit run
test→profile→Data Source→source-record refresh; the workflow row's
`orchestrationConfig` bridges Data Model to the real canvas; draft→test→publish
gates the workflow. Each work package is a reusable, inspectable infrastructure
object — clone it for the next use case.

### E. Variations of the workspace itself

`growthub discover` / `kit download` picks the boot surface (starter, repo
import, skill import, kit, or one of the five dashboard templates); helper
proposes the domain delta; fork registration + governed customization writes it;
drift detection + dry-run heal plans keep each variant upgradeable without losing
customization. One starter family becomes many adjacent, independently
deployable workspaces.

### F / G / H. Marketing, Engineering, Sales

Same loop commands, same contract, different objects:

| Loop | Objects | Runs on |
| --- | --- | --- |
| **Marketing** | `Campaigns`, `Assets`, `Reviews`, `Publishing Calendar` | `/swarm` content/review swarm; `build_dashboard` for performance; API Registry → Data Source for ad/analytics; review-routing workflow |
| **Engineering** | `Tasks`, `Incidents`, `Runbooks`, `Releases` | the seeded `alignment-loop` (`/swarm`); `sandbox-run` over governed repos; `browserAccess` for QA proof; merged-to-main feeds the distillation loop (C) |
| **Sales / RevOps** | `Accounts`, `Contacts`, `Opportunities`, `Activities` | `build_dashboard` pipeline view; `/register-api` for CRM/enrichment → Data Source refresh; follow-up/enrichment workflow |

---

## 4. Invariants every use case inherits (already enforced)

- `PATCH /api/workspace` is allowlisted and rejects full-config bodies, sidecar writes, credential-shaped fields, and direct live-workflow mutation.
- Draft → live workflow happens only through `POST /api/workspace/workflow/publish`, verified against `sandbox-run` lineage.
- Helper is propose-first; every accepted apply appends a receipt to source records.
- Telemetry is truthful-only — missing metrics render `—`, never a fake number (`SWARM_RUN_CONTRACT_V1` §6–8).
- Secrets are `authRef`/env-ref slugs; never in prompts, proposals, source records, browser state, or docs.
- `browserAccess` is a row capability inherited through graph policy — never a prompt instruction.

---

## 5. What "working" looks like

The workspace answers — from receipts and source records, not chat — what is
ready, what has evidence, what the helper may safely do, and what the next move
is. The CEO Loop Scorecard (Created · Ready · Launched · Completed · Blocked ·
Reviewed) is the live readout; the durable claim is that building the workspace,
research, distillation, dashboards/workflows, and marketing/engineering/sales all
run the **same shipped loop** over the **same governed artifact**, locally or
deployed.
