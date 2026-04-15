# Growthub Local

Growthub Local is the source-of-truth repo for the local Growthub runtime and the CLI surfaces that open through the current discovery hub.

The documented discovery entrypoint for this repo is:

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
```

That discovery hub exposes:

- `Full Local App`
- `Worker Kits`
- `Templates`
- `Workflows`
- `Local Intelligence`
- `Connect Growthub Account`
- `Help CLI`

## Install

### Full local app: GTM

```bash
npm create growthub-local@latest -- --profile gtm
```

### Full local app: DX

```bash
npm create growthub-local@latest -- --profile dx
```

### CLI-first access

```bash
npm install -g @growthub/cli
```

## Discovery-first workflow

Open the discovery hub with:

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
```

The current discovery menu is defined in `cli/src/index.ts`.

### 1. Full Local App

Use this path when you want to create or reopen a full local Growthub surface.

Entry points:

```bash
growthub onboard
growthub run
```

### Worker Kits

Use this path when you want the current worker-kit discovery and export flow from the CLI.

Entry points:

```bash
growthub kit
growthub kit list
growthub kit inspect creative-strategist-v1
growthub kit download creative-strategist-v1
growthub kit path creative-strategist-v1
growthub kit validate /absolute/path/to/kit
```

Current discovery flow:

1. Open discovery.
2. Choose `Worker Kits`.
3. Browse, inspect, and export the kit you need.

### Templates

Use this path when you want the shared template library.

Entry points:

```bash
growthub template
growthub template list
growthub template list --type ad-formats
growthub template list --type scene-modules --subtype hooks
growthub template get villain-animation
```

Current discovery flow:

1. Open discovery.
2. Choose `Templates`.
3. Browse and extract the artifact you need.

### Workflows

Use this path when you want CMS node contract discovery, dynamic pipeline creation, and saved workflow lifecycle actions.

Entry points:

```bash
growthub workflow
growthub workflow saved
growthub pipeline assemble
```

Current discovery flow:

1. Open discovery.
2. Choose `Workflows`.
3. Authenticate if the workflow surface is locked.
4. Choose:
   - `CMS Node Contracts` for contract discovery and per-node contract inspection
   - `Dynamic Pipelines` for hosted pipeline assembly/save/execute
   - `Saved Workflows` for execute/archive/delete lifecycle actions

Read the workflow extension doc here:

- [CLI Workflows Discovery V1](./docs/CLI_WORKFLOWS_DISCOVERY_V1.md)

### Local Intelligence

Use this path when you want local native-intelligence adapters for human prompt chat and workflow intelligence assistance (planner, normalizer, recommender, summarizer).

Entry points:

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
growthub discover
```

Current discovery flow:

1. Open discovery.
2. Choose `🧠 Local Intelligence`.
3. Choose one of:
   - `Setup helper` to validate OS/runtime/model status
   - `Manage local custom models` to set an active favorite model
   - `Prompt local model (chat flow)` for human-first local chat
   - `Run native-intelligence with your prompt` for planner/normalizer/recommender/summarizer runs

Read the architecture and adapter model here:

- [Local Native-Intelligence Architecture](./docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md)
- [Gemma Setup and Validation](./docs/native-intelligence-gemma-setup.md)

### Connect Growthub Account

Use this path when you want to connect the local CLI to a hosted Growthub account.

Entry points:

```bash
growthub auth login
growthub auth whoami
growthub auth logout
growthub profile status
growthub profile pull
growthub profile push
```

Current discovery flow:

1. Open discovery.
2. Choose `Connect Growthub Account`.
3. Complete the hosted browser login flow.
4. Return to the CLI with the linked session.

## Source development

From the repo root, use the canonical runtime control path:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh status
scripts/runtime-control.sh stop
```

If the API is listening on `3101`, set:

```bash
GH_SERVER_PORT=3101 scripts/runtime-control.sh up-main
```

Typical GTM URL:

```text
http://localhost:5173/gtm/GHA/workspace
```

## Contributor docs

- [Contributing](./CONTRIBUTING.md)
- [CLI Workflows Discovery V1](./docs/CLI_WORKFLOWS_DISCOVERY_V1.md)
- [Growthub Authentication Bridge](./docs/GROWTHUB_AUTH_BRIDGE.md)
- [Worker Kits Overview](./docs/WORKER_KITS.md)
- [Custom Workspace Kernel Packet](./docs/KERNEL_PACKET_CUSTOM_WORKSPACES.md)
- [Local Native-Intelligence Architecture](./docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md)

## Architecture snapshot (validated)

The current repo snapshot is frozen around this split:

- CLI/open-source lane: discovery UX, command behavior, and contribution docs
- maintainer/super-admin lane: merge governance, release timing, and npm publish operations

For contributor-facing work, stay in the CLI/open-source lane unless a maintainer explicitly asks for release/admin updates.
