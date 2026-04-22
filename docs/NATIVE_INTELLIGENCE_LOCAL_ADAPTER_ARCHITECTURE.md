# Local Native-Intelligence Architecture
This document is the detailed technical reference for local native-intelligence in `growthub-local`.
It describes architecture boundaries, control flow, adapter behavior, CLI surfaces, validation paths, and release implications.
It is intentionally long-form so super-admin operators can use one document for setup, operations, and extension planning.
This document is updated for the current feature-branch release candidate.

## 1. System Intent
The native-intelligence layer is an assistive layer for workflow reasoning.
It improves quality of planning, normalization, recommendation, and summarization.
It does not replace workflow execution.
It does not remove deterministic safety rails.
It does not require hosted credentials for local adapter mode.
It is designed for human-first prompts and agent-assisted operation.
It is designed to support many local custom models, not one hardcoded model.

### 1.1 Primary goals
- Enable local prompt-based intelligence directly from CLI discovery.
- Persist active local model preference and reuse it across runs.
- Run intelligence flow chain against real runtime contracts/workflows.
- Keep interaction stable with visible progress for long-running local model calls.
- Preserve deterministic fallback when model backend is unavailable.

### 1.2 Non-goals
- Performing model training inside the CLI runtime.
- Coupling this feature to a single local model tag forever.
- Requiring users to run synthetic demo data only.
- Turning intelligence into a hard dependency for workflow execution.

## 2. Layered Mental Model
Use the stack below when debugging or extending:
- Layer A: Workflow runtime substrate.
- Layer B: Native-intelligence reasoning layer.
- Layer C: CLI discovery and command interfaces.
Layer A executes.
Layer B advises and normalizes.
Layer C orchestrates user interaction.
Failures in Layer B should degrade safely, not collapse Layer A operations.

## 3. Runtime Topology
Core intelligence modules:
- `cli/src/runtime/native-intelligence/planner.ts`
- `cli/src/runtime/native-intelligence/normalizer.ts`
- `cli/src/runtime/native-intelligence/recommender.ts`
- `cli/src/runtime/native-intelligence/summarizer.ts`
- `cli/src/runtime/native-intelligence/provider.ts`
- `cli/src/runtime/native-intelligence/index.ts`
- `cli/src/runtime/native-intelligence/contract.ts`
Context providers:
- `cli/src/runtime/cms-node-contracts/index.ts`
- `cli/src/runtime/cms-node-contracts/types.ts`
- `cli/src/runtime/cms-capability-registry/index.ts`
- `cli/src/auth/hosted-client.ts`
CLI integration files:
- `cli/src/index.ts`
- `cli/src/commands/pipeline.ts`
- `cli/src/commands/workflow.ts`

## 4. Discovery Surface
The discovery hub includes a dedicated `Local Intelligence` lane.
The lane is interactive and menu-loop based.
Current options:
- Setup helper.
- Manage local custom models.
- Prompt local model (chat flow).
- Run native-intelligence with your prompt.
- Back to main menu.
The loop must return users to local intelligence after each action unless users explicitly exit.

## 5. Capability Summary
The intelligence stack exposes four capabilities:
1) Planner: map intent to available node path.
2) Normalizer: coerce/validate raw bindings.
3) Recommender: choose reuse/template/new path.
4) Summarizer: produce readiness/risk guidance.
These capabilities are available via flow suite and command integrations.

## 6. Provider Architecture
The provider encapsulates backend transport and candidate resolution.
It supports local and hosted backend types at contract level.
Current branch focus is local mode.
Local mode uses OpenAI-compatible chat-completions payload shape.
The provider returns normalized text/json outputs with latency metadata.

### 6.1 Request contract shape
Request fields include:
- system prompt.
- user prompt.
- response format (`text` or `json`).
- optional max tokens and temperature overrides.
The backend body maps to adapter-compatible chat-completions schema.

### 6.2 Response handling
The provider extracts completion text from choice payloads.
Errors are wrapped in backend-aware error structures.
Unsuccessful responses generate actionable error text.

