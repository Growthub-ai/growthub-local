# create-growthub-local

`create-growthub-local` is the guided installer for Growthub Local.

It now handles three lanes in one command, so a fresh user can get either the
Paperclip Local App or a Custom Workspace Starter workspace in a single step —
no second `growthub starter init` call required.

## Quickstart

```bash
# Interactive discovery hub (kits / templates / workflows / agent harness / settings)
npm create growthub-local@latest

# Paperclip Local App profiles
npm create growthub-local@latest -- --profile gtm
npm create growthub-local@latest -- --profile dx

# Custom Workspace Starter (zero second step — scaffolds + registers as a fork)
npm create growthub-local@latest -- --profile workspace --out ./my-workspace
```

## Installer Paths

- **Paperclip Local App** (`--profile gtm|dx`)
  - runs `growthub onboard --yes` for the selected surface profile
- **Custom Workspace Starter** (`--profile workspace`)
  - runs `growthub starter init --out <path>` against the bundled
    `growthub-custom-workspace-starter-v1` kit
  - composes the already-shipping primitives — `copyBundledKitSource`,
    `registerKitFork`, `writeKitForkPolicy`, `appendKitForkTraceEvent`,
    and (optionally) `createFork` via the first-party GitHub integration
  - no cross-package coupling beyond the existing `@growthub/cli` dep pin
- **Discovery mode** (no profile)
  - opens `growthub discover` so users can pick Worker Kits, Templates,
    Workflows, Local Intelligence, Agent Harness, Settings, or Help

## Options

| Flag | Applies to | Description |
|---|---|---|
| `--profile gtm\|dx\|workspace` | all | Pick an install lane |
| `--run` | `dx`, `gtm`, discovery | Start Growthub immediately after saving config |
| `--data-dir <path>` | `dx`, `gtm`, discovery | Override install directory (default: `./growthub-local`) |
| `--config <path>` | `dx`, `gtm`, discovery | Use a custom config path |
| `--out <path>` | `workspace` | Destination directory for the new workspace |
| `--kit <kit-id>` | `workspace` | Source kit id (default: `growthub-custom-workspace-starter-v1`) |
| `--name <label>` | `workspace` | Human label for the fork |
| `--upstream <owner/repo>` | `workspace` | When set, also creates a remote GitHub fork |
| `--destination-org <org>` | `workspace` | Create the GitHub fork under an org |
| `--fork-name <name>` | `workspace` | Override the GitHub fork name |
| `--remote-sync-mode <mode>` | `workspace` | Initial `policy.remoteSyncMode` — `off` (default), `branch`, `pr` |
| `--json` | `workspace` | Emit machine-readable output from `growthub starter init` |

## After install — Paperclip Local App

```bash
cd growthub-local
npx growthub run
```

## After install — Custom Workspace Starter

```bash
cd my-workspace

# Inspect your new fork (registration + policy + trace)
npx growthub kit fork status <fork-id>

# Re-open the discovery hub any time
npx growthub
```

## Requirements

- Node.js 20+
- npm 7+

## Links

- [Growthub Local](https://github.com/Growthub-ai/growthub-local)
- [@growthub/cli package docs](https://github.com/Growthub-ai/growthub-local/tree/main/cli)
