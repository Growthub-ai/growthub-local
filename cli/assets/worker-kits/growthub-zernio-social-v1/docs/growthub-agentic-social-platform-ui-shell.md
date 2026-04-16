# Growthub Agentic Social Media Platform — Exported UI Shell

This document is the source of truth for the UI shell that ships inside the exported `growthub-zernio-social-v1` worker kit.

**Read order:** `../runtime-assumptions.md` → `./zernio-api-integration.md` → this file.

---

## Truth Boundary

- The user exports this worker kit from the CLI.
- After export, the user works inside the exported folder, not inside the CLI repo.
- The UI shell lives at `studio/` inside that exported folder.
- The rest of the exported worker kit remains the execution contract for setup, templates, agent law, and Zernio API behavior.

This keeps the Vite shell fully isolated inside the exported worker-kit workspace.

---

## Exported Workspace Shape

```text
growthub-agent-worker-kit-zernio-social-v1/
  QUICKSTART.md
  kit.json
  setup/
  docs/
  workers/
  templates/
  studio/
    package.json
    vite.config.js
    src/
```

The user-facing UI setup starts in `studio/`. The worker-kit root remains the source of truth for setup scripts, templates, and the Zernio operator contract.

---

## Launch Flow

From the exported worker-kit folder:

```bash
cd studio
npm install
```

Create `studio/.env` with:

```bash
VITE_ZERNIO_API_URL=https://zernio.com/api/v1
VITE_ZERNIO_API_KEY=<your-zernio-api-key>
VITE_ZERNIO_PROFILE_ID=<your-profile-id>
```

Then start the UI shell:

```bash
cd studio
npm run dev
```

Default local URL:

```text
http://127.0.0.1:5173
```

The UI shell is validated from the exported folder itself. Do not use the CLI repo copy as the runtime workspace for the end user.

---

## What The UI Shell Covers

The exported Growthub UI shell owns these surfaces:

- Dashboard
- Accounts
- Compose
- Scheduled
- Queues
- Analytics
- Templates
- Comment Rules
- Sequences
- Automations
- Agent / Swarm
- API Keys

The Zernio worker kit owns the transport, setup scripts, API contract, and agent workflow that sit behind those screens.

---

## Comment Automation Scope

The validated comment automation surface in the UI shell is:

- post-bound comment automation
- keyword-triggered comment detection
- optional public comment reply
- optional DM lead magnet message
- CRUD for comment automations
- activation / pause control
- automation logs
- account-connect prompts for Instagram and Facebook

The canonical API surface for that flow is `POST /api/v1/comment-automations` plus the related read, update, delete, and logs endpoints documented in the exported UI source.

---

## Validation Contract

For this UI shell to be considered valid inside the worker kit:

- the exported folder contains `studio/`
- `studio/package.json` and `studio/vite.config.js` exist
- the user can run `npm install` and `npm run dev` from the exported `studio/` folder
- the UI can be configured with `VITE_ZERNIO_API_URL`, `VITE_ZERNIO_API_KEY`, and `VITE_ZERNIO_PROFILE_ID`
- the UI shell remains isolated to the exported worker-kit workspace
- no external paired UI kit is required for the Zernio kit's UI truth

---

## Non-Goals

This document does not describe:

- a main-app integration inside the CLI repo
- a custom Agent Harness
- a new adapter registry entry
- a provider SDK install path

Those are intentionally out of scope for this exported worker-kit UI shell.