## 7. Adapter Model
Current validated adapter path:
- Ollama-compatible OpenAI endpoint.
Default base:
- `http://127.0.0.1:11434/v1`
Default endpoint:
- `${baseUrl}/chat/completions`
Recommended validation model:
- `gemma3:4b`
The architecture is adapter-ready and not limited to one model id.

## 8. Canonical vs Concrete Model IDs
The config stores:
- `modelId` canonical family id.
- `localModel` concrete adapter model id.
Canonical values remain bounded (`gemma3`, `gemma3n`, `codegemma`).
Concrete values are open and can include arbitrary local adapter tags.
This enables scaling to many model variants without enum churn.

## 9. Candidate Resolution Logic
Model candidate order:
1) `localModel` from config.
2) `NATIVE_INTELLIGENCE_LOCAL_MODEL` env.
3) `OLLAMA_MODEL` env.
4) canonical `modelId`.
5) practical local fallback where applicable.
Endpoint candidate order:
1) configured endpoint.
2) local fallback endpoint when legacy localhost values are detected.
This logic improves resiliency during migration and local setup drift.

## 10. Cold Start Strategy
Local LLM runtimes can have high first-turn latency.
The prompt path includes retry behavior for aborted requests.
Retry is performed with extended timeout.
This avoids false failure signals during model warm-up.

## 11. Setup Helper
Setup helper reports:
- OS label.
- local runtime CLI presence.
- endpoint reachability.
- configured model.
- model availability.
- discovered model count.
It also prints setup guidance by OS for faster operator bootstrap.

## 12. Model Management
Model management supports:
- live discovered model list.
- active favorite marker.
- custom model id entry.
- config apply with spinner.
- backend health check after apply.
If health fails, configuration still persists and user remains in local intelligence loop.
This avoids dead-end UX.

## 13. Favorite Model Behavior
Favorite model is persisted in `localModel`.
It is prioritized in model selection.
It is used by prompt flow and flow suite by default.
The model picker indicates favorite with star label.
The behavior is explicit and user-driven.

## 14. Prompt Flow Architecture
Prompt flow is a human-first interactive chat path.
It supports open-ended input and multiple turns.
It displays:
- active model id.
- thread id.
- storage path.
- response timing.
It supports `/back` to return to local intelligence menu.
It is designed for real usage, not synthetic test-only prompts.

## 15. Thread Persistence
Thread state is persisted in local files.
Persistence includes:
- active thread pointer file.
- thread transcript file.
- message role/content list.
This enables continuity across turns and sessions.
The design is intentionally local-first and transparent.

## 16. Context Rendering
Prompt flow renders bounded history context.
Only recent messages are included.
This balances latency, token usage, and continuity.
The system prompt keeps response style constrained and useful.

## 17. Flow Suite Entry
`Run native-intelligence with your prompt` executes full intelligence chain.
It starts from real prompt input.
It loads runtime contract context and workflow context.
It collects bindings from selected contract input schema interactively.
It runs planner, normalizer, recommender, and summarizer in sequence.

## 18. Planner Details
Planner objective:
- suggest viable workflow path from intent.
Planner inputs:
- intent text.
- contract summaries.
- saved workflow metadata.
Planner constraints:
- output type requirements.
- avoid slugs.
- preferred families.
- max node count.
Planner output:
- ordered steps with rationale.

## 19. Normalizer Details
Normalizer objective:
- make raw bindings contract-safe.
Behavior includes:
- placeholder detection.
- string-to-number coercion.
- string-to-bool coercion.
- JSON parse attempts for arrays/objects.
- default, clear, and keep actions.
Normalizer output includes structured action notes to explain transformations.

## 20. Recommender Details
Recommender objective:
- choose reuse strategy safely.
Strategies:
- reuse existing.
- template-first.
- synthesize new.
Scoring uses:
- lexical similarity.
- node slug overlap.
- explicit slug mention boost.
- workflow labels (`canonical`, `experimental`, `archived`).
Archived paths are penalized.

## 21. Summarizer Details
Summarizer objective:
- communicate readiness and risk clearly.
Phases:
- pre-save.
- pre-execution.
- post-execution.
- recommendation.
Output should include missing required field guidance with both label and key.

