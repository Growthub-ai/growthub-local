# Growthub Local

![Growthub Local Logo](./ui/public/growthub%20logo%20copy.png)

**Turn a repo, skill, or starter into a governed agent environment you can customize, keep current, and run through a CLI that works for both humans and agents.**

Growthub Local is a **local control plane for portable agent environments**.

- **The CLI** is the local executor
- **The hosted app** is the identity and connection authority
- **Worker Kits** are the portable execution unit
- **Forks** are your customizable, policy-governed branch of that infrastructure

![npm](https://img.shields.io/npm/v/@growthub/cli?label=%40growthub%2Fcli)
![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

**Quick links:** [Start here](#start-here) · [Why this exists](#why-this-exists) · [What you can do](#what-you-can-do) · [Install](#install) · [First-run paths](#first-run-paths) · [How it works](#how-it-works) · [CLI surfaces](#cli-surfaces) · [Docs](#docs)

---

## Start here

If you only do one thing, do this:

```bash
npm create growthub-local@latest
```

Then choose one of these six paths:

1. [**Import a GitHub repo into a governed workspace**](#1-import-a-repo)
2. [**Import a skills.sh skill into a governed workspace**](#2-import-a-skill)
3. [**Start from a custom workspace starter**](#3-start-from-a-workspace-starter)
4. [**Download a worker kit**](#4-download-a-worker-kit)
5. [**Connect your Growthub account after local value is clear**](#5-connect-your-growthub-account)
6. [**Unlock hosted workflows and enterprise customization (optional)**](#6-unlock-hosted-workflows-and-enterprise-customization-optional)

---

## Why this exists

Most tools make you choose between:

- **open-source freedom**
- **deep customization**
- **staying current with upstream**
- **enterprise trust and control**

Growthub Local is built so you do not have to choose.

It gives you a control plane where you can:

- start from a repo, skill, starter, or kit
- turn it into a governed local environment
- keep your customizations
- sync safely with upstream over time
- optionally layer in hosted identity, authority, and premium capabilities later

---

## What you can do

### Turn sources into real environments

Import a public or private GitHub repo, or a skills.sh skill, into a starter-derived workspace with policy, trace, and fork registration from the first byte.

### Fork and customize without losing the upgrade path

Use self-healing fork sync to detect upstream drift, protect your local changes, and apply safe additive updates.

### Use portable worker kits

Download complete, validated agent environments instead of starting from a blank prompt.

### Run workflows and pipelines

Use saved workflows, templates, and dynamic pipelines through the CLI, backed by hosted execution where needed.

### Use local intelligence and harnesses

Run local model flows and external harnesses like Open Agents and Qwen Code through the same CLI ecosystem.

### Add authority when needed

Keep the open-source substrate useful by default, then add hosted identity, capability gating, and authority-backed activation only where it matters.

---

## Install

### Guided installer

```bash
npm create growthub-local@latest
```

The guided installer is **profile-first**:

1. choose your base profile (`gtm`, `dx`, or `workspace`)
2. then move into command/harness lanes (Open Agents, Qwen Code, workflows, kits, auth)

### Direct profile install

```bash
npm create growthub-local@latest -- --profile gtm
npm create growthub-local@latest -- --profile dx
npm create growthub-local@latest -- --profile workspace --out ./my-workspace
```

Use profile selection to choose the initial environment shape before deeper workflow and harness configuration.

### CLI-only install

```bash
npm install -g @growthub/cli
```

Growthub Local currently ships `@growthub/cli@0.7.3` and the guided installer `@growthub/create-growthub-local@0.4.2`, with the installer pin aligned to the CLI version.

---

## First-run paths

### 1) Import a repo

```bash
growthub starter import-repo octocat/hello-world --out ./ws-repo
```

Use this when you want to turn an open-source repository into a governed local environment with starter shell, policy, trace, and fork registration.

### 2) Import a skill

```bash
growthub starter import-skill anthropics/skills/frontend-design --out ./ws-skill
growthub starter browse-skills --scope trending --query marketing
```

Use this when you want to turn a portable skill into a governed environment you can continue to evolve locally.

### 3) Start from a workspace starter

```bash
npm create growthub-local@latest -- --profile workspace --out ./my-workspace
```

Use this when you want the cleanest path to a custom workspace without importing an external source first.

### 4) Download a worker kit

```bash
growthub kit
growthub kit list
growthub kit inspect <kit-id>
growthub kit download <kit-id>
```

Use this when you want a prepackaged environment with runtime assumptions, templates, setup files, and agent contract already in place.

### 5) Connect your Growthub account

```bash
growthub auth login
growthub auth whoami
```

Use this after local value is clear, when you want hosted identity, connection authority, workflow access, or premium activation flows.

### 6) Unlock hosted workflows and enterprise customization (optional)

This is intentionally **after** immediate local value discovery.

If you want full hosted activation lanes and enterprise customization support, activate on Growthub:

- [Open Growthub Activation](https://www.growthub.ai/)
- [Plans and pricing](https://www.growthub.ai/)
- [Start with first-month $1 path](https://www.growthub.ai/)

#### Why Upgrade?

Keep free local CLI value first. Upgrade when you want more scale, coordination, and governance.

- Fork anything, keep customizations, stay current
- Turn repos and skills into agent-operable environments
- Portable local environments with policy, trace, and authority
- Open-source freedom with enterprise-grade governance
- A CLI both humans and agents can operate

**Features**

<table>
  <tr>
    <td align="center"><strong>🧩 Portable Agent Environments</strong><br>Turn repos, skills, starters, and kits into real governed environments instead of loose prompts, scripts, or folders.</td>
    <td align="center"><strong>🔀 Source Import Pipeline</strong><br>Import from GitHub or skills.sh through one shared pipeline with probing, inspection, confirmations, and materialization into a proper workspace.</td>
    <td align="center"><strong>🛠️ Worker Kits</strong><br>Download complete, self-contained operator environments with setup files, runtime assumptions, templates, examples, and output standards.</td>
  </tr>
  <tr>
    <td align="center"><strong>🌿 Self-Healing Forks</strong><br>Customize freely while keeping an upgrade path. Detect upstream drift, preview heal plans, preserve protected paths, and apply safe additive updates.</td>
    <td align="center"><strong>📜 Policy + Trace</strong><br>Every fork carries identity, policy, and append-only history so the environment is portable, auditable, and reconstructible over time.</td>
    <td align="center"><strong>🔐 Authority Protocol</strong><br>Attach signed attestation envelopes to forks so capabilities can be verified offline from the artifact itself with expiry, revocation, and drift-aware gating.</td>
  </tr>
  <tr>
    <td align="center"><strong>🤖 Human + Agent Operable CLI</strong><br>The CLI is legible to both humans and agents, with discovery flows, structured commands, and reusable primitives that work through Claude Code, Cursor, Codex, and similar tools.</td>
    <td align="center"><strong>🧠 Local Intelligence</strong><br>Run local model flows, memory-aware reasoning, planning, normalization, summarization, and provider-flexible intelligence directly on the operator's machine.</td>
    <td align="center"><strong>🔌 Agent Harnesses</strong><br>Use first-class harness surfaces like Open Agents, Qwen Code, and T3 Code with secure auth storage, profile binding, and workspace-aware execution.</td>
  </tr>
  <tr>
    <td align="center"><strong>⚙️ Typed Workflows</strong><br>Saved workflows, templates, CMS node contracts, and dynamic pipelines are structured, versioned, inspectable, and increasingly reusable across environments.</td>
    <td align="center"><strong>🏢 Hosted Activation Layer</strong><br>Keep local open-source value first, then connect Growthub when you want hosted identity, workflow access, capability activation, and enterprise customization depth.</td>
    <td align="center"><strong>📈 Fleet + Operations Ready</strong><br>Manage multiple forks and environments with service status, job surfaces, health checks, background jobs, and operator-friendly lifecycle controls.</td>
  </tr>
</table>


**Problems Growthub Local solves**

| Without Growthub Local | With Growthub Local |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ❌ You find a useful repo, skill, or prompt pack, but turning it into a real working environment is manual, messy, and inconsistent.  | ✅ Turn a repo, skill, starter, or kit into a governed agent environment with a clear structure, policy, and lifecycle.                           |
| ❌ Every customization creates upgrade debt. The more you change, the harder it is to stay current with upstream improvements.        | ✅ Forks are first-class and self-healing. You keep your customizations while safely detecting, reviewing, and applying upstream changes.         |
| ❌ Your agent setup lives in scattered folders, prompts, scripts, and ad hoc configs with no real source of truth.                    | ✅ Each environment has a portable substrate with identity, policy, trace, and optional authority inside `.growthub-fork/`.                       |
| ❌ Repos, skills, and starter projects are disconnected things. You have to invent your own way to package, govern, and operate them. | ✅ GitHub repos, skills.sh skills, worker kits, and starter workspaces all flow into the same governed environment model.                         |
| ❌ Humans and agents both lose time figuring out what commands, configs, and workflows actually matter.                               | ✅ The CLI is designed to be legible to both humans and agents, with guided discovery, structured commands, and reusable environment primitives.  |
| ❌ Local experimentation is powerful, but it often breaks trust, governance, and team consistency.                                    | ✅ Local control stays first, while hosted identity, activation, and enterprise authority can be layered in when needed.                          |
| ❌ Teams end up with one-off environments that are hard to audit, transfer, or maintain across operators and machines.                | ✅ Environments are portable, trace-backed, and reconstructible, making handoff, audit, and long-term maintenance far easier.                     |
| ❌ Valuable workflows stay trapped in one person’s setup, one machine, or one prompt thread.                                          | ✅ Growthub Local turns workflows into reusable, governed infrastructure objects that can be shared, evolved, and operated over time.             |
| ❌ It is hard to know what is safe to automate versus what still needs human confirmation.                                            | ✅ Policy, confirmations, and capability gates make automation explicit, controlled, and safe by default.                                         |
| ❌ Open-source freedom usually means more maintenance burden, more drift, and more operational chaos.                                 | ✅ Growthub Local gives you open-source flexibility with self-healing lifecycle management, policy controls, and optional authority-backed trust. |

---

## The simplest mental model

```text
Discover source
  -> create environment
  -> register fork
  -> customize safely
  -> sync safely
  -> optionally activate hosted authority
```

Or more concretely:

```text
repo / skill / starter / kit
  -> local workspace
  -> governed fork
  -> self-healing lifecycle
  -> optional hosted identity + capability activation
```

---

## How it works

### The portable unit

A governed fork carries its own state in:

```text
<forkPath>/.growthub-fork/
├── fork.json
├── policy.json
├── trace.jsonl
└── authority.json   # when present
```

That means:

- `fork.json` = identity
- `policy.json` = operator contract
- `trace.jsonl` = append-only history
- `authority.json` = signed attestation when authority is attached

The canonical state lives in the artifact itself. Discovery indexes and CLI-owned homes are supporting surfaces, not the source of truth.

### The control-plane split

Growthub Local is intentionally split into:

- **local CLI / machine layer** for execution, forks, kits, workflows, and harnesses
- **hosted authority layer** for identity, connections, and higher-trust capability flows

---

## CLI surfaces

The CLI is multiple product surfaces, not one. The public docs and READMEs expose these core lanes:

- **Environment Management** — Local fork · Hosted account · Bridge health in one pane
- **Chat** — streaming conversational surface with slash commands wired into the CMS registry
- **Agent Harness**
- **Worker Kits**
- **Templates**
- **Workflows**
- **Local Intelligence**
- **Connect Growthub Account**

### Main commands

```bash
growthub
growthub discover

growthub environment
growthub environment snapshot --json
growthub capability refresh
growthub capability diff
growthub capability register ./my-extension.json

growthub chat
growthub chat "plan a post-launch recap video"

growthub authority show
growthub authority verify
growthub policy show
growthub policy check <slug>
growthub org show

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
<summary><strong>Command examples (accordion)</strong></summary>

### Discovery + first-run

```bash
growthub discover
```

Example:

```text
Growthub Local
-> Worker Kits / Templates / Workflows / Local Intelligence / Agent Harness / Settings
```

### Kits

```bash
growthub kit list
growthub kit inspect <kit-id>
growthub kit download <kit-id>
```

Example:

```text
Lists bundled kits, shows contract details, then materializes selected kit locally.
```

### Workflows + pipelines

```bash
growthub workflow
growthub pipeline assemble
```

Example:

```text
Select Saved Workflows, Templates, or Dynamic Pipelines and execute through hosted bridge lanes.
```

### Harness lanes

```bash
growthub open-agents
growthub qwen-code
```

Example:

```text
Run harness health/setup/prompt/session flows with local credential handling.
```

### Auth + activation bridge

```bash
growthub auth login
growthub auth whoami
```

Example:

```text
Attaches hosted identity/authority after local value is already established.
```
</details>

<details>
<summary><strong>Surface details (accordion)</strong></summary>

### Workflows

The workflow surface currently supports three paths:

- **Saved Workflows**
- **Templates**
- **Dynamic Pipelines**

Use workflows when you want typed orchestration over CMS-backed nodes and hosted execution.

Use repo import, skill import, kits, or starter workspaces when you want the fastest first-run environment creation.

### Harnesses

Growthub Local includes harness-first integration for:

- **Open Agents**
- **Qwen Code CLI**

These run through native CLI flows with secure local credential handling and guided setup/configuration surfaces.

</details>

---

## Forking and self-healing

Once a workspace is registered as a fork, you can keep customizing it without giving up the ability to stay current with upstream.

Growthub Local ships a policy-driven, trace-backed, self-healing fork sync agent that can:

- detect drift
- preview changes
- apply safe additive updates
- preserve protected paths
- use optional GitHub integration and draft PR flows
- maintain append-only trace of lifecycle events

This is the core promise:

**customize freely, without accepting decay as the price of customization**

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

### Start here

- [Growthub API v1](./docs/GROWTHUB_API_V1.md)
- [CMS Node Manifest Registry](./docs/CMS_NODE_MANIFEST_REGISTRY.md)
- [Node Input Form (rich configuration)](./docs/NODE_INPUT_FORM.md)
- [Enterprise Management Surface](./docs/ENTERPRISE_MANAGEMENT.md)
- [CLI Workflows Discovery V1](./docs/CLI_WORKFLOWS_DISCOVERY_V1.md)
- [Growthub Authentication Bridge](./docs/GROWTHUB_AUTH_BRIDGE.md)
- [Worker Kits Overview](./docs/WORKER_KITS.md)

### Architecture and protocol

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
