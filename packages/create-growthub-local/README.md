# create-growthub-local

Install and run a local Growthub instance — GTM or DX surface — in one command.

## Usage

**Go-to-Market surface:**

```bash
npm create growthub-local@latest -- --profile gtm
```

**DX (Developer Experience) surface:**

```bash
npm create growthub-local@latest -- --profile dx
```

Both commands install the local runtime into a `growthub-local/` folder in your current directory, onboard a fresh instance, and start the server.

## Options

| Flag | Description |
|---|---|
| `--profile gtm\|dx` | Required. Selects the surface to install. |
| `--run` | Start the server immediately after install. |
| `--data-dir <path>` | Custom directory for instance data (default: `./growthub-local`). |
| `--config <path>` | Path to a custom config file. |

## What happens

1. Installs `@growthub/cli` and provisions a local instance
2. Starts an embedded PostgreSQL database on an auto-selected port
3. Serves the local UI at `http://localhost:3100` (GTM) or `http://localhost:3101` (DX)
4. Opens the Growthub Connection card — complete auth to bridge to hosted Growthub

For GTM installs, browser-agent execution is issue-bound through heartbeat. Concurrent browser agents can run on distinct runtime browser slots when launched from real assigned issues.

## Starting again after install

```bash
cd growthub-local
npx growthub start
```

## Upgrading

```bash
cd growthub-local
npx growthub upgrade
```

Upgrades the CLI and server in place. Runs any pending migrations. No data loss.

## Running two surfaces

Each surface needs its own directory:

```bash
mkdir gtm-fresh && cd gtm-fresh
npm create growthub-local@latest -- --profile gtm --run

mkdir dx-fresh && cd dx-fresh
npm create growthub-local@latest -- --profile dx --run
```

Each instance gets an isolated database and port. They share no state.

## Requirements

- Node.js 20 or later
- npm 7 or later (for `npm create`)

## Links

- [GitHub](https://github.com/antonioromero1220/growthub-local)
- [Contributing](https://github.com/antonioromero1220/growthub-local/blob/main/CONTRIBUTING.md)
- [Frozen browser isolation snapshot](https://github.com/antonioromero1220/growthub-local/blob/main/docs/FROZEN_GTM_BROWSER_AGENT_ISOLATION_STATE.md)
- [Issues](https://github.com/antonioromero1220/growthub-local/issues)
