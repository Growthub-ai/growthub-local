# Agent Harness Kernel Packet

Version: `v1`

This packet freezes the reusable primitive for shipping new `Agent Harness` CLI additions end to end.

Use it when you are:

- adding a new harness type under `Agent Harness`
- expanding auth/setup/runtime surfaces for an existing harness
- consolidating multiple harness PRs into one integration branch

## Why This Packet Exists

Recent harness work (Open Agents + Qwen Code) proved a stable path:

1. freeze a harness contract (config + auth + health + execution)
2. register it in discovery under `Agent Harness`
3. provide prompt/chat-first UX with back-navigation safety
4. validate secure local auth storage behavior
5. verify command surfaces and focused test coverage before merge

This document turns that path into a repeatable kernel for future harness additions.

## Kernel Invariants

Every harness change must satisfy these invariants before merge:

- harness appears in discovery via `Agent Harness` type filter
- harness has native `Setup & Configure` and `Health Check` flows
- prompt/chat/session path is available when the harness supports it
- secrets are stored in secure harness auth storage (`~/.paperclip/harness-auth/*`)
- non-secret runtime defaults stay in harness config (`~/.paperclip/<harness>/config.json`)
- UI never prints raw secrets (masked summaries only)
- focused harness tests pass
- repo gates pass (`validate`, `smoke`, `verify`)

## Surface Area Contract

Use this contract shape for every harness:

1. **Contract primitive**
   - runtime types for config, auth strategy, health result, and execution result
2. **Storage primitive**
   - non-secret config + secure secret store split
3. **Discovery primitive**
   - registration under `Agent Harness` with consistent back-navigation
4. **Command primitive**
   - explicit command surface for configure, health, prompt/chat/session
5. **Validation primitive**
   - focused Vitest coverage + deterministic kernel script

The detailed auth/storage contract lives here:

- [Agent Harness Auth Primitive](../AGENT_HARNESS_AUTH_PRIMITIVE.md)

## Packet Inputs

- harness id (for example `open-agents`, `qwen-code`, `<new-harness-id>`)
- command file under `cli/src/commands/`
- runtime contract/provider files under `cli/src/runtime/`
- discovery registration in `cli/src/index.ts`
- adapter registration where applicable (`cli/src/adapters/registry.ts`, `server/src/adapters/registry.ts`)

## Packet Procedure

### P1. Contract + Auth Storage

- define/update runtime contract types
- split secret vs non-secret persistence
- wire secure auth storage via shared harness auth primitive

### P2. Discovery + UX Registration

- register harness under `Agent Harness` filter options
- include configure/health and prompt/chat/session flows where supported
- enforce consistent back-navigation in nested setup flows

### P3. Deterministic Validation

Run:

```bash
bash scripts/check-agent-harness-kernel.sh
```

### P4. Integration Branch Rollup (when multiple harness PRs exist)

- create fresh branch from latest `origin/main`
- cherry-pick harness commit stacks
- resolve conflicts in shared discovery/registry files
- re-run packet validation before opening consolidation PR

### P5. Release + Ship Confirmation

- merge PR after checks are green
- run release workflow
- confirm npm remote versions match merged package versions

## Canonical Commands

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
bash scripts/check-agent-harness-kernel.sh
bash scripts/pr-ready.sh
```

## Definition Of Done

An Agent Harness change is done only when:

- packet validation command passes locally
- harness appears in discovery with correct UX contract
- auth/setup flow works with secure local secret storage
- PR checks are green
- merge lands in `main`
