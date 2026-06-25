# Operating the Governed Universe V1 — the agent's own control plane

The canonical guide for an agent operating **inside** a Growthub workspace as a governed
actor — not editing files and hoping tests catch mistakes, but proposing reality changes that
a live control plane validates, absorbs into a world model, and explains the downstream impact
of. This is the behavioral contract that makes Growthub Local an *agent universe* rather than a
config directory.

> **Read order.** This doc is the conceptual map. The exact, runtime-verified request/response
> shapes and error envelopes live in the in-workspace contract card
> [`skills/governed-workspace-mutation/SKILL.md`](../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/skills/governed-workspace-mutation/SKILL.md)
> (ships into every fork). This doc does not repeat those shapes — it names the architecture
> they form and the loop an agent runs through them. Source-of-truth order (`AGENTS.md`):
> runtime route files win over this doc.

---

## 1. The three-layer control plane

Every agent action inside a workspace passes through three layers. An agent that understands
them stops guessing and starts *negotiating with the platform until its intended reality is
valid*.

```
            ┌──────────────────────────────────────────────────────────────┐
  LAYER 1   │  MUTATION — where agents request reality changes               │
  Mutation  │     PATCH /api/workspace        (config: 4-key allowlist)       │
            │     POST  /api/workspace/sandbox-run   (execution)             │
            │     POST  /api/workspace/workflow/publish  (draft → live)      │
            │     POST  /api/workspace/helper/apply  (governed proposal)     │
            └───────────────────────────────┬──────────────────────────────┘
                                            │ proposes
            ┌───────────────────────────────▼──────────────────────────────┐
  LAYER 2   │  LAW — where the platform decides whether the reality is valid │
  Law       │     preflight → policy → schema → layout → bounds → overlap    │
            │     422 violations[] / 400 details[] / repairPlan[] / scope    │
            │     (workspace-patch-policy.js, workspace-schema.js)           │
            └───────────────────────────────┬──────────────────────────────┘
                                            │ accepts (or rejects with reasons)
            ┌───────────────────────────────▼──────────────────────────────┐
  LAYER 3   │  INTELLIGENCE — where the platform understands what landed     │
  Intel.    │     metadata graph (nodes + edges) → dependents → BLAST RADIUS │
            │     agent-outcome receipts → governance summary → next actions │
            │     (workspace-metadata-graph.js, workspace-metadata-impact.js)│
            └────────────────────────────────────────────────────────────────┘

            Agents propose.  The platform governs.  The graph understands.
```

This is fundamentally different from a normal coding agent. A normal agent changes files and
hopes a test fails. A Growthub agent operates inside a live domain model where **the platform
rejects invalid reality before it lands**, and then **expands its own world model around what
did land**. The validator is not a safety bolt-on — it is the *law of physics* of the universe,
and its rejections are navigation, not noise.

---

## 2. The behavioral loop (the closed control loop)

```
intent
  → construct PATCH (or sandbox-run / publish / helper proposal)
  → preflight                 (POST /api/workspace/patch/preflight — dry-run all gates)
  → policy validation         (mutation policy: allowlist, credential, oversize, live-field)
  → schema validation         (workspace-schema.js: shapes, enums, required fields)
  → layout validation         (grid bounds, widget overlap, position)
  → REJECTION  → repair (the reason names the fix) → preflight again
  → ACCEPTANCE → PATCH lands
  → workspace graph recomputes (new nodes + edges absorbed)
  → blast radius proves downstream impact (transitive dependents)
  → receipt emitted into workspace:agent-outcomes (what changed, next actions, rollback)
```

The agent is a **bounded workspace constructor**: it creates governed objects, binds UI to real
fields, obeys policy/schema/layout constraints, repairs failed mutations from structured
feedback, grows the live topology, and then asks the graph what changed. Mistakes become
structured feedback instead of corrupted state — which is exactly how you get safe autonomous
behavior.

---

## 3. Layer 1 — Mutation (the only ways to change reality)

There is no third mutation path. Full shapes in the SKILL card §"The verified mutation protocol".

| Lane | Route | Trust class | What it changes |
|---|---|---|---|
| `untrusted-direct` | `PATCH /api/workspace` | full policy firewall | config: `dashboards`, `widgetTypes`, `canvas`, `dataModel` (the **only** four keys) |
| `execution-proof` | `POST /api/workspace/sandbox-run` | produces run lineage | executes a `sandbox-environment` row (incl. agent-swarm graphs) |
| `server-authoritative` | `POST /api/workspace/workflow/publish` | owns draft → live | the only draft→live transition; verifies `draftSha256` lineage |
| `governed-proposal` | `POST /api/workspace/helper/apply` | human-reviewed | applies helper proposals; swarm graphs are server-built, never model-authored |

