# Hosted SaaS Kit Kernel Packet

Version: `v1`

This packet freezes the reusable primitive for shipping CLI worker kits whose target is a **hosted third-party SaaS REST API**. It specializes the Custom Workspace packet for the narrow case where the external dependency is a provider API (not a fork, not an executor).

Use it when you are:

- adding a new worker kit that wraps a hosted provider (Zernio, Stripe-style APIs, CRMs, scheduling APIs, data APIs)
- deciding whether a new kit should live as a new adapter, a new harness, or as a thin kit
- extending an existing thin-hosted kit's capability surface without introducing adapter sprawl

The canonical reference implementation is `cli/assets/worker-kits/growthub-zernio-social-v1`.

## Why This Packet Exists

The Zernio social-media kit proved a stable path for wrapping a hosted SaaS provider without:

- forking external `@paperclipai/adapter-*` packages
- adding a new entry to `server/src/adapters/registry.ts` or `cli/src/adapters/registry.ts`
- registering a new Agent Harness
- adding bespoke CLI surface code for provider-specific commands
- bundling any provider SDK

The result was an IDE-agnostic worker kit that runs identically under Claude Code, Claude Desktop, Codex, Cursor, Gemini, OpenCode, Qwen, and Open Agents — with `agent-only` mode as a first-class fallback, `sk_`-format secret hygiene enforced as a test, and the entire kit registered as a single catalog entry.

This document turns that path into a repeatable kernel so future hosted-SaaS integrations do not re-litigate the same decisions.

## Relationship to Other Packets

| Packet | Scope |
|---|---|
| `KERNEL_PACKET_CUSTOM_WORKSPACES.md` | The general worker-kit lifecycle — manifest, bundle, catalog, export, validate |
| `KERNEL_PACKET_AGENT_HARNESS.md` | Agent **executor** harnesses — Claude / Codex / Cursor / Gemini / OpenCode / Pi / Hermes / Qwen / Open Agents |
| `KERNEL_PACKET_HOSTED_SAAS_KIT.md` (this) | Worker kits whose target is a **hosted third-party REST API** |

This packet **inherits** every invariant from the Custom Workspace packet (schema-valid manifest, export round-trip, catalog registration, test coverage). It adds invariants specific to the thin-hosted-provider case.

## Kernel Invariants

Every hosted-SaaS kit must satisfy these in addition to the Custom Workspace invariants:

- **No SDK installed.** Kit uses Node's built-in `fetch()` for all HTTP. No transitive install required at kit usage time.
- **No new registry entry.** `server/src/adapters/registry.ts` and `cli/src/adapters/registry.ts` are untouched. Adapter registries are for agent executors, not downstream APIs.
- **No new Agent Harness.** The kit surfaces through the existing `growthub kit` / Worker Kits discovery only.
- **IDE-agnostic entrypoint.** Agent law lives in plain Markdown at `workers/<worker-id>/CLAUDE.md`. No IDE-specific API calls anywhere inside the kit.
- **Working Directory is the only runtime primitive assumed.** Any local adapter that supports a Working Directory config can drive the kit as-is.
- **Agent-only mode is first-class.** Provider reachability must never block the core artifact set (plans / drafts / dry-run manifests). Live-mode paths degrade to dry-run on auth/network failure.
- **Idempotency is part of the output contract.** Every write-shape the kit emits carries a stable client-generated idempotency key so re-submission is safe.
- **Secret hygiene is a test.** A recursive scan across `.md/.mjs/.json/.sh/.txt` files fails the build on any literal provider key pattern (e.g. `sk_[0-9a-fA-F]{64}`).
- **Provider primitives stay opt-in.** If the provider ships an MCP server, official CLI, or IDE skill, the kit **documents** them in an adapter matrix but **never requires** them at runtime.
- **Plans / quotas are documented.** The kit's API integration doc enumerates the provider's pricing tiers + rate limits + quota-exhaustion fallbacks.
- **No provider credentials in outputs.** Artifact files never contain raw keys, OAuth tokens, or captured auth headers.

## Surface Area Contract

Use this five-primitive shape for every hosted-SaaS kit:

