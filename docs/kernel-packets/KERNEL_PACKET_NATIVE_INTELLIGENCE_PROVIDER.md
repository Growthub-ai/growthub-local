# Native Intelligence Provider Kernel Packet

Version: `v1`

This packet freezes the reusable primitive for adding a new native intelligence backend (Claude, GPT, local llama, custom fine-tuned model) while preserving the planner/normalizer/recommender/summarizer surface.

Use it when you are:

- adding a new model backend beyond Gemma 3 / Gemma 3n / CodeGemma
- adding a new inference path (local Ollama, hosted Anthropic, hosted OpenAI, custom HTTP endpoint)
- swapping provider implementations without changing consumers
- extending the `NativeIntelligenceModelId` union
- adding specialized providers for specific capabilities

## Why This Packet Exists

Native intelligence (PR #64) shipped with four stable surfaces: planner, normalizer, recommender, summarizer. All four sit above the CMS contract pipeline and below user intent. The backend adapter (`provider.ts`) is pure boundary — it translates `ModelCompletionInput` into HTTP calls and returns `ModelCompletionResult`.

This separation means new model backends slot in without touching the four shaping surfaces. The consumers don't know or care whether the backend is local Gemma, hosted GPT, or a custom fine-tuned model. They know the `NativeIntelligenceProvider` interface.

This packet captures the stable path for adding a new provider without breaking that interface.

## Kernel Invariants

Every native intelligence provider must satisfy these invariants before merge:

- new provider implements `NativeIntelligenceBackend.complete()` contract
- provider returns `ModelCompletionResult` with `text`, `modelId`, `latencyMs`
- provider supports `responseFormat: "json" | "text"` or documents fallback behavior
- provider respects `timeoutMs` and `temperature`/`maxTokens` defaults from `NativeIntelligenceConfig`
- provider surfaces structured errors via `NativeIntelligenceBackendError` with `status` field
- `checkBackendHealth()` variant exists for the new backend
- planner/normalizer/recommender/summarizer consumers remain unchanged
- deterministic fallbacks (`buildDeterministicPlan`, `buildDeterministicNormalization`, etc.) still work when backend is unavailable
- secure auth for provider credentials uses Agent Harness Auth Primitive pattern (if credentials required)
- focused vitest coverage passes
- repo gates pass (`smoke`, `validate`, `verify`)

## Surface Area Contract

Use this contract shape for every provider:

1. **Contract primitive**
   - extend `NativeIntelligenceModelId` union in `cli/src/runtime/native-intelligence/contract.ts`
   - add new provider-specific config fields to `NativeIntelligenceConfig` (optional, backward-compatible)
2. **Backend primitive**
   - implement `NativeIntelligenceBackend` interface in `cli/src/runtime/native-intelligence/provider.ts` (or sibling provider file)
   - one function: `complete(input: ModelCompletionInput) -> Promise<ModelCompletionResult>`
   - surface errors via `NativeIntelligenceBackendError`
3. **Factory primitive**
   - `createNativeIntelligenceBackend(config)` routes to the correct provider based on `config.modelId` or `config.backendType`
   - existing `createStubBackend()` remains as offline fallback
4. **Health primitive**
   - `checkBackendHealth(config)` variant for the new provider
   - returns `{ available, latencyMs, error? }`
5. **Auth primitive**
   - if provider requires credentials: use harness auth store pattern (`~/.paperclip/harness-auth/native-intelligence-<provider>.json`)
   - never print raw secrets
   - never store secrets in `config.json`
6. **Config UX**
   - `writeIntelligenceConfig()` / `readIntelligenceConfig()` handle new fields
   - `growthub intelligence configure` flow (if added) follows the same back-navigation rules as harness configure

## Packet Inputs

- provider id (for example `claude-3-5-sonnet`, `gpt-4o-mini`, `llama-3-8b-local`)
- provider module under `cli/src/runtime/native-intelligence/providers/<provider>.ts` or sibling file
- contract updates under `cli/src/runtime/native-intelligence/contract.ts`
- factory wiring in `cli/src/runtime/native-intelligence/provider.ts`
- secure auth storage via harness auth primitive
- focused tests under `cli/src/__tests__/native-intelligence-*.test.ts`

## Packet Procedure

### P1. Contract Extension

- add provider id to `NativeIntelligenceModelId` union
- add optional provider-specific config fields to `NativeIntelligenceConfig`
- update `validateModelId()` in `index.ts` to accept new id

### P2. Backend Implementation

- implement `NativeIntelligenceBackend` interface
- follow the fetch + timeout + AbortController pattern from existing Gemma backend
- surface HTTP errors via `NativeIntelligenceBackendError(status, message)`
- respect `responseFormat` (map to provider-specific JSON mode if supported)

### P3. Factory Wiring

- extend `createNativeIntelligenceBackend()` to route based on provider id or backend type
- preserve existing Gemma routing as default
- endpoint/model candidate resolution follows existing pattern

### P4. Auth Wiring (if credentials required)

- use `setHarnessCredential()` / `getHarnessCredential()` with harness id `native-intelligence-<provider>`
- never persist secret in config.json
- add masking in any config display

### P5. Health Check

- add provider-specific `checkBackendHealth()` variant OR extend existing health check with provider branch
- return `{ available, latencyMs, error? }` on same contract

### P6. Deterministic Validation

Run:

```bash
cd cli && pnpm vitest src/__tests__/native-intelligence-*.test.ts
bash scripts/pr-ready.sh
```

### P7. Consumer Verification

- planner/normalizer/recommender/summarizer functions still call `backend.complete(input)` unchanged
- deterministic fallbacks still work when new provider is offline
- `createDeterministicProvider()` still returns valid results

### P8. Release + Ship Confirmation

- merge PR after checks are green
- run release workflow
- confirm npm remote versions match merged package versions

## Canonical Commands

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
cd cli && pnpm vitest src/__tests__/native-intelligence-*.test.ts
bash scripts/pr-ready.sh
```

## Definition Of Done

A native intelligence provider addition is done only when:

- new backend implements the `NativeIntelligenceBackend` interface
- factory correctly routes to new provider based on config
- health check reports correctly
- auth storage (if applicable) uses harness auth primitive
- focused vitest coverage passes
- consumer surfaces (planner/normalizer/recommender/summarizer) verify without changes
- PR checks are green
- merge lands in `main`

## Related Packets

- [Agent Harness Kernel Packet](./KERNEL_PACKET_AGENT_HARNESS.md) (for auth primitive)
- [CMS Contract Extension Kernel Packet](./KERNEL_PACKET_CMS_CONTRACT_EXTENSION.md)

## Related Docs

- [Agent Harness Auth Primitive](../AGENT_HARNESS_AUTH_PRIMITIVE.md)
- [Native Intelligence Local Adapter Architecture](../NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md)
