# Agent Harness Auth Primitive

This document freezes the auth/storage surface-area contract for all harnesses under `Agent Harness`.

Kernel packet reference:

- [Agent Harness Kernel Packet](./kernel-packets/KERNEL_PACKET_AGENT_HARNESS.md)

Use this primitive whenever a harness needs tokens, API keys, provider credentials, or auth strategy selection.

## Contract Goals

- auth setup is native to CLI `Setup & Configure`
- secret storage is local + safe by default
- runtime config and secrets are split (non-secret vs secret lanes)
- UX stays harness-agnostic and reusable for future harness additions

## Surface Area Contract

Every harness must implement these auth/storage surfaces:

1. **Public config lane**
   - path: `~/.paperclip/<harness-id>/config.json`
   - stores non-secret runtime defaults only
2. **Secure auth lane**
   - path: `~/.paperclip/harness-auth/<harness-id>.json`
   - stores API keys/tokens/secrets
   - best-effort restrictive permissions:
     - directory `0700`
     - file `0600`
3. **Configure UX**
   - auth strategy selection
   - set/replace/clear secret flow
   - save confirmation
   - explicit back navigation options in nested auth steps
4. **Health UX**
   - detects missing auth dependencies
   - prints setup guidance without exposing raw secrets
5. **Masking rules**
   - never print raw secrets
   - show masked values only in summaries/config output

## Current Implementations

### Open Agents

Upstream: [vercel-labs/open-agents](https://github.com/vercel-labs/open-agents)

Current auth strategies:

- `none`
- `api-key`
- `vercel-managed`

Auth behavior:

- bearer key stored in secure auth lane when `api-key` mode is used
- config JSON keeps non-secret runtime fields

### Qwen Code CLI

Upstream: [QwenLM/qwen-code](https://github.com/QwenLM/qwen-code)

Current secure provider keys:

- `DASHSCOPE_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`

Auth behavior:

- keys stored in secure auth lane
- runtime merges secure keys + process environment

## Extension Checklist (Auth Primitive)

When adding a new harness:

1. define auth strategy type(s) in runtime contract
2. persist non-secret config in harness config lane
3. persist secrets in secure auth lane
4. add configure flow with set/clear/back behavior
5. add health checks that evaluate auth readiness
6. ensure all secret output is masked

This keeps harness auth consistent, safe, and reusable across future Agent Harness additions.
