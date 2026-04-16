# @growthub/cli

`@growthub/cli` is the public CLI for Growthub Local.

## Install

```bash
npm install -g @growthub/cli
```

Or use the guided installer:

```bash
npm create growthub-local@latest
```

## At a Glance

The CLI ships these user flows:

- `Agent Harness` (Paperclip Local App, Open Agents, Qwen Code CLI)
- `Worker Kits`
- `Templates`
- `Workflows`
- `Local Intelligence`
- `Hosted Auth Bridge`

## Quick Commands

```bash
# Discovery
growthub
growthub discover

# Agent Harness
growthub onboard
growthub run
growthub open-agents
growthub qwen-code

# Worker Kits
growthub kit
growthub kit list
growthub kit inspect <kit-id>
growthub kit download <kit-id>
growthub kit validate <path>
growthub kit sync init --kit <kit-id> --fork-path <path>
growthub kit sync status <fork-id>

# Templates
growthub template
growthub template list
growthub template get <slug>

# Workflows
growthub workflow
growthub workflow saved
growthub pipeline assemble

# Hosted Auth Bridge
growthub auth login
growthub auth whoami
growthub auth logout
```

## Worker Kit Command Surface

```bash
growthub kit list
growthub kit inspect creative-strategist-v1
growthub kit inspect growthub-open-higgsfield-studio-v1
growthub kit download creative-strategist-v1
growthub kit download growthub-open-higgsfield-studio-v1
growthub kit path creative-strategist-v1
growthub kit validate /absolute/path/to/kit
growthub kit sync init --kit growthub-postiz-social-v1 --fork-path ./forks/postiz
growthub kit sync start my-postiz-fork
growthub kit sync status my-postiz-fork
growthub kit sync report my-postiz-fork
```

### How local adapters use worker kits

1. Download or resolve a kit path from the CLI.
2. Point the agent working directory at the exported folder.
3. Start a new session so the kit contract loads from `CLAUDE.md`.

### Fork sync and self-heal

`growthub kit sync` is the agent-first maintenance lane for forked worker kits:

1. `growthub kit sync init` registers a local fork path and captures the current bundled kit as a baseline.
2. `growthub kit sync plan` previews upstream drift, package-version pressure, and likely review hotspots.
3. `growthub kit sync start` launches a detached background job in an isolated git worktree + branch.
4. `growthub kit sync status` and `growthub kit sync report` expose logs, review artifacts, and the generated skill pack.

The sync agent preserves local-only files, applies upstream updates when the fork still matches the saved baseline, performs three-way merges for text files, and escalates overlapping edits for human review instead of erasing customizations.

## Harness Notes

### Open Agents

- upstream: [vercel-labs/open-agents](https://github.com/vercel-labs/open-agents)
- secure auth mode support: `none`, `api-key`, `vercel-managed`
- prompt/chat commands: `growthub open-agents prompt`, `growthub open-agents chat`

### Qwen Code CLI

- upstream: [QwenLM/qwen-code](https://github.com/QwenLM/qwen-code)
- secure local key setup from `growthub qwen-code` configure flow
- prompt/chat session commands: `growthub qwen-code prompt`, `growthub qwen-code session`

## Extension Model

Content extensions:

- worker kits: `cli/assets/worker-kits/`
- shared templates: `cli/assets/shared-templates/`

Governance/reference docs:

- [Worker Kits](../docs/WORKER_KITS.md)
- [CLI Workflows Discovery V1](../docs/CLI_WORKFLOWS_DISCOVERY_V1.md)
- [Agent Harness Auth Primitive](../docs/AGENT_HARNESS_AUTH_PRIMITIVE.md)
- [Kernel Packet Registry](../docs/kernel-packets/README.md)

## Links

- [Growthub Local Repository](https://github.com/Growthub-ai/growthub-local)
- [Root README](https://github.com/Growthub-ai/growthub-local#readme)
- [Contributing](https://github.com/Growthub-ai/growthub-local/blob/main/CONTRIBUTING.md)
