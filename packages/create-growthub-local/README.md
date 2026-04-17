# create-growthub-local

`create-growthub-local` is the guided installer for Growthub Local.

## Quickstart

```bash
# Interactive (recommended) — opens the Growthub discovery hub
npm create growthub-local@latest

# Paperclip Local App — direct profile install
npm create growthub-local@latest -- --profile gtm
npm create growthub-local@latest -- --profile dx

# Custom Workspace Starter — fork a single worker kit in one command
npm create growthub-local@latest -- --profile workspace --out ./my-workspace
```

## Installer Paths

- **Discovery mode** (no `--profile`)
  - opens `growthub discover` so you can pick:
    - Worker Kits
    - Templates
    - Workflows
    - Local Intelligence
    - Agent Harness
    - ⚙️  Settings — GitHub, Fork Sync, Service Status, **Custom Workspace Starter**, Fleet Operations, Connect Growthub Account
- **Paperclip Local App mode** (`--profile gtm|dx`)
  - runs direct onboarding for the selected local app profile
  - seeds `./growthub-local/` (or `--data-dir`) with a full local Growthub install
- **Custom Workspace Starter mode** (`--profile workspace`)
  - forwards to `growthub starter init` — scaffolds a single worker kit workspace, auto-registers it as a kit-fork, seeds a conservative policy, and writes the first trace events
  - does NOT touch the Paperclip Local App surface — this is for users who only want to fork one kit

## Options

### Common

| Flag | Description |
|---|---|
| `--profile gtm\|dx\|workspace` | Optional direct install path |
| `-h`, `--help` | Show usage |

### Paperclip Local App (`--profile gtm` or `--profile dx`)

| Flag | Description |
|---|---|
| `--run` | Start local runtime immediately after onboarding |
| `--data-dir <path>` | Override install directory (default: `./growthub-local`) |
| `--config <path>` | Use a custom config path |

### Custom Workspace Starter (`--profile workspace`)

| Flag | Description |
|---|---|
| `--out <path>` | Destination for the new workspace (default: `./my-workspace`) |
| `--name <label>` | Friendly label for the fork |
| `--upstream <owner/repo>` | Also create a first-party GitHub fork remote |
| `--destination-org <org>` | Create the GitHub fork under an org |
| `--fork-name <name>` | Override the GitHub fork name |
| `--remote-sync-mode <off\|branch\|pr>` | Initial `policy.remoteSyncMode` (default: `off`) |
| `--kit <kit-id>` | Source kit id (advanced; defaults to `growthub-custom-workspace-starter-v1`) |
| `--json` | Emit machine-readable JSON (passed through to `growthub starter init`) |

## Examples

### Fresh install with a guided hub

```bash
npm create growthub-local@latest
```

### Full Paperclip Local App install and launch

```bash
npm create growthub-local@latest -- --profile gtm --run
```

### Single-kit workspace, purely local

```bash
npm create growthub-local@latest -- --profile workspace \
  --out ./my-workspace \
  --name "My GTM Workspace"
```

### Single-kit workspace with GitHub fork + draft PRs

```bash
npm create growthub-local@latest -- --profile workspace \
  --out ./my-workspace \
  --upstream octocat/my-workspace \
  --remote-sync-mode pr
```

### Scripting / CI

```bash
npm create growthub-local@latest -- --profile workspace \
  --out ./ws --json
```

## After Install

### Paperclip Local App

```bash
cd growthub-local
npx growthub run
```

Open CLI discovery again:

```bash
npx growthub
```

### Custom Workspace Starter

```bash
cd my-workspace
growthub kit fork list
growthub kit fork status <fork-id>
growthub fleet view
```

## Requirements

- Node.js 20+
- npm 7+

## Links

- [Growthub Local](https://github.com/Growthub-ai/growthub-local)
- [@growthub/cli package docs](https://github.com/Growthub-ai/growthub-local/tree/main/cli)
- [Custom Workspace Starter Kernel Packet](https://github.com/Growthub-ai/growthub-local/blob/main/docs/kernel-packets/KERNEL_PACKET_CUSTOM_WORKSPACE_STARTER.md)
- [Self-Healing Fork Sync Agent Kernel Packet](https://github.com/Growthub-ai/growthub-local/blob/main/docs/kernel-packets/KERNEL_PACKET_FORK_SYNC_AGENT.md)