## 22. Runtime Data Sources
Flow suite now uses real runtime data:
- contract data from capability introspection.
- workflow data from hosted listing records.
- interactive binding input collection from contract schema.
This replaces hardcoded sample fixtures in user-facing flow runs.

## 23. Deterministic Fallback
Fallback policy:
1) attempt model-backed path.
2) if backend unavailable, use deterministic path.
3) preserve navigation and clear operator feedback.
Fallback prevents user blockage during local environment issues.

## 24. Error Handling
Error categories:
- transport: unreachable endpoint, timeout, DNS/local issues.
- model: not found, unavailable, tag mismatch.
- schema: malformed response payload.
UX policy:
- show concise actionable messages.
- never trap users in dead state.
- maintain menu loop.

## 25. Observability
Current UX observability includes:
- spinners for apply and flow run.
- response time output.
- model id in response headers.
- status notes on backend health.
Future observability can include structured logs and optional debug traces.

## 26. Security Notes
Local prompt payloads are sent to local adapter endpoint.
Thread transcripts are stored locally.
Do not include secrets in prompts unless necessary.
Protect local machine and user home data.
Clear thread files if needed for compliance-sensitive contexts.

## 27. Config Sources And Precedence
Sources:
- persisted config file.
- environment variables.
- interactive model selection writes.
Key env vars:
- `OLLAMA_BASE_URL`
- `NATIVE_INTELLIGENCE_LOCAL_MODEL`
- `OLLAMA_MODEL`
Persisted fields:
- `backendType`
- `modelId`
- `endpoint`
- `localModel`

## 28. Active Branch Validation Observations
Interactive evidence confirms:
- discovery lane visible.
- local intelligence prompt flow active.
- local model replies returned for `gemma3:4b`.
- response timing displayed.
- thread id and save path displayed.
This validates human-first prompt path in active CLI session.

## 29. Local Custom Models
Support model is open-ended.
Users can select any detected model.
Users can enter arbitrary custom model ids.
Config persists selected custom model without requiring enum edits.
This is foundational for future adapter expansion.

## 30. Training Workflow
CLI does not train models.
Training or fine-tuning occurs in external model tooling.
After training:
1) load/export model into local adapter runtime.
2) verify model appears in adapter model list.
3) set as active model in Local Intelligence menu.
4) validate via prompt flow and flow suite.

## 31. Adapter Expansion Strategy
Future adapters should implement equivalent backend interface:
- request completion.
- return normalized completion result.
- report backend availability health.
Keep planner/normalizer/recommender/summarizer contract stable.
Transport and mapping should be adapter-specific.

## 32. Coming Soon Areas
Planned expansions:
- additional local adapter providers.
- richer health diagnostics.
- model metadata routing hints.
- per-project model profiles.
- adapter failover preferences.
- structured output confidence metadata.

## 33. CLI Extensions Added
User-visible additions:
- `Local Intelligence` lane in discovery.
- setup helper.
- model manager with favorite semantics.
- prompt local model chat flow.
- full intelligence suite with runtime data.
Command integrations:
- workflow summary uses native provider.
- pipeline summary uses native provider.

## 34. UX Invariants
Required behavior invariants:
- users remain in local intelligence loop after actions.
- apply action shows progress spinner.
- prompt flow displays model + timing.
- `/back` exits prompt flow to local intelligence.
- flow suite uses contract-driven binding collection.
- no hardcoded node sample dependence in runtime flow path.

## 35. Validation Matrix
Matrix rows:
- discovery lane access.
- setup helper status.
- model apply + health result.
- prompt response receipt.
- thread persistence.
- flow suite run.
- fallback behavior.
- regression tests.
- typecheck.
Each row should be validated before merge.

## 36. Automated Validation Commands
Native-intelligence tests:
`npx vitest run cli/src/__tests__/native-intelligence-*.test.ts`
Typecheck:
`cd cli && npx tsc --noEmit`
These must pass on feature branch before PR merge request.

