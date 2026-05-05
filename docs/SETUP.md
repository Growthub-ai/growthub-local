# Setup

This document covers the canonical setup path for Growthub Local.

## Quick start (one command)

```bash
npm create @growthub/growthub-local@latest
```

This opens the guided installer. Choose **Create Governed Workspace**, then pick your source type.

## Alternate: direct workspace profile

```bash
npm create @growthub/growthub-local@latest -- --profile workspace --out ./my-workspace
```

Skips the menu and materialises the workspace starter directly into `./my-workspace`.

## Alternate: CLI-only install

```bash
npm install -g @growthub/cli
growthub starter init --out ./my-workspace
```

## Requirements

- Node.js >= 20
- npm >= 9

## What you get

After installation you have:

```
my-workspace/
├── apps/workspace/          ← Next.js Workspace Builder
│   ├── growthub.config.json ← live workspace config
│   └── ...
├── .growthub-fork/          ← fork identity + governance
├── SKILL.md                 ← agent routing entry
├── AGENTS.md                ← agent contract
└── ...
```

## First run

```bash
cd my-workspace/apps/workspace
npm install
npm run dev
# open http://localhost:3000
```

See [`docs/QUICKSTART_WORKSPACE.md`](./QUICKSTART_WORKSPACE.md) for a step-by-step walkthrough.

## Package versions

- `@growthub/cli`: 0.9.8
- `@growthub/create-growthub-local`: 0.5.8
- `@growthub/api-contract`: 1.3.0-alpha.2

Do not hardcode these. Always read from `cli/package.json` and `docs/ARTIFACT_VERSIONS.md` for the current version.
