# Agent Harness Implementation Plan V1

Fourth and final document in the harness-synthesis series. [`AGENT_HARNESS_ADOPTION_BLUEPRINT_V1.md`](./AGENT_HARNESS_ADOPTION_BLUEPRINT_V1.md) selected three compounding kernels (K1 Decision Corpus, K2 Behavioral Contracts, K3 Graduated Trust). This document converts them into a finalized, file-level implementation plan against **stable main `0.14.1`** (`@growthub/cli@0.14.1`, `@growthub/api-contract@1.4.0`, verified on-branch — not from memory).

Every item below was grounded against current source before being written. Where the blueprint's assumption differed from shipped code, this document corrects the blueprint — the corrections are listed first because several items shrank or disappeared as a result.

## 1. Ground-Truth Corrections (blueprint → 0.14.1 reality)

| Blueprint assumption | 0.14.1 reality | Effect on plan |
| --- | --- | --- |
| `swarm_agent_complete` needs a usage stanza | `SwarmAgentCompleteEvent` already carries `tokens`/`tools`/`durationMs` (`packages/api-contract/src/events.ts:144-155`), and the swarm runtime (`orchestration-agent-swarm.js`) already persists per-task truthful telemetry **plus a computed reward block** `{kind, parallel, finish, outcome, score, weights}` into sandbox source records | **Item deleted.** K1 reads what already persists; no event or emitter changes |
| `SkillManifest` needs a `triggers` object | `triggers?: string[]` already exists (`skills.ts:135`) | New fields must be additive **siblings** (`skipTriggers`, `precheck`), never a reshape |
| `self_eval_escalated` is a new event family | `cli/src/skills/self-eval.ts::recordSelfEval` already writes typed `self_eval_recorded` events with outcomes `pass\|fail\|retry-pending\|parked` and a `countAttempts` reader; trace writers explicitly tolerate kit-local event names | Escalation is a **small extension of an existing module**, not new machinery |
| A corpus exporter command exists to extend | `LocalIntelligenceTraceRecordV1` + `sandboxEnvelopeToTraceRecord` + `formatTraceRecordLine` exist (`cli/src/runtime/native-intelligence/source-record-export.ts`) but are **internal-only — no CLI command** | The command is real new work; the record machinery is not |
| Helper receipts encode accept/reject pairs | `buildApplyReceipt` (`workspace-helper-apply.js:365-377`) persists receipts **only for applied proposals** (`{type, affectedField, rationale, confidence, appliedAt, ranAt, reviewedBy, sessionId}` under source-record key `helper:apply:receipts`); skipped proposals are returned in the apply response but **not persisted** | The single highest-value small change in the plan: persist the skip half (Phase 1, item 1.2) |
| — | A "swarm script which runs the worker export" **does not exist** in `scripts/` at 0.14.1 (searched exhaustively); the real surfaces are `scripts/export-worker-kit.mjs --qa` and the `agent-swarm-v1` orchestration adapter | Plan does not build on a phantom; §8 covers the streamlining honestly |
| — | `cli/package.json` pins `@growthub/api-contract@1.3.0-alpha.2` while the package is `1.4.0` — a live pin drift on main | Phase 0 precondition before any contract change |
| — | A toolIntent policy module already exists (`native-intelligence-tool-intent-policy` vitest suite) | K3 tiers parameterize an existing policy, not a new one |

## 2. Binding Constraints (apply to every phase)

1. **Zero UI additions.** No new icons, lanes, widgets, panels, or routes. Every surfaced behavior flows through surfaces that already exist: helper query/apply/receipts JSON, CLI JSON envelopes, `trace.jsonl`/`project.md`, the existing discovery text menus. The workspace app's only touched file is a data-layer module (`workspace-helper-apply.js`), and only to persist what its route already computes.
2. **Governance intact.** PATCH allowlist (`dashboards`, `widgetTypes`, `canvas`, `dataModel`) untouched. Propose/apply boundary untouched. Trace and policy remain append-only, written through the CLI. Credentials never enter records — the existing sanitize layer (`workspace-helper-sanitize`) is reused, and the corpus writer digests large payloads.
3. **Additive-only contracts.** New optional fields and new event type strings only; `SKILL_MANIFEST_VERSION` and `PIPELINE_TRACE_VERSION` sentinels stay `1`; consumers ignore unknown fields per the existing NDJSON rule.
4. **No stubs, no fallbacks, no scaffolds.** A phase ships only when its real end-to-end smoke test passes against real surfaces (real kit fork, real workspace app, real sandbox run) — fixture data may seed inputs, but every code path executed is the shipping path. Anything that cannot ship complete is cut from the phase, not stubbed.
5. **No timelines.** Phases are ordered by data dependency only; each is independently shippable and leaves main releasable.
6. **Version discipline per `AGENTS.md`**: bumps only when source ships to npm; `cli` and `create-growthub-local` move together with matching pin; semver always read from the branch.

