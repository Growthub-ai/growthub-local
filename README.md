# Growthub Local

Local Growthub runtime for DX and Go-to-Market.

`Growthub Local` is the installable local product that runs on a user's machine and connects back to the hosted Growthub app.

It owns:

- the GTM local surface
- the DX local surface
- the local CLI
- the local server
- the local UI
- the local installer packages

## Install

For Go-to-Market:

```bash
npm create growthub-local@latest -- --profile gtm
```

For DX:

```bash
npm create growthub-local@latest -- --profile dx
```

## What Happens Next

1. Install the local app from npm.
2. Launch the local app.
3. Open the `Growthub Connection` card.
4. Click `Open Configuration`.
5. Complete authentication in hosted Growthub.
6. Return to the local app callback.
7. Use `Pulse` to verify the hosted bridge is live.

## Profiles

- `gtm`: local Go-to-Market surface
- `dx`: local DX tool surface

## Packages

This repo is the source of truth for:

- `@growthub/cli`
- `create-growthub-local`

## Development

This repository is the dedicated home for the local runtime product boundary. Hosted Growthub application code lives separately.

### Canonical dev loop

Start backend and UI from source in two terminals:

```bash
# Terminal 1 — backend watch
pnpm --dir server run dev:watch

# Terminal 2 — UI dev server (HMR)
pnpm --dir ui run dev
```

Then open the surface you are working on:

```bash
# GTM
http://127.0.0.1:5173/gtm/<COMPANY_PREFIX>/workspace

# DX
http://127.0.0.1:5173/dx/...
```

Verify both are healthy before validating any feature:

```bash
curl http://127.0.0.1:3101/api/health
curl http://127.0.0.1:5173/api/health
```

### Pre-push gate

Before pushing any branch:

```bash
bash scripts/pr-ready.sh
```

Validates branch naming, remote origin, version consistency, dist artifacts, and release contracts in one shot.

### Isolated worktrees

For isolated development environments with their own database, port, and session state:

```bash
growthub worktree:make my-feature
```

Each worktree gets its own server port (3101+) and embedded Postgres instance. Your main instance stays untouched.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

## Contributing

Growthub Local is open source and built to be extended — by humans and AI agents alike.

```bash
# Fork this repo, then:
git checkout -b feat/your-feature
# make changes
git commit -m "feat(server): your change"
git push origin feat/your-feature
# open a PR — CI runs automatically
```

**Branch prefixes:** `feat/` `fix/` `docs/` `chore/` `ci/` `refactor/` `adapter/` `sync/`

**PR titles:** must follow [Conventional Commits](https://www.conventionalcommits.org/) — `type(scope): description`

**All PRs require** passing CI (`verify` + `validate` + `smoke`) and maintainer review before merge. Agent-submitted PRs are fully supported — the pipeline auto-detects bot actors and labels them `agent-pr`.

See [**CONTRIBUTING.md**](./CONTRIBUTING.md) for the full workflow.
