# @growthub/create-growthub-local

`@growthub/create-growthub-local` is the guided installer for Growthub Local.

It is designed for immediate value first: choose a profile, create a usable local environment, then optionally activate hosted lanes later.

## Quickstart

```bash
npm create growthub-local@latest
```

## Profile-first install

The installer offers profile selection before command/harness depth:

```bash
npm create growthub-local@latest -- --profile gtm
npm create growthub-local@latest -- --profile dx
npm create growthub-local@latest -- --profile workspace --out ./my-workspace
npm create growthub-local@latest -- --profile workspace --out ./my-workspace --with canvas,chat,workflow,artifacts
```

## First-run outcomes

After install, users typically choose one of these six outcomes:

1. import a GitHub repo into a governed workspace
2. import a skills.sh skill into a governed workspace
3. start from a custom workspace starter
4. download a worker kit
5. connect Growthub account after local value is proven
6. optionally activate upgrade path for hosted depth

## Installer options

| Flag | Applies to | Description |
|---|---|---|
| `--profile gtm\|dx\|workspace` | all | Pick an install profile |
| `--run` | `dx`, `gtm`, discovery | Start Growthub immediately after config |
| `--data-dir <path>` | `dx`, `gtm`, discovery | Override install directory (default: `./growthub-local`) |
| `--config <path>` | `dx`, `gtm`, discovery | Use a custom config path |
| `--out <path>` | `workspace` | Destination for workspace scaffold |
| `--kit <kit-id>` | `workspace` | Source kit id (default: `growthub-custom-workspace-starter-v1`) |
| `--name <label>` | `workspace` | Human label for fork registration |
| `--upstream <owner/repo>` | `workspace` | Optionally create remote GitHub fork |
| `--destination-org <org>` | `workspace` | Create fork under org |
| `--fork-name <name>` | `workspace` | Override GitHub fork name |
| `--remote-sync-mode <mode>` | `workspace` | Initial policy mode: `off`, `branch`, `pr` |
| `--with <features>` | `workspace` | Composition primitives to mark active in the scaffold: `canvas`, `chat`, `workflow`, `artifacts` |
| `--json` | `workspace` | Emit machine-readable output |

## Post-install examples

```bash
# Re-open the CLI discovery hub
npx growthub discover

# Run local app runtime
npx growthub run
```

## Optional upgrade activation

Local value comes first. Activation is optional and additive:

[![Activate on Growthub](https://img.shields.io/badge/Activate-Growthub-111827?style=for-the-badge)](https://www.growthub.ai/)
[![First Month](https://img.shields.io/badge/First%20Month-%241-22c55e?style=for-the-badge)](https://www.growthub.ai/)

## Requirements

- Node.js 20+
- npm 7+

## Links

- [Growthub Local README](https://github.com/Growthub-ai/growthub-local#readme)
- [@growthub/cli package docs](https://github.com/Growthub-ai/growthub-local/tree/main/cli)
- [Contributing](https://github.com/Growthub-ai/growthub-local/blob/main/CONTRIBUTING.md)