## 3. Phase 0 — Preconditions (no feature code)

| # | Item | Files | Done when |
| --- | --- | --- | --- |
| 0.1 | Resolve the live pin drift: align `cli/package.json` dependency on `@growthub/api-contract` with the actual `1.4.0` package before any contract addition lands on top of it | `cli/package.json` | `node scripts/check-version-sync.mjs` and `node scripts/check-cli-package.mjs` pass; `cd cli && npx tsc --noEmit` clean |
| 0.2 | Confirm the referenced "swarm runs worker export" script: if it exists outside the repo, it is brought in-tree or §8 is amended; if not, §8's single-script item is the agreed path | maintainer decision | Recorded in PR discussion before Phase 1 merges |

## 4. Phase 1 — K1: Decision Corpus (read-only exporter + the missing skip receipts)

The flywheel's substrate. Everything here reads artifacts that already persist, plus one data-layer write extension.

**1.1 Corpus module** — `cli/src/runtime/decision-corpus/` (new): `record.ts` defining `GovernedDecisionRecordV1` (`{v:1, at, surface: "helper"|"selfEval"|"pipeline"|"swarm"|"triggerEval", context:{forkId?, runId?, kitId?, parentRef?}, input:{intent?, digest?}, decision, outcome, diagnosis?, confidence?, usage:{tokens?, tools?, durationMs?}, reward?}`) and `serialize.ts` reusing the `formatTraceRecordLine` newline-JSONL convention. The `reward` passthrough exists because the swarm runtime already computes one — the corpus must not discard the strongest label it has. Per the CMS-SDK philosophy ("freeze shipped internals"), this lives in CLI runtime now and is promoted to `api-contract` only in Phase 7, after the shape has survived real use.

**1.2 Persist skipped-proposal receipts** — `workspace-helper-apply.js`: where the apply route already computes `{applied[], skipped[]}`, also build receipts for skipped proposals with additive fields `outcome: "skipped"` and `skipReason`. Applied receipts gain `outcome: "applied"`. Absent `outcome` on historical receipts means applied — readers treat it as the default, so no migration. Same source-record key (`helper:apply:receipts`), same `/api/workspace/helper/receipts` route, zero route/UI changes — the field simply appears in JSON the surfaces already render. This single edit completes the accept/reject preference pair.

