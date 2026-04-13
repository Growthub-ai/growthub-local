# create-growthub-local

`create-growthub-local` is the guided installer for Growthub Local.

It supports two installer paths:

- profile-driven install for `gtm` or `dx`
- interactive discovery mode when no profile is passed

## Usage

### Install GTM directly

```bash
npm create growthub-local@latest -- --profile gtm
```

### Install DX directly

```bash
npm create growthub-local@latest -- --profile dx
```

### Open the interactive discovery hub

```bash
npm create growthub-local@latest
```

When no `--profile` is passed, the installer launches `growthub discover` so the user can choose between:

- full local app
- worker kits
- shared templates

## CLI Edition User Flows

### 1. Full Local App

If `--profile gtm` or `--profile dx` is passed, the installer runs a direct onboarding path for that surface.

Flow:

1. Resolve the bundled or installed `@growthub/cli` entrypoint.
2. Run `growthub onboard --yes`.
3. Save the new instance under the selected data directory.
4. Start the local runtime when `--run` is passed.

### 2. Interactive discovery mode

If no profile is passed, the installer defers to `growthub discover`.

Flow:

1. Launch the CLI discovery hub.
2. Choose `Full Local App`, `Worker Kits`, or `Templates`.
3. Continue inside the matching CLI workflow.

This is the correct path when the user does not yet know whether they want a full app install, a worker kit export, or a shared template pull.

## Options

| Flag | Description |
|---|---|
| `--profile gtm\|dx` | Optional. If provided, install that local app surface directly. |
| `--run` | Start the local runtime immediately after onboarding. |
| `--data-dir <path>` | Override the install data directory. Default: `./growthub-local`. |
| `--config <path>` | Use a custom config path. |

## What The Installer Actually Does

1. Resolves the `@growthub/cli` binary, preferring the local repo build when available.
2. Sets installer mode with `GROWTHUB_INSTALLER_MODE=true`.
3. If a profile is passed, sets `PAPERCLIP_SURFACE_PROFILE` and runs `growthub onboard --yes`.
4. If no profile is passed, runs `growthub discover`.

## Starting Again After Install

If you installed a full local app:

```bash
cd growthub-local
npx growthub run
```

If you want the interactive CLI again:

```bash
npx growthub
```

## Requirements

- Node.js 20 or later
- npm 7 or later

## Links

- [GitHub](https://github.com/Growthub-ai/growthub-local)
- [CLI package](https://github.com/Growthub-ai/growthub-local/tree/main/cli)
- [Contributing](https://github.com/Growthub-ai/growthub-local/blob/main/CONTRIBUTING.md)
