# @growthub/cli

`@growthub/cli` is the local control plane for Growthub Local and Agent Workspace as Code (AWaC).

It turns repos, skills, starters, kits, and templates into governed **Workspaces** that can be exported, forked, inspected, operated by agents, kept current, and optionally connected to hosted authority. The Workspace is the top-level product object; the CLI is the executor that moves it through the lifecycle.

## Start here: create a governed Workspace

Power-user one-liner that exports the official starter directly:

```bash
npx -p @growthub/cli@latest growthub kit download growthub-custom-workspace-starter-v1 --out ./my-workspace
```

Or the guided installer:

```bash
npm create @growthub/growthub-local@latest
```

After export, open the no-code Workspace Builder:

```bash
cd my-workspace/apps/workspace
npm install
npm run dev
```

## Install (CLI only)

```bash
npm install -g @growthub/cli
```

Reference contracts: [Workspace Config Contract V1](../docs/WORKSPACE_CONFIG_CONTRACT_V1.md) · [Governed Workspace Topology V1](../docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md) · [Workspace Builder Runtime V1](../docs/WORKSPACE_BUILDER_RUNTIME_V1.md)

## CLI role in the governed workspace architecture

Growthub Local keeps the Workspace as the owned artifact: a forkable app, `growthub.config.json`, `.growthub-fork/` lifecycle state, builder state, agent-readable contracts, and optional hosted authority.

The CLI is the machine-readable path through that architecture:

- **Export** a starter, repo, skill, template, or worker kit into a local Workspace.
- **Register and inspect forks** so customization carries identity, policy, and trace instead of becoming an untracked copy.
- **Operate ongoing lifecycle checks** for workspace status, QA, deploy readiness, upstream drift, surface detection, and portal preparation.
- **Connect optional authority** through Growthub auth, bridge-backed integrations, hosted agents, and capability activation when local value is already clear.
- **Expose the same contracts to agents and humans** through structured commands, JSON output, skill manifests, helper scripts, and the Workspace Builder.

## Profile-first setup (recommended)

The guided flow is profile-first before deeper harness/workflow choices:

```bash
npm create @growthub/growthub-local@latest -- --profile gtm
npm create @growthub/growthub-local@latest -- --profile dx
npm create @growthub/growthub-local@latest -- --profile workspace --out ./my-workspace
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
