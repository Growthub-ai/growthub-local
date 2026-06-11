# Agent Harness Implementation Plan V1

Fourth and final document in the harness-synthesis series. [`AGENT_HARNESS_ADOPTION_BLUEPRINT_V1.md`](./AGENT_HARNESS_ADOPTION_BLUEPRINT_V1.md) selected three compounding kernels (K1 Decision Corpus, K2 Behavioral Contracts, K3 Graduated Trust). This document converts them into a finalized, file-level implementation plan against **stable main `0.14.1`** (`@growthub/cli@0.14.1`, `@growthub/api-contract@1.4.0`, verified on-branch — not from memory).

Every claim in this plan is delineated three ways: **EXISTS** (shipped at 0.14.1, with file path), **NET-NEW** (the exact delta this plan adds), and **USER-VISIBLE** (what an operator actually sees change, in which existing surface). Anything that exists is never restated as work; anything net-new must terminate in a real, user-reachable outcome.

## 1. Ground-Truth Corrections (blueprint → 0.14.1 reality)

| Blueprint assumption | 0.14.1 reality | Effect on plan |
| --- | --- | --- |
| `swarm_agent_complete` needs a usage stanza | `SwarmAgentCompleteEvent` already carries `tokens`/`tools`/`durationMs` (`packages/api-contract/src/events.ts:144-155`), and the swarm runtime (`orchestration-agent-swarm.js`) already persists per-task truthful telemetry **plus a computed reward block** `{kind, parallel, finish, outcome, score, weights}` into sandbox source records | **Item deleted.** K1 reads what already persists; no event or emitter changes |
| `SkillManifest` needs a `triggers` object | `triggers?: string[]` already exists (`skills.ts:135`) | New fields must be additive **siblings** (`skipTriggers`, `precheck`), never a reshape |
| `self_eval_escalated` is a new event family | `cli/src/skills/self-eval.ts::recordSelfEval` already writes typed `self_eval_recorded` events with outcomes `pass\|fail\|retry-pending\|parked` and a `countAttempts` reader; trace writers explicitly tolerate kit-local event names | Escalation is a **small extension of an existing module**, not new machinery |
| A corpus exporter command exists to extend | `LocalIntelligenceTraceRecordV1` + `sandboxEnvelopeToTraceRecord` + `formatTraceRecordLine` exist (`cli/src/runtime/native-intelligence/source-record-export.ts`) but are **internal-only — no CLI command** | The command is real new work; the record machinery is not |
| Helper receipts encode accept/reject pairs | `buildApplyReceipt` (`workspace-helper-apply.js:365-377`) persists receipts **only for applied proposals** (`{type, affectedField, rationale, confidence, appliedAt, ranAt, reviewedBy, sessionId}` under source-record key `helper:apply:receipts`); skipped proposals are returned in the apply response but **not persisted** | The single highest-value small change in the plan: persist the skip half (Phase 1, item 1.2) |
| (earlier draft of this plan) the swarm/export script "does not exist" | **Wrong — corrected.** `scripts/export-seed-workspace.mjs` + `scripts/export-seed-workspace.md` + `scripts/lib/workspace-feature-seed.mjs` are the canonical temp-export lane: export the starter kit **via `export-worker-kit.mjs --qa`** (line 151), seed a super-admin-ready `growthub.config.json` + `growthub.source-records.json` + `.env.local`, validate (schema, activation 5/5, cockpit spine score 100), boot `next dev`. The seed includes real sandbox rows: `probe-local-sbx` (baseline run evidence), `registry-workflow` (an `orchestrationConfig` swarm graph), and the hidden `local-intelligence` helper row. A swarm-specific predecessor (`smoke-export-swarm-workspace.mjs`) was **deliberately deleted** in favor of this agnostic lane | This script is the **standing smoke harness** for Phases 1–2 and the anchor of Phase 5. The plan must extend its seed, not build a parallel harness — and must not resurrect the deleted swarm-specific lane |
| — | `cli/package.json` pins `@growthub/api-contract@1.3.0-alpha.2` while the package is `1.4.0` — a live pin drift on main | Phase 0 precondition before any contract change |
| — | A toolIntent policy module already exists (`native-intelligence-tool-intent-policy` vitest suite) | K3 tiers parameterize an existing policy, not a new one |

## 2. Binding Constraints (apply to every phase)