1. **Provider Adapter Primitive** (factory config, not new adapter code)
   - Register a `buildXxxConfig()` function in `cli/src/kits/core/index.ts` using `createOperatorKitConfig` (or sibling factory for other families)
   - Declare: `providerId`, `providerName`, `providerBaseUrl`, `providerAuthField`, `apiKeyEnvVar`, `apiKeyPlaceholder`, `additionalRequiredEnvVars`, `artifacts[]`
   - Do not fork the adapter-core factories

2. **Env Gate Primitive** (format + reachability)
   - `setup/verify-env.mjs` enforces the provider key's regex and a live `GET /<base>/<cheap-read-endpoint>` round-trip
   - Cross-platform Node — no bash assumed
   - Graceful fallback message to agent-only mode when the key is missing or malformed

3. **Cross-Platform Setup Primitive**
   - `setup/setup.mjs` — one-command bootstrap (detect OS, check deps, copy `.env.example` → `.env`, run verify-env, print per-OS next steps)
   - `setup/check-deps.mjs` — Node-native dep check with cross-platform `which`/`where`; must acknowledge Node's built-in `fetch()` so `curl` is optional
   - Optional `setup/install-<provider-primitive>.mjs` (e.g. `install-mcp.mjs`) — print-only config emitter for provider primitives; never mutates user config files

4. **Adapter Matrix Primitive**
   - `docs/local-adapters.md` enumerates every local IDE the kit works with
   - Explicitly names the `ServerAdapterModule` + `CLIAdapterModule` contracts and documents **why the kit does not touch them**
   - Documents the three additive integration layers: Working Directory → provider MCP server → provider IDE skill
   - Each layer is opt-in and strictly additive

5. **Capability + Plans Primitive**
   - `docs/<provider>-api-integration.md` pins: base URL, auth header, idempotency header, error-code taxonomy, rate-limit behavior, pagination contract, plans + quotas table, full endpoint surface
   - Extended endpoints the kit does not use by default (CRM / webhooks / batch / admin) are documented in a clearly-separated section so the agent can pick them up when asked, not by default

## Anti-Patterns

This packet forbids:

- adding the provider to `server/src/adapters/registry.ts` or `cli/src/adapters/registry.ts`
- forking `@paperclipai/adapter-*` packages
- adding a new Agent Harness for the provider
- depending on the provider's SDK at kit-usage time (install commands, `require()`, `import`)
- IDE-specific API calls from inside the kit (Anthropic SDK, OpenAI SDK, Cursor API, etc.)
- requiring bash, docker, or self-host for setup
- hiding provider credentials inside output artifacts
- treating `agent-only` mode as a second-class degradation instead of a first-class mode
- creating a new top-level `growthub` command for provider-specific operations — the kit must surface through `growthub kit` only
- drifting from the Custom Workspace packet's schema-v2 manifest shape

## Packet Inputs

- Provider id (stable slug, e.g. `zernio`, `stripe`, `linear`)
- Provider base URL
- Provider auth scheme (bearer token, OAuth app, API key header)
- Provider key format regex (for verify-env)
- Minimal "cheap read" endpoint for reachability check (e.g. `/profiles`, `/account`, `/me`)
- Kit folder under `cli/assets/worker-kits/<kit-id>`
- Catalog entry in `cli/src/kits/catalog.ts`
- Core config registration in `cli/src/kits/core/index.ts`

## Packet Procedure

### P1. Provider + Kit Contract Freeze

- author `kit.json` (schemaVersion 2) + `bundles/<kit-id>.json`
- enumerate all frozen assets in `frozenAssetPaths` and `requiredFrozenAssets`
- write `workers/<worker-id>/CLAUDE.md` as plain Markdown agent law — no IDE-specific API calls
- write `skills.md`, `output-standards.md`, `runtime-assumptions.md`, `validation-checklist.md`

### P2. Provider Adapter Registration (factory config only)

- add `build<Provider>Config()` to `cli/src/kits/core/index.ts` via `createOperatorKitConfig` (or `createStudioKitConfig` if appropriate)
- add catalog entry to `cli/src/kits/catalog.ts`
- do **not** touch `server/src/adapters/registry.ts` or `cli/src/adapters/registry.ts`

### P3. Env + Setup Primitives

