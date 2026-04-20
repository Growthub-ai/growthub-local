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

growthub auth login
growthub auth whoami
growthub auth logout
```

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