1. **Zero UI additions.** No new icons, lanes, widgets, panels, or routes. Every surfaced behavior flows through surfaces that already exist: helper query/apply/receipts JSON, CLI JSON envelopes, `trace.jsonl`/`project.md`, the existing discovery text menus, and the seeded temp-export workspace.
2. **Governance intact.** PATCH allowlist (`dashboards`, `widgetTypes`, `canvas`, `dataModel`) untouched. Propose/apply boundary untouched. Trace and policy remain append-only, written through the CLI. Credentials never enter records — the existing sanitize layer (`workspace-helper-sanitize`) is reused, and the corpus writer digests large payloads. Seed-time writes stay in the seed lane (pre-boot filesystem, per `export-seed-workspace.md`); post-boot mutations stay in governed APIs — the same split that document already mandates.
3. **Additive-only contracts.** New optional fields and new event type strings only; `SKILL_MANIFEST_VERSION` and `PIPELINE_TRACE_VERSION` sentinels stay `1`; consumers ignore unknown fields per the existing NDJSON rule.
4. **No stubs, no fallbacks, no scaffolds.** A phase ships only when its real end-to-end smoke test passes through the canonical temp-export lane (`export-seed-workspace.mjs`) against shipping code paths. Anything that cannot ship complete is cut from the phase, not stubbed.
5. **No timelines.** Phases are ordered by data dependency only; each is independently shippable and leaves main releasable.
6. **Version discipline per `AGENTS.md`**: bumps only when source ships to npm; `cli` and `create-growthub-local` move together with matching pin; semver always read from the branch.

## 3. Phase 0 — Precondition (no feature code)

| Delineation | Content |
| --- | --- |
| EXISTS | `scripts/check-version-sync.mjs`, `scripts/check-cli-package.mjs` |
| NET-NEW | One-line pin fix: `cli/package.json` dependency on `@growthub/api-contract` aligned to the actual `1.4.0` before any contract addition lands on top of the drifted `1.3.0-alpha.2` pin |
| USER-VISIBLE | Nothing. Hygiene only |
| DONE WHEN | Both check scripts pass; `cd cli && npx tsc --noEmit` clean |

## 4. Phase 1 — K1: Decision Corpus (read-only exporter + the missing skip receipts)

The flywheel's substrate. Everything here reads artifacts that already persist, plus one data-layer write extension.