- write `setup/verify-env.mjs` — enforce key format regex + live reachability
- write `setup/setup.mjs` — one-command cross-platform bootstrap
- write `setup/check-deps.mjs` — Node-native dep check with `which`/`where` fallback
- write `setup/install-<provider-primitive>.mjs` if provider ships an MCP server / skill / CLI worth surfacing
- **do not list `.env.example` in `frozenAssetPaths`, `outputStandard.requiredPaths`, or `requiredFrozenAssets` in `kit.json` or the bundle manifest unless the file physically exists in the kit directory** — listing a missing path in any of these three lists causes `listBundledKits()` to throw and removes all kits from discovery for all users

### P4. Adapter Matrix + API + Plans Documentation

- write `docs/local-adapters.md` — enumerate every local IDE, document the three integration layers, name `ServerAdapterModule`, explicitly call out the anti-patterns
- write `docs/<provider>-api-integration.md` — base URL, auth, idempotency, errors, rate limits, plans + quotas, full endpoint surface
- write one or more capability docs per domain (`docs/<domain>-layer.md`)
- write a paired-environment doc if the kit is intended to combine with another kit

### P5. Deterministic Validation

Run:

```bash
node scripts/check-worker-kits.mjs
bash scripts/check-custom-workspace-kernel.sh
```

Add a kit-specific test file under `cli/src/__tests__/kit-<kit-id>.test.ts` that asserts:

- catalog entry present with correct family/type/executionMode
- factory config shape (provider id, base URL, auth field, env gate vars, artifact count, required vs optional split)
- every path in `frozenAssetPaths` exists on disk
- every path in `outputStandard.requiredPaths` exists on disk
- every path in `requiredFrozenAssets` exists on disk
- no path is listed in any of those three manifest lists unless the file physically exists (the manifest/disk check is the parity gate for all users)
- `verify-env.mjs` enforces the key regex and includes the reachability `Authorization: Bearer` call
- agent law (`CLAUDE.md`) declares the full command surface
- adapter matrix doc names all targeted IDEs + the `ServerAdapterModule` contract + the "does NOT" disclaimer
- API integration doc pins base URL, auth header, idempotency header, and the full capability surface
- **secret hygiene scan** — recursive walk fails on any literal provider key pattern

Wire the new test file into `scripts/check-custom-workspace-kernel.sh` so it runs in the kernel gate.

### P6. Release + Ship Confirmation

- per `CONTRIBUTING.md`, bump `@growthub/cli` + `@growthub/create-growthub-local` if the kit adds consumer-visible CLI behavior (a new entry in `growthub kit list` is consumer-visible)
- merge PR after checks are green
- confirm npm remote reflects merged versions

## Canonical Commands

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
node scripts/check-worker-kits.mjs
bash scripts/check-custom-workspace-kernel.sh
bash scripts/pr-ready.sh
```

## Reference Implementation

`cli/assets/worker-kits/growthub-zernio-social-v1` is the canonical v1 reference. Use it as the copy-template for future hosted-SaaS kits.

Key files to read first:

- `cli/assets/worker-kits/growthub-zernio-social-v1/kit.json`
- `cli/assets/worker-kits/growthub-zernio-social-v1/bundles/growthub-zernio-social-v1.json`
- `cli/src/kits/core/index.ts` — `buildZernioSocialConfig()`
- `cli/src/kits/catalog.ts` — catalog entry
- `cli/assets/worker-kits/growthub-zernio-social-v1/docs/local-adapters.md`
- `cli/assets/worker-kits/growthub-zernio-social-v1/docs/zernio-api-integration.md`
- `cli/assets/worker-kits/growthub-zernio-social-v1/setup/setup.mjs`
- `cli/src/__tests__/kit-zernio-social.test.ts`

## Definition Of Done

A hosted-SaaS kit change is done only when:

- every kernel invariant above is satisfied
- `bash scripts/check-custom-workspace-kernel.sh` is green, including the kit-specific test file
- `growthub kit list` surfaces the kit with correct family/type/executionMode
- `growthub kit download <kit-id>` round-trips folder + zip with every frozen asset present
- `setup/setup.mjs` runs clean on at least one of macOS / Linux / Windows without bash dependency
- `setup/verify-env.mjs` exits non-zero only on malformed keys; missing keys degrade to `agent-only` mode
- adapter matrix doc is present and names every local IDE in scope
- API integration doc pins plans + rate limits + capability surface
- PR checks green and the agent can operate end-to-end under at least one local IDE
- merge lands in `main` and release (if version-bumped) is published cleanly
