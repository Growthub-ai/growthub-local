# Agent Harness Implementation Plan V1

Final plan of the harness-synthesis series ([synthesis](./AGENT_HARNESS_PATTERN_SYNTHESIS_V1.md) → [probe](./AGENT_HARNESS_RUNTIME_PROBE_V1.md) → [blueprint](./AGENT_HARNESS_ADOPTION_BLUEPRINT_V1.md) → this). Verified against **stable main `0.14.1`** on-branch.

**The product outcome, in one sentence:** users can track, manage, and have full visibility over the continued training of their own custom models — distillation traces accumulating from real workspace work, exports moving to external fine-tuning, tuned weights coming back as the active local model — entirely inside the existing workspace mental model, through **one new CLI command, one helper slash-command, one sidecar record key, and one sub page**, with zero API-contract changes, zero new API routes, and zero new runtime modules.

## 1. Hard Rules (non-negotiable scope fence)

1. **Do not touch `packages/api-contract`.** Everything rides existing types: the shipping `growthub-local-intelligence-trace-v1` record, the opaque `CapabilityNode.manifestMetadata` passthrough, existing `SkillManifest` fields.
2. **Do not create API routes.** The sub page is a server component reading through the existing libs (`readWorkspaceSourceRecords`, workspace config readers); the sidecar view reads what the widget already fetches.
3. **Do not create a new runtime module.** The export logic extends `cli/src/runtime/native-intelligence/source-record-export.ts` — the module that already owns the trace-record format.
4. **One command into the user experience**: `growthub intelligence export`. (The `growthub intelligence` family is the documented future command surface in `NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` §48 — this promotes exactly one of those candidates, nothing else.)
5. **Canonical entry parity with `/swarm`.** All user-facing entry follows the `HELPER_COMMANDS` registry pattern (`app/data-model/components/helper-commands.js`): read-only commands switch a sidecar view, mutating commands seed governed proposals, nothing executes or patches directly. The training entry is read-only, modeled byte-for-byte on `/workflows` → `view: "swarm-list"`.
6. **Sidecar discipline.** New persistence is one append-only source-record key — `training:exports` — identical in shape-discipline to `helper:apply:receipts` and `sandbox:<objectId>:<slug>`.
7. **Governance unchanged**: PATCH allowlist untouched, propose/apply untouched, trace/policy append-only through the CLI, credentials never in records (existing sanitize layer + digesting), no in-CLI training ever (§30 invariant).
8. **No stubs, no fallbacks, no scaffolds.** The smoke path is the canonical temp-export lane (`scripts/export-seed-workspace.mjs`, which already chains `export-worker-kit.mjs --qa`, seeds a super-admin-ready workspace, validates, boots). Its seed module (`scripts/lib/workspace-feature-seed.mjs`) is the single designated edit point.

## 2. Already Shipped — Work This Plan Must NOT Redo

| Capability | Where (0.14.1) |
| --- | --- |
| Distillation trace record + serializer + prompt hashing | `source-record-export.ts`: `LocalIntelligenceTraceRecordV1`, `sandboxEnvelopeToTraceRecord`, `formatTraceRecordLine`, `hashSystemPrompt` |
| Preference-shaped validation fields on that record | `validation.acceptedToolIntents` / `rejectedToolIntents` |
| Swarm telemetry **and reward** persisting per run | `orchestration-agent-swarm.js` → sandbox source records: per-task `{tokens, tools, durationMs, status}` + `reward {parallel, finish, outcome, score, weights}` |
| Self-eval trace events with attempt counting | `cli/src/skills/self-eval.ts`: `self_eval_recorded`, `countAttempts`, `maxRetries` guard |
| Helper apply receipts (applied side) | `workspace-helper-apply.js::buildApplyReceipt` → `helper:apply:receipts` |
| Slash-command registry + governance invariants + unit suite | `helper-commands.js` (`/goal /loop /workflows /swarm /register-api /create-object`), `scripts/unit-helper-command-registry.test.mjs` |
| Background Tasks surface (the layout to mirror) | `/workflows` command → `swarm-list` sidecar view; `app/workflows/` page; `SwarmRunCockpit.jsx` |
| Sidecar read/write libs | `lib/workspace-config.js::readWorkspaceSourceRecords` + writers used by sandbox-run |
| Local model management, favorite semantics, `localModel` config | Local Intelligence lane + provider candidate resolution |
| External fine-tune handoff contract | `NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` §31.2 (JSONL out → QLoRA → load weights → select `localModel`) |
| Temp-export smoke harness | `scripts/export-seed-workspace.mjs` + `.md` + `lib/workspace-feature-seed.mjs` (swarm-specific predecessor deliberately deleted — not resurrected) |