**Workspace-first rule.** Before writing code, ask *does a governed object already represent
this?* A scheduled job is a sandbox row. An external API is an API Registry row. A data view is
a Data Model object bound to a View widget. A multi-agent workflow is a sandbox row with an
`agent-swarm-v1` graph. If the capability is an object, your work is two API calls — not a
module.

---

## 4. Layer 2 — Law (the validator is the product)

The platform does not rely on the agent being perfect. It gives the agent a bounded world where
every invalid mutation is rejected with a structured, actionable reason. **Always preflight**
(`POST /api/workspace/patch/preflight`) — it dry-runs the exact PATCH gates and returns
`{ ok, allowed[], policy:{ok,violations[]}, schema:{ok,errors[]}, repairPlan[], safeNextStep, appScopeVerdict? }`
and *cannot disagree with the real PATCH* (it uses the write path's merge step).

**Validator rules verified live on the running runtime** (these are the "rules of physics" an
agent must satisfy — each was observed as a real rejection then repaired):

| Layer | Rule observed | Repair |
|---|---|---|
| allowlist | top-level key not in `dashboards\|widgetTypes\|canvas\|dataModel` → **400** `allowed[]` | remove the key; those fields are read-only via this API |
| policy | `full_config_body`, `credential_field`, `oversized_*`, `live_workflow_field`, `source_records_through_patch` → **422** `violations[]` | follow the violation's `message`/`repairPlan` |
| schema | `dataModel.objects[].binding.mode` must be one of `manual\|json\|csv\|integration` | set `binding: { mode: "manual" }` |
| schema | every object needs `id`, `label`, `rows[]`; `columns` string[] when present | supply them; never guess shapes — read `workspace-schema.js` |
| schema | widget `config.binding.mode` required when bound | `binding: { objectId, mode: "manual" }` |
| layout | widget needs a `position` object | `position: { x, y, w, h }` |
| layout | `position` must fit the dashboard grid `[0..16]` | keep `y + h ≤ 16` |
| layout | widget must not overlap an existing widget's cells | place in a free row (read existing positions first) |
| scope | `x-growthub-app-scope` violations → `AppScopeViolation` + `repairPlan[]` | mutate only the app's `objectRefs`, or register the ref first |

Rejection is navigation. Never route-shop or hand-write files to dodge a 422 — the corrected
body is always reachable by reading the reason.

---

## 5. Layer 3 — Intelligence (graph + blast radius)

Once a mutation lands, the platform **understands** it. Two intelligence surfaces, both
read-only and secret-free:

### 5.1 The metadata graph — the world model

`GET /api/workspace/metadata-graph` projects the live config + source-record sidecar into a
typed node/edge graph (`buildWorkspaceMetadataStore → buildWorkspaceMetadataGraph`,
`lib/workspace-metadata-graph.js`). Every governed object becomes nodes (object, field, widget,
dashboard, workflow, workflowNode, sandbox, run, integration, sourceRecord, workerKit, …) and
every dependency becomes a deterministic edge (`bindsToObject`, `usesField`, `containsWidget`,
`readsObject`/`writesObject`, `usesSandbox`, `executedWorkflow`, `producedArtifact`,
`materializes`, …). This is the same graph the **Workspace Map** (`/workspace-map`) renders. A
landed mutation **expands the world model**: new object + fields + widget + bindings become new
nodes and edges — the workspace now knows more about itself than before.

### 5.2 Blast radius — the causal intelligence

The graph ships single-hop `findDependents(graph, nodeId)` (incoming edges, one level). The
**transitive** closure — *the actual blast radius* — is `deriveBlastRadius(graph, nodeId)` in
[`lib/workspace-metadata-impact.js`](../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-metadata-impact.js):
a deterministic breadth-first walk of incoming edges returning every reachable dependent with
its hop distance and the relation it was reached through. Cycle-safe, honestly truncated,
secret-free.

This is the difference between a **catalog** and an **intelligence layer**:

- A catalog answers: *what directly uses this field?* (`mrr → MRR by plan widget`)
- The intelligence layer answers: *if this field changes, what product surfaces, dashboards,
  and delivered workspace artifacts are affected?*
  (`customers.mrr → widget → Ops Overview dashboard → workerKit`)

### 5.3 The governance record

`GET /api/workspace/agent-outcomes` returns the receipt stream every mutation lane emits +
a derived governance summary (blocked attempts, publishes, drafts awaiting test, live rows
without proof). A new session reads the stream, cites `receiptId`s, and continues from
`nextActions` / `rollbackRef`. See the SKILL card §"Agent Outcome Loop V1".

---

## 6. The operate-the-universe loop (reproducible)

An agent can boot and operate the entire control plane end-to-end. This is the validation
standard for any customer-visible workspace change (`AGENTS.md` §"Runtime And Validation";
[`AGENTIC_PRODUCT_PR_REVIEW_LOOP.md`](./AGENTIC_PRODUCT_PR_REVIEW_LOOP.md)) — not a fixture.

```bash
# 1. Export + seed a disposable governed workspace (validates activation 5/5 + cockpit spine)
node scripts/export-seed-workspace.mjs --no-dev --keep
#    → $GROWTHUB_KIT_EXPORTS_HOME/feature-work-<ts>/.../apps/workspace

# 2. Boot the live runtime
cd <export>/apps/workspace && npm install && npx next dev --webpack -p 3777
#    → GET http://localhost:3777/api/workspace  →  200

# 3. OPERATE through the governed boundary (read → preflight → patch → confirm)
#    a) read live config + object/field shapes
curl -s $WS/api/workspace | jq '.workspaceConfig.dataModel'
#    b) preflight the exact body (fix every reason it returns)
curl -s -X POST $WS/api/workspace/patch/preflight -H 'content-type: application/json' -d '{"dataModel":{...}}'
#    c) PATCH only the changed allowlisted key
curl -s -X PATCH $WS/api/workspace -H 'content-type: application/json' -d '{"dataModel":{...}}'

# 4. READ the intelligence layer — graph recompute + blast radius
curl -s $WS/api/workspace/metadata-graph     # node/edge counts grew
#    deriveBlastRadius(graph, "<field|object node id>")  → transitive downstream chain

# 5. Tear down (disposable)
pkill -f "next dev"
```

Use `scripts/runtime-control.sh` for *repo* dev/PR validation; the exported `apps/workspace` app
is the lane for *workspace smoke tests*. Keep the two lanes separate.

---

## 7. Canonical proof artifact (verified, no fixture, no bypass)

The full lifecycle, executed once on a live runtime and banked as the reference example:

> An agent exported and booted a real workspace, then through **only** `PATCH /api/workspace`
> created a governed `Customers` Data Model object (`columns: [name, email, plan, mrr]`,
> `binding.mode: "manual"`) and an `MRR by plan` chart widget bound to it
> (`config.binding.objectId: "customers"`, `xAxis.field: "plan"`, `yAxis.field: "mrr"`).
> The Law layer rejected the intermediate attempts — `binding.mode` invalid, widget `position`
> required, `y/h` outside the `[0..16]` grid, cell overlap — and the agent repaired each from the
> structured reason until preflight returned `ok:true, policy ok, schema ok` and the writes
> landed. The live metadata graph grew **75 → 83 nodes, 25 → 31 edges**. `deriveBlastRadius`
> on the real `customers.mrr` field returned the transitive causal chain:
>
> ```
> customers.mrr
>   → [widget]    MRR by plan      via usesField        (d1)
>   → [dashboard] Ops Overview     via containsWidget   (d2)
>   → [workerKit] …Starter Kit     via materializes     (d3)
> ```
>
> Single-hop `findDependents` returns only d1; the intelligence layer reached d2 + d3 — the
> downstream dashboard and the delivered workspace kit.

**The headline:** *an agent safely created new business capability inside a live Growthub
workspace using only the governed PATCH boundary, while the platform validated the mutation,
expanded the workspace graph, and derived downstream blast radius across dashboard and delivery
surfaces.*

This is IDP 2.0 behavior. Traditional IDP: a developer registers service metadata; the catalog
displays it. Here: an agent creates governed business objects through a sanctioned API, the
control plane validates the mutation, the topology expands, and blast radius derives transitive
downstream impact across widgets, dashboards, and workspace kits. Live workspace state +
governed mutation + transitive impact intelligence.

---

## 8. Anti-patterns

- Treating validator rejections as failures instead of navigation — the corrected body is always
  reachable from the reason.
- Hand-writing `growthub.config.json` / `growthub.source-records.json` while the app is the
  runtime authority, or inventing a mutation route — the boundary is the only way reality changes.
- Building a second dependency model beside the metadata graph — blast radius reverse-traverses
  the existing one.
- Claiming "needs browser QA, cannot validate" — the export-and-operate loop (§6) is always
  available and is the proof standard.
- Validating only on a hand-built fixture when the live universe can be booted and operated.
- Bypassing app scope, smuggling history into rows, or putting credential values in any body —
  all runtime-blocked (see the SKILL card anti-patterns).
</content>
