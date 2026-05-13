# Setup

One canonical setup path. Every other doc points here.

---

## Install

```bash
npm create @growthub/growthub-local@latest
```

This is the official path. It runs the guided installer (`@growthub/create-growthub-local`), which pins to the matching `@growthub/cli` version on disk.

### Power-user one-liners

```bash
# Curl installer (wraps npm create)
curl -fsSL https://raw.githubusercontent.com/Growthub-ai/growthub-local/main/scripts/install.sh | bash

# Direct kit export of the official starter
npx -p @growthub/cli@latest growthub kit download growthub-custom-workspace-starter-v1 --out ./my-workspace

# CLI-only install (no guided installer)
npm install -g @growthub/cli
```

### Direct profile install

```bash
npm create @growthub/growthub-local@latest -- --profile workspace --out ./my-workspace
npm create @growthub/growthub-local@latest -- --profile self-improving --out ./my-workspace
npm create @growthub/growthub-local@latest -- --profile gtm
npm create @growthub/growthub-local@latest -- --profile dx
```

---

## Open the Workspace Builder

```bash
cd <workspace>/apps/workspace
npm install
npm run dev
```

The builder runs at `http://localhost:3000`. It is config-backed, template-aware, import/export capable, and bounded away from hosted execution in the browser. See [`docs/WORKSPACE_BUILDER_RUNTIME_V1.md`](./WORKSPACE_BUILDER_RUNTIME_V1.md).

---

## Verify

```bash
growthub --version                  # version stamp
growthub kit health . --json        # kit shape
growthub skills validate            # SKILL.md frontmatter + paths
growthub workspace deploy status    # readiness check
```

---

## Versions

Always read versions from these files on your branch — never quote from memory:

| Artifact | File | Field |
| --- | --- | --- |
| `@growthub/cli` | `cli/package.json` | `version` |
| `@growthub/create-growthub-local` | `packages/create-growthub-local/package.json` | `version` |
| Installer pin to CLI | `packages/create-growthub-local/package.json` | `dependencies["@growthub/cli"]` |
| `@growthub/api-contract` | `packages/api-contract/package.json` | `version` |

CI `smoke` enforces the installer pin matches `cli/package.json` exactly (monorepo clones use `workspace:*` for that dependency).

See [`docs/ARTIFACT_VERSIONS.md`](./ARTIFACT_VERSIONS.md) for the grounding rule.

---

## Where to go next

- [`docs/QUICKSTART_WORKSPACE.md`](./QUICKSTART_WORKSPACE.md) — 30-second mental model + first edit
- [`docs/WORKSPACE_STARTER_ACTIVATION_PATH.md`](./WORKSPACE_STARTER_ACTIVATION_PATH.md) — full activation walkthrough
- [`docs/SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md`](./SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md) — source-type matrix
- [`docs/WORKSPACE_DEPLOY_FLOW.md`](./WORKSPACE_DEPLOY_FLOW.md) — deploy primitives end-to-end
- [`docs/FIRST_RUN_PATHS.md`](./FIRST_RUN_PATHS.md) — five fast first-run paths