## 3. Part A — The Feature: Continued-Training Visibility (one closed loop)

### A1. The command — `growthub intelligence export`

| | |
| --- | --- |
| EXISTS | All four trace sources persist today (receipts sidecar, `.growthub-fork/trace.jsonl`, `pipeline_stage_*` events, `sandbox:*` records with reward); the record format and serializer exist in `source-record-export.ts`; `GROWTHUB_KIT_EXPORTS_HOME` is the established export home |
| NET-NEW | One command registration (`cli/src/index.ts` + thin command file) and reader functions **inside `source-record-export.ts`** that normalize all four sources into the existing `growthub-local-intelligence-trace-v1` record: `businessObjectType` carries the surface (`helper-receipt`, `self-eval`, `pipeline-stage`, `swarm-task`), `input.userIntent` carries the intent/prompt digest, `output.json` carries outcome + reward, `validation.accepted/rejectedToolIntents` carries the applied/skipped preference pair. Output: `${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}/training/<workspace>-<ts>.jsonl` + **one append** to the workspace sidecar under `training:exports`: `{exportId, at, modelId, recordCount, surfaces:{helper,selfEval,pipeline,swarm}, escalations, rewardMean, path}`. Sanitize pass + size-threshold digesting on every record. Closing print: the §31.2 handoff steps with the user's actual `localModel` id inlined |
| USER-VISIBLE | The single new touchpoint of the whole feature: one command that turns lived workspace history into a training-ready corpus and a ledger entry. Also surfaced as one text menu item inside the **existing** Local Intelligence lane (no new lane, no icon) that runs the same command |

### A2. The entry — `/training` in the helper widget (identical to `/swarm`'s registry path)

| | |
| --- | --- |
| EXISTS | `HELPER_COMMANDS` registry, its allowed-keys governance fence, the slash-menu composer, the `view:` switch mechanism (`/workflows` → `swarm-list`), the unit suite asserting registry invariants |
| NET-NEW | One registry entry: `{name:"/training", label:"Training", description:"Open your model training ledger — read-only, no writes", scope:"workspace", mutates:false, view:"training"}` + one sidecar view in `HelperSidecar.jsx` rendering the training ledger with the **same list layout as the background-tasks view**: active `localModel`, export entries from `training:exports` (when / record count / surface mix / file path), and escalation+reward coverage counts. Registry unit suite extended with the new row (same invariants) |
| USER-VISIBLE | Typing `/` in the assistant helper composer now offers **Training** alongside Workflows and Swarm; selecting it opens the ledger in the same sidecar, same interaction grammar, zero new chrome |

### A3. The page — one sub page, clean layout, no routes

| | |
| --- | --- |
| EXISTS | `app/workflows/` page structure (the Background Tasks page whose layout is mirrored), server-side config + `readWorkspaceSourceRecords` access, the layout primitives every existing page uses |
| NET-NEW | `app/training/page.jsx` — a server component (no API route) with four sections in the existing layout language: **Active model** (canonical `modelId` + concrete `localModel`, where to change it — the existing Local Intelligence flow); **Training exports** (the `training:exports` ledger, newest first); **Trace coverage** (per-surface record counts, escalation diagnoses count, swarm reward mean — the "is my corpus getting richer" answer at a glance); **Fine-tune handoff** (the §31.2 loop rendered as copyable steps with real paths from the latest export). All controls are links/copyables into existing surfaces — the page mutates nothing |
| USER-VISIBLE | A single place answering: *what has my workspace learned, when did I last export it, what model is it feeding, and what do I do next.* The full track/manage/access loop for continued training of their own custom models — distillation export on one side, fine-tuned weights returning via the existing `localModel` selection on the other |

### A4. The loop, end to end (every arrow already exists except the three items above)

