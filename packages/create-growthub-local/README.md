# create-growthub-local

`create-growthub-local` is the guided installer for Growthub Local.

## Quickstart

```bash
# Interactive (recommended)
npm create growthub-local@latest

# Direct profile install
npm create growthub-local@latest -- --profile gtm
npm create growthub-local@latest -- --profile dx
```

## Installer Paths

- **Profile mode** (`--profile gtm|dx`)
  - runs direct onboarding for the selected local app profile
- **Discovery mode** (no profile)
  - opens `growthub discover` so users can choose:
    - Agent Harness
    - Worker Kits
    - Templates

## Options

| Flag | Description |
|---|---|
| `--profile gtm\|dx` | Optional direct install path for local app profiles |
| `--run` | Start local runtime immediately after onboarding |
| `--data-dir <path>` | Override install directory (default: `./growthub-local`) |
| `--config <path>` | Use a custom config path |

## After Install

```bash
cd growthub-local
npx growthub run
```

Open CLI discovery again:

```bash
npx growthub
```

## Requirements

- Node.js 20+
- npm 7+

## Links

- [Growthub Local](https://github.com/Growthub-ai/growthub-local)
- [@growthub/cli package docs](https://github.com/Growthub-ai/growthub-local/tree/main/cli)
