# Agent Workspace as Code (AWaC) — Growthub Local

![Growthub Local Logo](./ui/public/growthub%20logo%20copy.png)

**Growthub Local turns repos, skills, starters, kits, and templates into governed AI workspaces you can customize, operate with agents, deploy as apps, and keep current.**

**Agent Workspace as Code (AWaC)** means the workspace is the owned artifact: a forkable app, portable config, local builder, agent-readable contracts, lifecycle trace, and optional hosted authority moving together instead of living in scattered tools.

![npm](https://img.shields.io/npm/v/@growthub/cli?label=%40growthub%2Fcli)
![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

**Streamlined one-click deployment:** [Launch Growthub Local](https://www.growthub.ai/f/growthub-local)

**Quick links:** [Start here](#start-here) · [Launch](https://www.growthub.ai/f/growthub-local) · [Architecture](#architecture) · [Features](#features) · [Install](#install) · [Docs](#docs)

---

## Start here: create a governed Workspace

Power-user one-liner:

```bash
npx -p @growthub/cli@latest growthub kit download growthub-custom-workspace-starter-v1 --out ./my-workspace
cd my-workspace/apps/workspace
npm install
npm run dev
```

Or use the guided installer:

```bash
npm create @growthub/growthub-local@latest
```

Choose **Custom AI Governed Workspace**, then pick the fastest source:

1. [**Import a GitHub repo**](./docs/FIRST_RUN_PATHS.md#1-import-a-repo)
2. [**Import a skills.sh skill**](./docs/FIRST_RUN_PATHS.md#2-import-a-skill)
3. [**Start from the workspace starter**](./docs/FIRST_RUN_PATHS.md#3-start-from-a-workspace-starter)
4. [**Start from a worker kit**](./docs/FIRST_RUN_PATHS.md#4-download-a-worker-kit)
5. [**Connect your Growthub account after local value is clear**](./docs/FIRST_RUN_PATHS.md#5-connect-your-growthub-account)
6. [**Unlock hosted workflows and enterprise customization (optional)**](./docs/FIRST_RUN_PATHS.md#6-unlock-hosted-workflows-and-enterprise-customization-optional)

Agent commands:

```bash
npm create @growthub/growthub-local@latest
npm install -g @growthub/cli
growthub workspace status --json
```

**Reference contracts:** [Workspace Config Contract V1](./docs/WORKSPACE_CONFIG_CONTRACT_V1.md) · [Governed Workspace Topology V1](./docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md) · [Workspace Builder Runtime V1](./docs/WORKSPACE_BUILDER_RUNTIME_V1.md)
&nbsp;

**▶️ [Watch on YouTube](https://youtu.be/DL38oRoIB3g)**

<a href="https://youtu.be/DL38oRoIB3g"><img src="https://img.youtube.com/vi/DL38oRoIB3g/maxresdefault.jpg" alt="Watch the video" width="600"></a>

&nbsp;

---

## Architecture

AWaC in Growthub Local is the full governed workspace stack:

![AWaC governed workspace stack](./docs/assets/awac-workspace-stack.jpg)

AWaC is the DevOps layer for AI workspaces. Instead of rebuilding agent setups by hand, Growthub Local makes the workspace itself portable, inspectable, repeatable, and safe to operate.

---

## Why this exists

AI work creates the same pressure that made DevOps necessary for apps:

- **Scale:** you cannot manually set up reliable environments for every agent, operator, client, repo, or workflow.
- **Security and governance:** teams need to know what an agent can touch, what it cannot touch, and where that policy lives.
- **Reliability:** when an agent workflow fails, the environment needs to be reconstructible so humans can debug what happened.

Growthub Local answers that with Agent Workspace as Code: the app, builder, data model, workflows, integrations, fork policy, trace, and optional authority move together as one governed workspace artifact.

That matters at every skill level:

- **Non-technical teams** get a real workspace they can open, customize, hand off, and trust without learning how to wire repos, prompts, credentials, and scripts together.
- **Builders and no-code innovators** can turn a repo, skill, starter, template, or worker kit into a working product surface without losing upgrade paths or governance.
- **Agents and operators** get clear commands, JSON status, policy, trace, and reusable workspace primitives instead of guessing what folder, prompt, or script matters.
- **Enterprise developers** get local-first flexibility with fork safety, deploy checks, credential boundaries, audit trails, and optional hosted authority when higher-trust flows need it.

The practical result: Growthub Local keeps open-source speed and customization, but gives AI workspaces the structure teams expect from serious DevOps.

---

## Install

### Guided installer

```bash
npm create @growthub/growthub-local@latest
```

The guided installer is **profile-first**:

1. without flags, it opens **Custom AI Governed Workspace** first
2. choose workspace starter, GitHub repo import, skills.sh import, worker kit, or the full discovery menu
3. use explicit profiles (`gtm`, `dx`, or `workspace`) only when you want a direct install lane

### Direct profile install

```bash
npm create @growthub/growthub-local@latest -- --profile gtm
npm create @growthub/growthub-local@latest -- --profile dx
npm create @growthub/growthub-local@latest -- --profile workspace --out ./my-workspace
```

Use profile selection to choose the initial environment shape before deeper workflow and harness configuration.

### CLI-only install

```bash
npm install -g @growthub/cli
```

Growthub Local currently ships `@growthub/cli@0.9.14` and the guided installer `@growthub/create-growthub-local@0.5.14`, with the installer pin aligned to the CLI version. The `@growthub/api-contract` SDK is at `1.3.0-alpha.2` (adds hosted agent bridge manifest types additively alongside the bridge resource primitives and v1.2 Skills surface — see [Skills + MCP Discovery](./docs/SKILLS_MCP_DISCOVERY.md)).

> Always read versions from `cli/package.json` / `packages/create-growthub-local/package.json` / `packages/api-contract/package.json` on your branch — see [docs/ARTIFACT_VERSIONS.md](./docs/ARTIFACT_VERSIONS.md).

---

## Features

<table>
  <tr>
    <td align="center"><strong>🧱 Workspace Builder</strong><br>No-code dashboard, tab, canvas, widget, template, import/export, and settings surface backed by validated config.</td>
    <td align="center"><strong>📊 Governed Data Model</strong><br>Business objects, rows, fields, relations, field settings, table helpers, and widget bindings live as first-class workspace state.</td>
    <td align="center"><strong>📥 Source Import</strong><br>GitHub repos, skills.sh skills, starters, worker kits, and templates become governed workspaces through one lifecycle.</td>
  </tr>
  <tr>
    <td align="center"><strong>🔌 Integration Catalog</strong><br>Data-source and workspace-integration lanes cover analytics, commerce, ads, spreadsheets, project tools, docs, and CRM-style systems.</td>
    <td align="center"><strong>🧩 Resolver Layer</strong><br>Local resolver files, bridge-backed connections, BYO credentials, API Registry rows, and Data Sources make live data governable.</td>
    <td align="center"><strong>🧪 Workspace Operations</strong><br><code>workspace status</code>, QA, deploy checks, Vercel env output, upstream checks, surface detection, and portal preparation are JSON-first.</td>
  </tr>
  <tr>
    <td align="center"><strong>🔁 Self-Healing Forks</strong><br>Fork registration, drift detection, dry-run heal plans, protected paths, background jobs, optional GitHub PR flow, and trace history.</td>
    <td align="center"><strong>🧰 Worker Kits</strong><br>Self-contained operator environments ship SKILL.md, helpers, sub-skills, templates, assumptions, examples, and output standards.</td>
    <td align="center"><strong>🤖 Agent Harnesses</strong><br>Open Agents, Qwen Code, T3 Code, local intelligence, memory, knowledge sync, health checks, sessions, and profile binding.</td>
  </tr>
  <tr>
    <td align="center"><strong>⚙️ Workflows + Pipelines</strong><br>Saved workflows, templates, dynamic pipeline assembly, CMS node contracts, execution payloads, artifacts, and structured results.</td>
    <td align="center"><strong>✨ Self-Improving Workspace</strong><br>Workspace improvement commands propose, list, and promote capabilities after runs so the workspace compounds over time.</td>
    <td align="center"><strong>🌉 Bridge + Hosted Agents</strong><br>Hosted identity, integrations, MCP accounts, agent list/inspect/bind/bindings, and authority-backed activation remain optional.</td>
  </tr>
  <tr>
    <td align="center"><strong>🚀 Deployable Workspace App</strong><br>Each workspace exports as a Next.js app with Vercel-ready project config, environment handoff, and deploy checks.</td>
    <td align="center"><strong>🧾 Policy + Trace</strong><br>Every governed fork carries identity, policy, session memory, self-eval records, trace events, and optional signed authority.</td>
    <td align="center"><strong>🤝 Human + Agent Co-Operability</strong><br>The builder, API, CLI, JSON outputs, skill manifests, and helper scripts expose the same workspace contracts.</td>
  </tr>
</table>

**AWaC benefits from Growthub Local**

| Without AWaC | With Growthub Local |
| --- | --- |
| Agent work starts from scattered repos, prompts, scripts, and one-off folders. | Every source becomes a governed Workspace with config, policy, trace, and lifecycle from the first run. |
| Useful repos and skills are hard to turn into repeatable production environments. | Repos, skills.sh skills, worker kits, templates, and starters all enter the same governed workspace path. |
| Customization creates upgrade debt and makes upstream sync risky. | Forks are first-class and self-healing, with drift detection, previews, protected paths, and additive heals. |
| Data bindings can drift into fake, stale, or untested widget inputs. | API Registry and Data Source objects enforce test-before-bind data quality before widgets consume external data. |
| Secrets leak into config, browsers, local notes, or agent prompts. | Workspaces store `authRef` references only; provider secrets resolve server-side or through hosted authority. |
| Humans and agents operate through different paths, creating inconsistency. | The UI, PATCH API, CLI, resolvers, and JSON commands expose the same contracts to humans and agents. |
| Local experimentation is powerful but difficult to govern across a team. | Local control stays first while hosted identity, bridge connections, agent binding, and authority can be added only when needed. |
| Workflows stay trapped in one machine or one prompt thread. | Workflows become reusable governed infrastructure objects that can be inspected, shared, evolved, and executed over time. |
| It is unclear what agents may safely automate. | Policies, confirmations, capability gates, and append-only trace make automation explicit and auditable. |
| Open-source freedom often means more maintenance burden and operational drift. | Growthub Local keeps open-source portability while adding self-healing lifecycle management and optional authority-backed trust. |

---

## Growthub account connection

You do **not** need to connect a Growthub account to get value from the open-source substrate.

You connect your account when you want:

- hosted workflow access
- machine bridge flows
- integration bridge flows
- higher-trust or premium activation surfaces

That separation is intentional.

### Upgrade CTA (optional, explicit)

You can stay local-first indefinitely. When you are ready to activate deeper hosted lanes:

[![Activate on Growthub](https://img.shields.io/badge/Activate-Growthub-111827?style=for-the-badge)](https://www.growthub.ai/)
[![First Month](https://img.shields.io/badge/First%20Month-%241-22c55e?style=for-the-badge)](https://www.growthub.ai/)

This keeps the mental model intact:

1. get immediate free local value
2. prove fit on your workflow
3. activate hosted depth when needed

---

## Docs

### Workspace 1.0 (the product object)

- [**Setup**](./docs/SETUP.md) — one canonical install path
- [**Quickstart — Governed Workspace**](./docs/QUICKSTART_WORKSPACE.md) — 30-second mental model
- [**Workspace Starter Activation Path**](./docs/WORKSPACE_STARTER_ACTIVATION_PATH.md) — full end-to-end journey
- [**Source Import → Workspace Builder**](./docs/SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md) — source-type matrix
- [**Workspace Config Contract V1**](./docs/WORKSPACE_CONFIG_CONTRACT_V1.md) — the canonical `growthub.config.json` shape
- [**Governed Workspace Topology V1**](./docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — what's inside a Workspace + authority boundary
- [**Workspace Builder Runtime V1**](./docs/WORKSPACE_BUILDER_RUNTIME_V1.md) — the no-code builder runtime
- [**Workspace Deploy Flow**](./docs/WORKSPACE_DEPLOY_FLOW.md) — how to ship a Workspace

### Workspace Templates

Five shipped dashboard templates, each grounded in the actual `DASHBOARD_TEMPLATES` array in `apps/workspace/lib/workspace-schema.js`:

- [**Templates Index**](./docs/workspace-templates/README.md) — all five at a glance
- [Client Portal](./docs/workspace-templates/client-portal.md) — client status, documents, embedded portal area
- [Content Ops](./docs/workspace-templates/content-ops.md) — editorial pipeline and review snapshot
- [Reporting Dashboard](./docs/workspace-templates/reporting-dashboard.md) — KPIs, table, executive readout
- [Creative Review](./docs/workspace-templates/creative-review.md) — creative artifact embed and approval notes
- [Agency Delivery](./docs/workspace-templates/agency-delivery.md) — agency workstream, KPI, delivery notes

### Start here

- [CLI Workflows Discovery V1](./docs/CLI_WORKFLOWS_DISCOVERY_V1.md)
- [Growthub Authentication Bridge](./docs/GROWTHUB_AUTH_BRIDGE.md)
- [Governed Workspace Agents](./docs/GOVERNED_WORKSPACE_AGENTS.md) — attach hosted Growthub agents to fork-sync governed workspaces through the CLI
- [Worker Kits Overview](./docs/WORKER_KITS.md)
- [**Governed Workspace Primitives (user-facing)**](./cli/assets/worker-kits/growthub-custom-workspace-starter-v1/docs/governed-workspace-primitives.md) — how the six architectural primitives (SKILL.md, AGENTS.md pointer, session memory, self-evaluation, sub-skills, helpers) coordinate agents inside every exported workspace
- [**First-Run Paths**](./docs/FIRST_RUN_PATHS.md) — six concrete starting points: import a repo, import a skill, workspace starter, worker kit, connect account, unlock hosted workflows

### Architecture and protocol

- [Skills + MCP Discovery (v1 reference)](./docs/SKILLS_MCP_DISCOVERY.md)
- [Kernel Packet Registry](./docs/kernel-packets/README.md)
- [Fork Sync Agent Kernel Packet](./docs/kernel-packets/KERNEL_PACKET_FORK_SYNC_AGENT.md)
- [Source Import Agent Kernel Packet](./docs/kernel-packets/KERNEL_PACKET_SOURCE_IMPORT_AGENT.md)
- [Custom Workspace Starter Kit Kernel Packet](./docs/kernel-packets/KERNEL_PACKET_CUSTOM_WORKSPACE_STARTER.md)
- [Hosted SaaS Kit Kernel Packet](./docs/kernel-packets/KERNEL_PACKET_HOSTED_SAAS_KIT.md)

### Local intelligence and harnesses

- [Local Native-Intelligence Architecture](./docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md)
- [Qwen Code CLI Integration](./docs/QWEN_CODE_CLI_INTEGRATION.md)
- [Agent Harness Auth Primitive](./docs/AGENT_HARNESS_AUTH_PRIMITIVE.md)

### Contributor references

- [Contributing](./CONTRIBUTING.md)
- [CLI README](./cli/README.md)

---

**One-line summary:** Growthub Local turns repos, skills, starters, and kits into governed agent environments you can customize, keep current, and optionally activate with hosted authority over time.