**1.3 Normalizers, one per emitter** — `cli/src/runtime/decision-corpus/readers/`: `helper-receipts.ts` (reads `growthub.source-records.json` key `helper:apply:receipts`; maps `confidence`, `rationale`, `outcome`), `self-eval.ts` (reads `.growthub-fork/trace.jsonl`, filters `self_eval_recorded` + Phase-2's `self_eval_escalated`), `pipeline.ts` (filters `pipeline_stage_*` per `PIPELINE_TRACE_VERSION` union via the existing `isPipelineTraceEvent` guard), `swarm.ts` (reads `sandbox:*` source records; maps per-task `{tokens, tools, durationMs, status}` and the run-level `reward` block). Each reader tolerates unknown event types by skipping, per the existing consumer rule.

**1.4 Command** — `cli/src/commands/trace.ts` (new): `growthub trace export-corpus --out <file.jsonl> [--fork <path>] [--workspace <path>] [--json]`, registered in `cli/src/index.ts` alongside existing commands; JSON envelope output consistent with `workspace status --json` conventions. Secrets discipline: payloads above a size threshold are digested (SHA-256, reusing `hashSystemPrompt`'s pattern); the sanitize pass runs over every record before write.

**1.5 Tests** — `cli/src/__tests__/decision-corpus-export.test.ts`: round-trip fixtures produced by the *actual writers* (`buildApplyReceipt`, `recordSelfEval`, the pipeline trace writer, a captured real swarm source record) → readers → records → parse. Deterministic, no live model needed, matching the native-intelligence suite conventions.

**Smoke test (end-to-end, all real paths):**

```bash
# real fork + real workspace, no mocks
growthub kit download growthub-custom-workspace-starter-v1 && growthub starter init --out /tmp/ws
cd /tmp/ws/apps/workspace && npm install && npm run dev &        # real app
growthub workspace helper query --intent build_dashboard --prompt "revenue overview" --json > p.json
# apply exactly one proposal; leave one to be skipped
growthub workspace helper apply --proposal-file p.json --yes
node -e '…recordSelfEval(real fork, attempt 1, fail)…'           # real self-eval write via CLI module
growthub trace export-corpus --out /tmp/corpus.jsonl --fork /tmp/ws --workspace /tmp/ws
# assertions: ≥1 applied + ≥1 skipped record (the pair), ≥1 selfEval record,
# every line parses as GovernedDecisionRecordV1, zero credential patterns (grep audit)
```

**User journey fit:** invisible until asked for — the operator's only new touchpoint is one CLI command, and its output is the input to the already-documented external fine-tune path (`NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` §31.2). Receipts gain an honest `outcome` field in a JSON surface they already read. Nothing changes in the chat/helper experience.

## 5. Phase 2 — K1: Self-Eval Escalation

**2.1 Emission** — `cli/src/skills/self-eval.ts`: when `recordSelfEval` records a non-`pass` outcome at `attempt === maxRetries`, additionally append a `self_eval_escalated` event `{forkId, kitId, type, summary, detail:{skill, failingCriteria[], attempts, diagnosis, remediation}, timestamp}` via the same `appendKitForkTraceEvent`, and one escalation block to `project.md` via the existing `appendSessionLogEntry`. Guard: before emitting, scan the trace (the `countAttempts` pattern) for an existing escalation for this skill since the last `pass` — at most one escalation per exhaustion, mirroring the production harness's recursion guard.

**2.2 Satisfiability rule** — the `remediation` string is constructed from locally-actionable options only: the writer reads `policy.json.remoteSyncMode` and never instructs a hosted-authority action for a local-only fork (the AWaC port of the probed Stop hook's "no remote → don't demand a push" bail).

**2.3 Template + QA parity** — the starter kit's `templates/self-eval.md` gains the escalation protocol section (what the agent writes, where it stops); `scripts/export-worker-kit.mjs --qa` gains one check (escalation section present in `templates/self-eval.md`); all 16 bundled kits' templates are updated in the same change so `--qa` stays green across the board — partial template rollout is not acceptable under constraint 4.

**2.4 Tests** — extend the existing deterministic self-eval suite: exhaustion emits exactly once; pass resets the guard; remediation respects policy; corpus reader (Phase 1) maps `diagnosis` through.

**Smoke test:** real fork, drive the documented agent loop to `maxRetries` with a deliberately failing criterion; assert single `self_eval_escalated` in `trace.jsonl`, escalation note in `project.md`, diagnosis-labeled record in `trace export-corpus` output, and `export-worker-kit.mjs --qa` green for all 16 kits.

**User journey fit:** the operator's existing mental model is "the agent retries up to the ceiling, then…" — and today the "then" is silence. After this phase the "then" is a readable diagnosis in `project.md` (the file the journey already tells them to read first) and a structured event in the trace they already inspect. No new surface; an existing dead end becomes a handoff.

## 6. Phase 3 — K2: Trigger Grammar + Routing Eval

**3.1 Contract fields** — `packages/api-contract/src/skills.ts`, additive siblings to the existing `triggers?: string[]`: `skipTriggers?: string[]` and `precheck?: { command: string; skipOnZeroExit: boolean; description: string }`. Sentinel stays `1`. `@growthub/api-contract` bumps `1.4.0 → 1.5.0`; cli pin follows (Phase 0 made this clean).

**3.2 Validation** — `cli/src/commands/skills.ts::runValidate` gains checks in the existing style: `skipTriggers` entries non-empty/bounded, `precheck.command` non-empty, `precheck.description` required. Same JSON/table output paths.

**3.3 Real content first** — the new fields are authored for the 10 repo skills in `.claude/skills/` (the marketing-operator's 29-row dispatch table and the video-generation skill's "wrong binding" rule become `skipTriggers`/`precheck` entries with real semantics). Shipping the fields with no shipped content would be scaffolding — prohibited.

**3.4 Routing eval** — `growthub skills eval-triggers --fixtures <file> [--json]` in `cli/src/commands/skills.ts`: replays prompt→expected-skill fixtures against the catalog using the same lexical-scoring approach the recommender already uses (reuse, not reinvention), honoring `skipTriggers` as hard negatives and `precheck` as deterministic short-circuits. Reports accuracy per skill; writes `surface: "triggerEval"` records through the Phase-1 corpus writer. Seed fixture file derived from the marketing-operator dispatch table — 29 real rows, not synthetic prompts — committed under `cli/src/__tests__/fixtures/`.

**3.5 Tests** — vitest suite for the scorer (deterministic); validate-extension cases; fixture-driven accuracy floor asserted in CI (a measured baseline, set from the first real run, not an aspiration).

**Smoke test:** `growthub skills validate` green repo-wide; `eval-triggers` against the seed fixtures emits an accuracy report and corpus records; `export-worker-kit.mjs --qa` green (kits without the new fields remain valid — optional means optional).

**User journey fit:** users never see this directly — they feel it as the operator skill catalog routing correctly on the first try. The eval gives maintainers a number that was previously folklore.

## 7. Phase 4 — K2: Capability Usage Guidance

**4.1 Contract fields** — `packages/api-contract/src/capabilities.ts`: optional `usageGuidance?: { whenToUse?: string; whenNotToUse?: string; orchestrationRules?: string[]; negativeExamples?: string[] }` on `CapabilityNode`; `manifests.ts`: optional `instructions?: string` on the manifest envelope (the MCP connect-time channel, ported). Same release as Phase 3's bump if shipped together.

**4.2 Projection passthrough** — `cli/src/runtime/cms-capability-registry/`: `toCapabilityNode` and the manifest projection preserve `usageGuidance`/`instructions` when present. Because `CapabilityRegistrySource` already includes `"local-extension"`, guidance ships **now** via local manifests without waiting for the hosted CMS — the first real content is the video-generation node's `refs[].dataUrl` rule and SPEND-first-style ordering for multi-step families, encoded as `negativeExamples`/`orchestrationRules`.

**4.3 Real consumption** — the native-intelligence planner's contract-summary assembly (`planner.ts`) includes `usageGuidance` for candidate nodes; the summarizer surfaces `whenNotToUse` cautions in its readiness output. Both are existing prompt-assembly paths gaining one input — no new reasoning machinery. Dormant fields with no consumer would violate constraint 4; the planner consumption ships in the same phase.

**4.4 Tests** — extend the deterministic planner/summarizer suites: guidance present in assembled context; negative-example produces a caution in summarizer output; registry projection round-trips the fields; absent fields change nothing.

**Smoke test:** full flow-suite run (discovery → "Run native-intelligence with your prompt") over a video intent against a local-extension manifest carrying the dataUrl rule; the plan/summary visibly reflects the guidance; `growthub pipeline validate` behavior unchanged (guidance advises, contracts still validate — the deterministic rails stay deterministic).

**User journey fit:** the user's existing experience — ask, get a plan, get a readiness summary — simply gets *more correct*, citing why a binding shape is wrong before execution instead of after. No new surface, no new words to learn.

## 8. Phase 5 — Export QA Consolidation (the streamlining item, honestly scoped)

The referenced swarm-runs-export script does not exist at 0.14.1 (§1). The production-standard version of the intent — one entry point that proves every kit's export parity — is:

**5.1** `scripts/export-worker-kit.mjs`: already supports `--qa`; add `--all` to iterate every kit under `cli/assets/worker-kits/` with a single summary table and non-zero exit on any failure (today this is a shell loop in operator hands — the loop moves into the script, nothing else changes).

**5.2** CI: the `validate` job invokes `node scripts/export-worker-kit.mjs --qa --all`, making six-primitive parity (including Phase 2's escalation-template check) a merge gate instead of a convention.

**5.3** Optional, behind maintainer sign-off (0.2): a sandbox-environment row in the starter kit whose orchestration graph runs `--qa --all` as swarm tasks through the **existing** `agent-swarm-v1` adapter and `sandbox-run` route — exercising the swarm lane on a real, useful workload and producing reward-labeled corpus records as a side effect. This is composition of shipped parts, not new machinery; if sign-off doesn't come, 5.1+5.2 stand alone and complete.

**Smoke test:** `--qa --all` green across all 16 kits locally and in CI; (if 5.3) one real swarm run whose source record appears in `trace export-corpus` output with reward attached.

## 9. Phase 6 — K3: Origin Markers, Monotonic Policy, Tiered ToolIntents

**6.1 Origin markers** — import paths (`starter import-repo`, `starter import-skill`, `kit fork register`) record `origin: "external"` entries in `fork.json` for imported agent-facing files (`SKILL.md`, `AGENTS.md`, nested skills). Additive field; absent means first-party.

**6.2 Monotonic policy check** — `growthub kit validate` and fork-register reject imported content that widens policy: a deterministic comparator over `policy.json`-shaped content in the imported tree (e.g. `autoApprove: true`, allowlist extensions) with a typed refusal reason — the same structured-denial pattern as the probed proxy's `repository not authorized`. Tests: fixture kit with a widening policy fails with the typed reason; clean kit passes.

**6.3 Trust tier on toolIntents** — `packages/api-contract/src/adapters.ts`: optional `trustTier?: "a" | "b"` on the local-intelligence adapter config; the existing toolIntent policy module parameterizes its allowlist by tier (tier `a` = today's narrow set, tier `b` = the documented wider set). `policy.json` gains additive `taints?: string[]`; the CLI appends taints on defined triggers (escalation streak from Phase 2 events, `origin: external` reads in a run) and the policy module only ever *narrows* on taint — tier restoration is exclusively the existing explicit human surface (`growthub kit fork policy --set`). The agent never widens its own tier — the supervisor-plane invariant from the probe, enforced in code.

**6.4 Tests** — extend `native-intelligence-tool-intent-policy` suite: per-tier allow/deny matrices; taint narrows; restore path is policy-set only; monotonic comparator cases.

**Smoke test:** real "Run sandboxed local model task" (discovery lane, real local model) at tier `a` proposing an out-of-tier toolIntent → typed rejection in the governed envelope; taint appended after a forced escalation streak; `kit fork policy --set` restores; import smoke from 6.2.

**User journey fit:** the journey's "Customize safely / Sync safely" steps gain teeth the user can see only in the places they already look — `policy.json`, validate output, and the run envelope — phrased as typed reasons, not silent failures.

## 10. Phase 7 — Freeze and Release

Only after Phases 1–6 have shipped and survived real use: promote `GovernedDecisionRecordV1` into `packages/api-contract/src/decision-records.ts` (the CMS-SDK freeze step), export from `index.ts`, bump `api-contract`, bump `cli` + `create-growthub-local` together with matching pin, update `docs/ARTIFACT_VERSIONS.md`, extend `docs/SKILLS_MCP_DISCOVERY.md` and the kit-shipped `governed-workspace-primitives.md` with the corpus and escalation semantics, run `node scripts/release-check.mjs`, require `smoke`/`validate`/`verify` green, then `release.yml`.

## 11. Dependency Graph (no dates, order is data-forced)

```text
Phase 0 (pin hygiene, script decision)
   └─► Phase 1  corpus + skip receipts          ── records exist
          ├─► Phase 2  escalation                ── labels records
          ├─► Phase 3  trigger grammar + eval    ── writes triggerEval records
          │      └─► Phase 4  usageGuidance      ── same contract release train
          ├─► Phase 5  export QA --all (+opt swarm lane)
          └─► Phase 6  origin/monotonic/tiers    ── consumes Phase-2 events as taints
                 └─► Phase 7  freeze + release
```

## 12. What Is Deliberately Not Built

No new discovery lane, icon, widget type, dashboard, or chat affordance. No cost-in-currency calculation on swarm telemetry (token/tool counts stay truthful-or-null; pricing is out of scope and out of contract). No in-CLI training (corpus out, weights in via `localModel` — unchanged). No `kit.json` lifecycle-hook arrays (still zero second consumers; the evaluator contract shipped inside Phase 2 instead). No speculative hosted-CMS `usageGuidance` ingestion — local-extension first, hosted when the hosted side ships it.