## 37. Manual Interactive Validation
Manual sequence:
1. launch discovery.
2. enter Local Intelligence.
3. run setup helper.
4. choose active model and apply.
5. run prompt flow prompt turn.
6. run second prompt turn.
7. confirm response model/timing.
8. run full flow suite with real prompt.
9. confirm return-to-submenu behavior.

## 38. Common Failure Playbook
No models detected:
- confirm runtime is started.
- confirm `OLLAMA_BASE_URL`.
- query `/v1/models` directly.
Model not found:
- verify exact model tag.
- use custom model id entry.
- reapply config.
Timeout on first prompt:
- wait for cold start.
- retry.
- reduce model size if needed.

## 39. Performance Guidance
Latency drivers:
- model size.
- hardware.
- cold start.
- context size.
For faster iteration:
- prefer concise prompts.
- keep context window bounded.
- use smaller validation model for quick loop.

## 40. Data Contract Overview
Config contract fields:
- `modelId`
- `backendType`
- `endpoint`
- `localModel`
- optional defaults
Thread contract:
- `id`
- `messages`
- `filePath`
Message contract:
- `role`
- `content`

## 41. Release Notes Expectations
If source changes are release-scoped:
- bump `cli/package.json`.
- bump `packages/create-growthub-local/package.json`.
- align `@growthub/cli` dep pin in create package.
Do not ship mismatched package versions.

## 42. CI Expectations
Target CI state:
- smoke green.
- validate green.
- verify green.
No merge until required checks are green.
If checks fail, patch branch and rerun.

## 43. Merge And Publish Flow
Merge preconditions:
- PR approved.
- required checks green.
- docs aligned with shipped behavior.
After merge:
- release workflow publishes updated npm versions.
This is the canonical package publication path.

## 44. OSS Merge Sync Note
For package version propagation after merge to main:
- rely on repository release/merge automation.
- verify published npm versions reflect merged package numbers.
Do not manually claim release completion before workflow success confirmation.

## 45. Operator Checklist
- local adapter runtime up.
- model loaded.
- discovery opens.
- local intelligence menu available.
- active model applied.
- prompt flow returns model response.
- thread persistence observed.
- flow suite executes.
- tests pass.
- typecheck passes.
- CI checks green.

## 46. Super-Admin Quickstart
Run:
```bash
bash scripts/demo-cli.sh cli discover
```
Then run local intelligence actions in order:
1) Setup helper.
2) Manage local custom models.
3) Prompt local model.
4) Run native-intelligence with prompt.

## 47. CLI Extension Outline
Discovery surface additions:
- Local Intelligence lane.
Local intelligence lane additions:
- setup helper.
- model manager.
- prompt flow.
- flow suite.
Command-layer improvements:
- workflow and pipeline summary paths now route through native provider.

## 48. Future CLI Extension Candidates
Possible future command surface:
- `growthub intelligence`
- `growthub intelligence status`
- `growthub intelligence model list`
- `growthub intelligence model set`
- `growthub intelligence prompt`
- `growthub intelligence flow run`
These are optional future additions; discovery remains canonical now.

## 49. Quality Gates For Outputs
Good output:
- contract-aligned.
- direct.
- actionable.
- explicit about missing required values.
Poor output:
- generic with no contract context.
- contradictory to available capabilities.
- missing required field caveats.

## 50. Test Coverage Summary
Regression suites cover:
- planner logic and constraints.
- normalizer coercion and placeholder handling.
- recommender strategy scoring.
- summarizer readiness and missing field guidance.
These tests are deterministic and not dependent on live model backend.

## 51. Interactive Evidence Schema
When collecting E2E evidence for PR:
- include prompt text used.
- include model id shown.
- include response timing.
- include thread id/path if visible.
- include flow suite completion note.
This helps reviewers verify true interactive path usage.

## 52. Final Architecture Summary
Local native-intelligence is now a first-class CLI discovery lane.
It supports real prompt chat, local custom model selection, runtime-informed flow reasoning, and resilient fallback.
It is ready for branch-level release hardening and future multi-adapter expansion.
For machine setup and quick validation commands, use [Gemma Setup and Validation](./native-intelligence-gemma-setup.md).

