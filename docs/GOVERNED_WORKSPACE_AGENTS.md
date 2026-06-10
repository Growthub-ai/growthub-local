# Governed Workspace Agents

Governed Workspace Agents attach hosted Growthub Agent Builder agents to a fork-sync governed workspace.

The hosted agent is not just a remote command. It is a typed orchestration manifest: instructions, model configuration, workflow bindings, knowledge sources, variables, triggers, diagnostics, and resolved slugs. The local CLI lets a governed workspace claim that manifest as part of its operating surface while execution stays in Growthub.

For local governed agent swarms created inside the exported workspace app, use the `0.14.1` [Governed Agent Swarm Cockpit Value Map V1](./GOVERNED_AGENT_SWARM_COCKPIT_VALUE_MAP_V1.md). Those swarms are sandbox-environment workflow rows executed through `POST /api/workspace/sandbox-run`; they are not hosted agent bindings.

## What This Gives You

- A workspace-level agent catalog sourced from the user's authenticated Growthub account.
- A safe inspection path before attaching orchestration capability to a workspace.
- Composable building blocks for higher-level agents: workflow bindings, knowledge bindings, variables, triggers, model settings, diagnostics, and source status.
- A local governance record inside the fork-sync workspace:

```text
<forkPath>/.growthub-fork/agents/<agent-slug>.json
```

- Machine-readable control for coding agents through the same CLI commands users trust.
- No local execution of the hosted agent.

## Definitions

**Governed workspace**

A workspace registered with fork sync. Its source of truth lives in `.growthub-fork/`.

**Governed Workspace Agent**

A hosted Growthub agent attached to a fork-sync governed workspace by a local binding file.

**Agent manifest**

The typed orchestration contract returned by Growthub. It describes what the hosted agent is, what it can use, how its sources resolve, and whether Growthub sees warnings or diagnostics. It is the shared shape used by the hosted app, SDK, CLI, and coding agents.

**Workspace binding**

The local record that says this governed workspace is allowed to use this hosted agent manifest. The binding stores the fork id, kit id, workspace path, manifest snapshot, diagnostics, and execution authority.

**Growthub bridge**

The authenticated CLI connection to Growthub. It is the transport for listing and inspecting hosted agents.

**Execution authority**

Hosted execution stays in `gh-app`. Binding an agent does not run it locally.

## Quick Start

1. Connect Growthub:

```bash
growthub auth login
growthub auth whoami
```

2. Confirm you have a fork-sync workspace:

```bash
growthub kit fork list
```

3. List available agents:

```bash
growthub bridge agents list --json
```

4. Inspect one agent:

```bash
growthub bridge agents inspect <agent-slug> --json
```

5. Bind it to a governed workspace:

```bash
growthub bridge agents bind <agent-slug> --fork-id <fork-id> --json
```

6. Confirm the workspace bindings:

```bash
growthub bridge agents bindings --fork-id <fork-id> --json
```

## Discovery CLI

In the interactive CLI:

```bash
growthub discover
```

Open:

```text
Settings
  -> Governed Workspace Agents
```

This appears after Growthub connection is active.

The placement is intentional. Governed Workspace Agents depend on an active Growthub connection and an existing fork-sync workspace, so they live under Settings with the Growthub connection surface instead of polluting the first discovery screen.

## Manage Bindings

List bindings:

```bash
growthub bridge agents bindings --fork-id <fork-id> --json
```

Remove a binding:

```bash
growthub bridge agents unbind <agent-slug> --fork-id <fork-id> --json
```

Unbinding removes only the local workspace binding file. It does not delete or modify the hosted agent.

## Binding Record

Each binding records:

- agent slug and display name
- fork id and kit id
- workspace path
- bridge source
- `executionAuthority: "gh-app"`
- `localExecution: false`
- diagnostics and warnings from Growthub
- the hosted manifest snapshot

That snapshot is what lets coding agents reason over the same orchestration building blocks the user sees: which hosted agent is attached, which workspace owns the binding, which sources are healthy, and which warnings must be respected before the agent is used.

## Safety Model

- Prefer `--fork-id` for production use.
- The CLI refuses unregistered workspace paths unless `--allow-local` is passed.
- Local-only bindings are useful for testing, but fork-sync registration is the enterprise-ready path.
- Hosted agent execution remains in Growthub.