```text
real work (helper applies · swarm runs · self-evals · pipelines)
      └─► traces persist (EXISTS)
              └─► growthub intelligence export  (A1 — NEW)
                      ├─► training/<ts>.jsonl  → external QLoRA (EXISTS, §31.2)
                      │         └─► weights → Ollama/LM Studio → localModel select (EXISTS)
                      └─► training:exports sidecar entry
                              └─► /training sidecar view (A2) + training page (A3)
                                        └─► user sees coverage grow → does more real work  ⟲
```

### A5. Smoke test — through the canonical lane, no parallel harness

`workspace-feature-seed.mjs` (the designated edit point) additionally seeds: one applied + one skipped helper receipt, a short self-eval history ending in exhaustion, and one historical `training:exports` entry. Then:

```bash
node scripts/export-seed-workspace.mjs           # EXISTS: export --qa → seed → validate → next dev
growthub intelligence export --workspace <export>/apps/workspace
# assert: JSONL parses line-by-line as growthub-local-intelligence-trace-v1;
#         contains helper-receipt pair + self-eval + swarm-task (from seeded sandbox evidence);
#         new training:exports entry appended; zero credential patterns (grep audit)
# browser: /training page shows 2 ledger entries + coverage; helper "/" menu shows Training;
#         sidecar view matches background-tasks layout
```

The script's automatic validation gains these assertions; `scripts/unit-helper-command-registry.test.mjs` and a sibling `unit-training-ledger.test.mjs` (same script-test convention) cover the registry row and ledger derivation deterministically.

## 4. Part B — Research Items Preserved, Re-Scoped to Zero-Contract Paths

Nothing from the research is dropped; everything heavy was re-cut to fit the fence in §1.

| Research item | Re-scoped implementation (no contract, no routes, no new runtime) | Feeds |
| --- | --- | --- |
| Self-eval escalation (O4) | `self-eval.ts` emits `self_eval_escalated` (kit-local trace event names are already valid by rule) once per exhaustion with the recursion guard + locally-satisfiable remediation; escalation section added to `templates/self-eval.md` across all 16 kits in one change; `--qa` check added | Escalation diagnoses appear in A1's corpus and A3's coverage stats |
| Trigger grammar + routing eval (O2) | No new fields: TRIGGER/SKIP grammar authored into the **existing** `description` + `triggers[]` of the 10 repo skills (the observed-harness prose grammar); routing accuracy becomes `scripts/unit-skill-trigger-routing.test.mjs` (existing script-test convention) seeded from the marketing-operator's real 29-row dispatch table — CI, not UX | Misroutes fall; eval outcomes are exportable work history like everything else |
| Capability usage guidance (O3) | No contract change: guidance objects ride the **existing opaque `manifestMetadata`** passthrough on local-extension manifests; planner/summarizer prompt assembly reads it when present. First real content: the video-generation `refs[].dataUrl` negative example | Plans get more correct → higher applied-rate → richer corpus |
| Skip-receipt persistence (K1's key pair) | The ~15-line `workspace-helper-apply.js` change (additive `outcome` + `skipReason` on receipts, same key, same route) — unchanged from prior revision, it is the preference-pair substrate A1 exports | `validation.rejectedToolIntents`-side of the corpus |
| Origin markers, monotonic policy, tier/taints (O7/O10) | Later phase, all in CLI-owned files (`fork.json`, `policy.json`) and the existing `kit validate` + toolIntent policy module — no contract or route work. Taints consume escalation streaks from Part B item 1 | Trust posture for the corpus's provenance |
| Corpus-record freeze into the SDK (old Phase 7) | **Deferred indefinitely** — the existing trace record version proved sufficient; freezing happens only if a second external consumer materializes, per the CMS-SDK "freeze shipped internals" rule | — |

Dependency order is unchanged in spirit: A (the loop) ships first and alone; B-items land independently afterward, each enriching the same ledger the user already watches.

## 5. What Is Deliberately Not Built

No api-contract edits of any kind. No API routes. No new runtime directories. No second command. No new helper intent (the registry entry is read-only; object creation, if a user wants a custom training object, already has `/create-object`). No new discovery lane, icon, or widget type. No cost-in-currency math. No in-CLI training. No resurrection of the deleted swarm-specific export script. No parallel smoke harness — the seed lane is the harness.