| # | EXISTS (0.14.1) | NET-NEW | USER-VISIBLE |
| --- | --- | --- | --- |
| 1.1 | `LocalIntelligenceTraceRecordV1`, `formatTraceRecordLine`, `hashSystemPrompt` (`cli/src/runtime/native-intelligence/source-record-export.ts`) — record/serialize machinery, internal-only | `cli/src/runtime/decision-corpus/record.ts` defining `GovernedDecisionRecordV1` `{v:1, at, surface: "helper"\|"selfEval"\|"pipeline"\|"swarm"\|"triggerEval", context:{forkId?, runId?, kitId?, parentRef?}, input:{intent?, digest?}, decision, outcome, diagnosis?, confidence?, usage:{tokens?, tools?, durationMs?}, reward?}` + serializer reusing the existing newline-JSONL convention. CLI-runtime module now; api-contract freeze deferred to Phase 7 per the CMS-SDK "freeze shipped internals" philosophy | Nothing yet (types) |
| 1.2 | Apply route computes `{applied[], skipped[]}` (`workspace-helper-apply.js`); `buildApplyReceipt` persists **applied only** under `helper:apply:receipts`; `/api/workspace/helper/receipts` already returns receipts | Build receipts for skipped proposals too: additive fields `outcome: "skipped"` + `skipReason`; applied receipts gain `outcome: "applied"`; absent `outcome` on historical receipts reads as applied (no migration). Same source-record key, same route | `growthub workspace helper receipts` and the receipts route show *why* a proposal didn't land — in the JSON they already render. The accept/reject preference pair is complete |
| 1.3 | All four emitters persist today: receipts sidecar; `trace.jsonl` self-eval events; `pipeline_stage_*` events with the `isPipelineTraceEvent` guard; `sandbox:*` source records carrying per-task `{tokens, tools, durationMs, status}` **and the reward block** | Four readers in `cli/src/runtime/decision-corpus/readers/` (helper-receipts, self-eval, pipeline, swarm), each skipping unknown event types per the existing consumer rule | Nothing directly (plumbing) |
| 1.4 | No `growthub trace` command exists | `cli/src/commands/trace.ts`: `growthub trace export-corpus --out <file.jsonl> [--fork <path>] [--workspace <path>] [--json]`, registered in `cli/src/index.ts`; JSON envelope matches `workspace status --json` conventions; sanitize pass + size-threshold digesting (SHA-256, reusing `hashSystemPrompt`'s pattern) on every record | **The one new operator touchpoint of the whole kernel**: one command that turns a workspace's lived history into a training-ready JSONL corpus — the input to the already-documented external fine-tune path (`NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` §31.2) |
| 1.5 | Vitest conventions in `cli/src/__tests__/` (run via `vitest` directly — no npm test script exists) | `decision-corpus-export.test.ts`: round-trip fixtures produced by the *actual writers* (`buildApplyReceipt`, `recordSelfEval`, pipeline trace writer, a captured real swarm source record) → readers → records → parse | CI confidence |

**Smoke test — runs through the canonical temp-export lane, not a hand-rolled harness:**

```bash
node scripts/export-seed-workspace.mjs              # EXISTS: export --qa → seed → validate → next dev
# seeded workspace already contains: sandbox run evidence (probe-local-sbx),
# an orchestration graph row (registry-workflow), source-records sidecar
growthub workspace helper query --intent build_dashboard --prompt "revenue overview" --json > p.json
growthub workspace helper apply --proposal-file p.json --yes        # apply one, leave one skipped
growthub trace export-corpus --out /tmp/corpus.jsonl --workspace <export>/apps/workspace
# assertions: ≥1 applied + ≥1 skipped record (the pair), swarm-surface records present
# from the seeded sandbox evidence, every line parses as GovernedDecisionRecordV1,
# zero credential patterns (grep audit), seeded artifacts untouched post-boot (governed-API rule)
```

## 5. Phase 2 — K1: Self-Eval Escalation

| # | EXISTS (0.14.1) | NET-NEW | USER-VISIBLE |
| --- | --- | --- | --- |
| 2.1 | `recordSelfEval` writes `self_eval_recorded` `{detail:{skill, attempt, maxRetries, criterion, outcome, notes}}` to `trace.jsonl` via `appendKitForkTraceEvent`, plus `project.md` via `appendSessionLogEntry`; `countAttempts` reads attempt history; `maxRetries` guard at `self-eval.ts:68-71` | When a non-`pass` outcome lands at `attempt === maxRetries`: emit one `self_eval_escalated` event `{detail:{skill, failingCriteria[], attempts, diagnosis, remediation}}` + one escalation block in `project.md`. Guard: scan trace (the `countAttempts` pattern) for an existing escalation since the last `pass` — at most one per exhaustion | Retry exhaustion stops being silence. The diagnosis appears in `project.md` — the file the canonical journey already tells operators to read first — and as a typed event in the trace they already inspect |
| 2.2 | `policy.json` carries `remoteSyncMode` | Satisfiability rule: `remediation` is built from locally-actionable options only — never a hosted-authority instruction for a local-only fork (the AWaC port of the probed Stop hook's "no remote → don't demand a push" bail) | Escalation messages are always actionable as written |
| 2.3 | `templates/self-eval.md` ships in every kit; `export-worker-kit.mjs --qa` checks its presence (one of the enumerated v1.2 primitive checks) | Escalation-protocol section added to the starter kit template **and all 16 bundled kits in the same change**; `--qa` gains the section check. Partial rollout violates constraint 4 | Kit operators see the escalation protocol documented in the template their fork already seeds from |
| 2.4 | Deterministic self-eval vitest coverage | Extend: exhaustion emits exactly once; pass resets guard; remediation respects policy; Phase-1 reader maps `diagnosis` through | CI confidence |

**Smoke test:** seeded temp-export workspace + real fork; drive the documented agent loop to `maxRetries` with a deliberately failing criterion; assert single `self_eval_escalated` in `trace.jsonl`, escalation note in `project.md`, diagnosis-labeled record in `trace export-corpus` output, `export-worker-kit.mjs --qa` green for all 16 kits.

## 6. Phase 3 — K2: Trigger Grammar + Routing Eval

| # | EXISTS (0.14.1) | NET-NEW | USER-VISIBLE |
| --- | --- | --- | --- |
| 3.1 | `SkillManifest.triggers?: string[]` (`skills.ts:135`); sentinel `SKILL_MANIFEST_VERSION = 1` | Additive siblings: `skipTriggers?: string[]`, `precheck?: { command: string; skipOnZeroExit: boolean; description: string }`. `api-contract` `1.4.0 → 1.5.0`; cli pin follows (clean after Phase 0) | Nothing yet (types) |
| 3.2 | `growthub skills validate` checks name/description lengths, helper/subSkill paths, `maxRetries` range (`cli/src/commands/skills.ts::runValidate`) | Validation for the new fields in the existing style and output paths | `skills validate` catches malformed trigger grammar the moment it's authored |
| 3.3 | The marketing-operator skill ships a real 29-row intent dispatch table + chaining rules; the video-generation skill encodes the `refs[].dataUrl` binding rule as prose | Author `skipTriggers`/`precheck` content for all 10 repo skills from that real material. Fields with no shipped content would be scaffolding — prohibited | Operator skills route correctly on the first try; misroutes that today need prose-reading become declarative |
| 3.4 | The recommender already implements lexical similarity scoring (reused pattern, not new) | `growthub skills eval-triggers --fixtures <file> [--json]`: replay prompt→expected-skill fixtures; `skipTriggers` as hard negatives, `precheck` as deterministic short-circuits; per-skill accuracy report; writes `surface:"triggerEval"` records through the Phase-1 writer. Seed fixtures derived from the 29 real dispatch rows, committed under `cli/src/__tests__/fixtures/` | Maintainers get a routing-accuracy number that was previously folklore |
| 3.5 | Vitest conventions | Scorer suite; validate-extension cases; accuracy floor asserted in CI from the first real measured run (not an aspiration) | CI confidence |

**Smoke test:** `skills validate` green repo-wide; `eval-triggers` emits accuracy report + corpus records; `--qa` green (kits without the new fields stay valid — optional means optional).

## 7. Phase 4 — K2: Capability Usage Guidance

| # | EXISTS (0.14.1) | NET-NEW | USER-VISIBLE |
| --- | --- | --- | --- |
| 4.1 | `CapabilityNode` has optional `description` and opaque `manifestMetadata` (`capabilities.ts:147-180`); manifest envelope in `manifests.ts` | Typed optional `usageGuidance?: { whenToUse?; whenNotToUse?; orchestrationRules?: string[]; negativeExamples?: string[] }` on `CapabilityNode`; optional `instructions?: string` on the envelope (the MCP connect-time channel, ported). Same release train as Phase 3 | Nothing yet (types) |
| 4.2 | Registry client with manifest → projection → cached/legacy fallbacks (`cms-capability-registry/index.ts::createCmsCapabilityRegistryClient`); `CapabilityRegistrySource` already includes `"local-extension"` | Projection passthrough of the new fields. Because local-extension is an existing source, guidance ships **now** via local manifests — no hosted-CMS dependency. First real content: the video-generation `refs[].dataUrl` rule as `negativeExamples`, ordering rules for multi-step families as `orchestrationRules` | Nothing yet (plumbing) |
| 4.3 | Planner assembles contract summaries; summarizer produces readiness/risk output (`native-intelligence/planner.ts`, `summarizer.ts`) | Both consume `usageGuidance`: planner includes it for candidate nodes; summarizer surfaces `whenNotToUse` cautions. Ships in the same phase — dormant fields violate constraint 4 | The flow the user already runs — ask, get plan, get readiness summary — gets *more correct*: wrong binding shapes are flagged with the reason **before** execution instead of failing after. No new surface, no new words to learn |
| 4.4 | Deterministic planner/summarizer suites | Guidance-in-context, caution-in-output, projection round-trip, absent-field-no-op cases | CI confidence |

**Smoke test:** full flow-suite run (discovery → "Run native-intelligence with your prompt") over a video intent against a local-extension manifest carrying the dataUrl rule; plan/summary visibly reflect the guidance; `growthub pipeline validate` behavior unchanged — guidance advises, deterministic rails stay deterministic.

## 8. Phase 5 — Temp-Export Lane as the Standing Smoke Harness

Corrected scope. The canonical lane **exists**: `export-seed-workspace.mjs` already chains `export-worker-kit.mjs --qa`, seeds a lived-in workspace (activation 5/5, cockpit spine 100, sandbox evidence, orchestration graph row), validates against the exported kit's own libs, and boots the app. Its swarm-specific predecessor was deliberately deleted; this plan does **not** resurrect it.

| # | EXISTS (0.14.1) | NET-NEW | USER-VISIBLE |
| --- | --- | --- | --- |
| 5.1 | `export-seed-workspace.mjs` (export → seed → validate → dev), `workspace-feature-seed.mjs` (single edit point for baseline shapes, per its own agent contract), `--no-dev`/`--dry-run`/`--clean` flags, safety rails (refuses in-repo targets) | Extend `workspace-feature-seed.mjs` only: seed one deterministic applied+skipped receipt pair and one self-eval attempt history. The script's automatic validation gains two assertions: `trace export-corpus` over the seeded export yields the expected record set; escalation machinery (Phase 2) fires correctly against seeded exhaustion state | `node scripts/export-seed-workspace.mjs` — the command feature work already uses — now also proves the corpus kernel end-to-end on every run. One lane, no new harness |
| 5.2 | `export-worker-kit.mjs --qa` validates one kit per invocation; CI runs `smoke`/`validate`/`verify` | `--all` flag iterating every kit under `cli/assets/worker-kits/` with a summary table and non-zero exit on any failure; CI `validate` job invokes it, making six-primitive parity (incl. Phase 2's template check) a merge gate instead of a convention | Contributors see kit-parity failures in CI before review instead of in operator hands after merge |

**Smoke test:** `export-seed-workspace.mjs` full run green including the two new assertions; `--qa --all` green across all 16 kits locally and in CI.

## 9. Phase 6 — K3: Origin Markers, Monotonic Policy, Tiered ToolIntents

| # | EXISTS (0.14.1) | NET-NEW | USER-VISIBLE |
| --- | --- | --- | --- |
| 6.1 | Import paths (`starter import-repo`, `starter import-skill`, `kit fork register`) materialize agent-facing files; `fork.json` is the identity record | `origin: "external"` entries in `fork.json` for imported agent-facing files (`SKILL.md`, `AGENTS.md`, nested skills). Absent means first-party | `fork.json` — a file fork operators already read — shows provenance |
| 6.2 | `growthub kit validate` validates kit structure; `policy.json` is the operator contract | Monotonicity check at validate/register: imported content that widens policy (`autoApprove: true`, allowlist extensions) is rejected with a **typed refusal reason** — the structured-denial pattern verified at the production git proxy (`repository not authorized`) | A poisoned import fails loudly at validate time with a reason, instead of silently widening the fork's authority |
| 6.3 | ToolIntent policy module (covered by `native-intelligence-tool-intent-policy` suite); sandbox adapter contract in `adapters.ts`; `growthub kit fork policy --set` is the explicit human policy surface | Optional `trustTier?: "a" \| "b"` on the local-intelligence adapter config parameterizing the *existing* allowlist; additive `taints?: string[]` on `policy.json`, appended by the CLI on defined triggers (Phase-2 escalation streaks, external-origin reads). Taints only ever narrow; restoration is exclusively `kit fork policy --set`. The agent never widens its own tier — the supervisor-plane invariant, in code | Out-of-tier toolIntents come back as typed rejections in the governed run envelope the operator already reads; tier state lives in `policy.json` where policy already lives |
| 6.4 | Tool-intent policy vitest suite | Per-tier allow/deny matrices; taint narrows; restore-is-policy-set-only; monotonic comparator fixture cases (widening kit fails, clean kit passes) | CI confidence |

**Smoke test:** real "Run sandboxed local model task" (existing discovery lane, real local model) at tier `a` proposing an out-of-tier toolIntent → typed rejection; taint appended after a forced escalation streak; `kit fork policy --set` restores; import smoke from 6.2.

## 10. Phase 7 — Freeze and Release

Only after Phases 1–6 have shipped and survived real use: promote `GovernedDecisionRecordV1` into `packages/api-contract/src/decision-records.ts` (the CMS-SDK freeze step), export from `index.ts`, bump `api-contract`, bump `cli` + `create-growthub-local` together with matching pin, update `docs/ARTIFACT_VERSIONS.md`, extend `docs/SKILLS_MCP_DISCOVERY.md` and the kit-shipped `governed-workspace-primitives.md` with corpus and escalation semantics, run `node scripts/release-check.mjs`, require `smoke`/`validate`/`verify` green, then `release.yml`.

## 11. Dependency Graph (no dates, order is data-forced)

```text
Phase 0 (pin hygiene)
   └─► Phase 1  corpus + skip receipts          ── records exist
          ├─► Phase 2  escalation                ── labels records
          ├─► Phase 3  trigger grammar + eval    ── writes triggerEval records
          │      └─► Phase 4  usageGuidance      ── same contract release train
          ├─► Phase 5  seed-lane smoke + --qa --all   ── proves 1–2 on every export run
          └─► Phase 6  origin/monotonic/tiers    ── consumes Phase-2 events as taints
                 └─► Phase 7  freeze + release
```

## 12. What Is Deliberately Not Built

No new discovery lane, icon, widget type, dashboard, or chat affordance. No parallel smoke harness — `export-seed-workspace.mjs` is the lane, extended at its single designated edit point (`workspace-feature-seed.mjs`). No resurrection of the deleted swarm-specific export script. No cost-in-currency calculation on swarm telemetry (token/tool counts stay truthful-or-null). No in-CLI training (corpus out, weights in via `localModel` — unchanged). No `kit.json` lifecycle-hook arrays (the evaluator contract ships inside Phase 2 instead). No speculative hosted-CMS `usageGuidance` ingestion — local-extension first, hosted when the hosted side ships it.
