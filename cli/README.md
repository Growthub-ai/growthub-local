# @growthub/cli

`@growthub/cli` is the CLI control plane for Growthub Local.

It helps you turn a repo, skill, starter, or kit into a governed local agent environment you can customize, keep current, and optionally activate with hosted authority.

## Install

```bash
npm install -g @growthub/cli
```

Or start with the guided installer:

```bash
npm create growthub-local@latest
```

## Profile-first setup (recommended)

The guided flow is profile-first before deeper harness/workflow choices:

```bash
npm create growthub-local@latest -- --profile gtm
npm create growthub-local@latest -- --profile dx
npm create growthub-local@latest -- --profile workspace --out ./my-workspace
```

## Discovery lanes

Main entry:

```bash
growthub discover
```

Core lanes:

1. Worker Kits
2. Templates
3. Workflows
4. Local Intelligence
5. Agent Harness
6. Settings / account connection

## Main commands

```bash
growthub
growthub discover

growthub kit
growthub template
growthub workflow
growthub pipeline assemble

growthub open-agents
growthub qwen-code

growthub local-intelligence list-variants
growthub local-intelligence active
growthub local-intelligence use <model-id>
growthub local-intelligence health
growthub local-intelligence setup [model-id]

growthub auth login
growthub auth whoami
growthub auth logout
```

### Local Intelligence — supported models

The Local Intelligence lane is backed by a static catalog at
`cli/src/runtime/native-intelligence/model-catalog.ts`. First-class variants in v1:

| id                  | family      | context | endpoint env var     |
| ------------------- | ----------- | ------: | -------------------- |
| `gemma3:4b`         | gemma3      | 128k    | `OLLAMA_BASE_URL`    |
| `gemma-4-9b-it`     | gemma3      | 128k    | `OLLAMA_BASE_URL`    |
| `qwen3.5-coder-32b` | qwen-coder  | 128k    | `QWEN_BASE_URL`      |
| `minimax-m1-80k`    | minimax     |  80k    | `MINIMAX_BASE_URL`   |
| `kimi-k2.5`         | kimi        | 200k    | `KIMI_BASE_URL`      |
| `deepseek-v3.2`     | deepseek    | 128k    | `DEEPSEEK_BASE_URL`  |
| `glm-5-32b`         | glm         | 128k    | `GLM_BASE_URL`       |

Any other local adapter tag still works as a custom model — the catalog only
controls first-class presentation and per-family endpoint routing. To register
a new first-class model, add one entry to the catalog — nothing else changes.

<details>
<summary><strong>Command examples</strong></summary>

### Discovery

```bash
growthub discover
```

Example:

```text
Open the interactive hub and choose a lane by outcome (kit/template/workflow/harness/auth).
```

### Kits

```bash
growthub kit list
growthub kit inspect <kit-id>
growthub kit download <kit-id>
```

Compatibility examples used by package validation:

```bash
growthub kit list
growthub kit inspect creative-strategist-v1
growthub kit inspect growthub-open-higgsfield-studio-v1
growthub kit download creative-strategist-v1
growthub kit download growthub-open-higgsfield-studio-v1
growthub kit path creative-strategist-v1
growthub kit validate /absolute/path/to/kit
```

### How local adapters use worker kits

1. Download or resolve a kit path from the CLI.
2. Point the agent working directory at the exported folder.
3. Start a new session so the kit contract loads from `CLAUDE.md`.

### Workflows + pipelines

```bash
growthub workflow
growthub pipeline assemble
```

### Harnesses

```bash
growthub open-agents
growthub qwen-code
```

### Account connection

```bash
growthub auth login
growthub auth whoami
```

</details>

## Immediate value first, activation optional

You can get real local value without connecting a hosted account.

When ready, activate deeper hosted lanes:

[![Activate on Growthub](https://img.shields.io/badge/Activate-Growthub-111827?style=for-the-badge)](https://www.growthub.ai/)
[![First Month](https://img.shields.io/badge/First%20Month-%241-22c55e?style=for-the-badge)](https://www.growthub.ai/)

## Docs

- [Growthub Local README](https://github.com/Growthub-ai/growthub-local#readme)
- [Worker Kits](https://github.com/Growthub-ai/growthub-local/blob/main/docs/WORKER_KITS.md)
- [CLI Workflows Discovery](https://github.com/Growthub-ai/growthub-local/blob/main/docs/CLI_WORKFLOWS_DISCOVERY_V1.md)
- [Agent Harness Auth Primitive](https://github.com/Growthub-ai/growthub-local/blob/main/docs/AGENT_HARNESS_AUTH_PRIMITIVE.md)
- [Contributing](https://github.com/Growthub-ai/growthub-local/blob/main/CONTRIBUTING.md)
