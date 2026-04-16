# growthub-core — Agent Swarm Command Center

> Growthub is a full-featured DX platform for orchestrating AI agent swarms across sequential ticket pipelines.

---

## Install

```bash
npx create-growthub-local --profile dx
```

Later:

```bash
npx create-growthub-local --profile gtm
```

## Worker Kits V1

The CLI ships a bundled Worker Kit export surface for local adapter environments.
These kits are not server installs or database records. They are frozen, working-directory-ready
artifacts that local adapters can run inside directly.

They should be understood as packaged execution environments. A kit can carry prompts, templates, examples, output standards, and local runtime assumptions together as one reusable environment.

```bash
growthub kit list
growthub kit inspect creative-strategist-v1
growthub kit inspect growthub-open-higgsfield-studio-v1
growthub kit download creative-strategist-v1
growthub kit download growthub-open-higgsfield-studio-v1
growthub kit path creative-strategist-v1
growthub kit validate /absolute/path/to/kit
```

### Fork sync and self-heal

Once a worker kit has been exported and customized locally, the CLI can keep
the fork in sync with future upstream updates without overwriting your
customizations. The sync surface captures a baseline snapshot, previews drift,
and runs a self-healing job that safely applies upstream updates,
package.json-aware merges, and escalates any true conflicts for human review.

```bash
growthub kit sync init creative-strategist-v1 --fork /absolute/path/to/fork --as my-fork
growthub kit sync list
growthub kit sync plan my-fork
growthub kit sync start my-fork --auto-apply
growthub kit sync status my-fork
growthub kit sync jobs my-fork
growthub kit sync report my-fork
growthub kit discover
```

Sync state, baseline snapshots, logs, and reports live under
`$PAPERCLIP_HOME/kits/sync/<fork-id>/` so they stay reproducible across
sessions and isolated from the worker kit export root. Pass `--detach` to
`kit sync start` to run the self-healing job as a detached background
process; poll with `kit sync status --job <job-id>`.

Notes on parity: the interactive `kit discover` action and the `kit sync`
subcommands share the same service path as `kit list`, `kit inspect`, and
`kit download`, so discovery never drifts from the validated bundled source.
The `scripts/demo-cli.sh` wrapper currently hardcodes an environment-sensitive
tsx loader, so discovery parity is validated through the shared Worker Kits
command and focused vitest path (`pnpm --dir cli vitest -c vitest.sync.config.ts`)
rather than through that script.

V1 is intentionally narrow:

- bundled catalog plus local export only
- downloadable worker kits for creative strategy, email strategy, and Open Higgsfield AI visual production
- deterministic zip plus expanded export folder
- public example brand kits only
- no heartbeat wiring, app install flow, server registry, plugin lifecycle, or database kit records

### How local adapters use worker kits

Local adapters such as Claude, Codex, Cursor, Gemini, and OpenCode execute inside the agent
`Working directory` path.

Growthub worker kits are designed to plug into that path directly:

1. Export a kit with `growthub kit download <kit-id>` or resolve its folder with `growthub kit path <kit-id>`.
2. Take the expanded folder on disk.
3. Put that absolute path into the agent's `Working directory` field.
4. Run the local adapter against that exported environment.

This is the current integration surface for worker kits in Growthub. In other words, the worker kit
becomes a specialized local execution environment that an agent can access and work within through
its configured working directory.

### Environment expansion model

The packaging model supports more than a single strategy kit.

The same packaging model can support:

- strategy environments
- email marketing environments
- browser-heavy GTM environments
- local production environments such as motion or Remotion-based workflows

That means a new environment should usually be added as:

1. a self-contained kit folder
2. a manifest and bundle contract
3. registered catalog metadata
4. a real local adapter validation pass through `Working directory`

not as a new one-off CLI code path.

## What this is

**growthub-core** is an opinionated, self-hosted developer experience platform that treats every unit of work as a **Ticket** — a sequential pipeline of stages (planning → execution → review → qa → human) — where each stage is owned by a specific AI agent. Designed for **parallel multi-ticket execution** with real-time agent status, live heartbeat tracking, and full pipeline control from a single command center dashboard.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    growthub-core                         │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │  Ticket Command Center (Dashboard)                │   │
│  │  Kanban │ List │ Roadmap (Week / Month)           │   │
│  └───────────────────────────────────────────────────┘   │
│                         │                                │
│               ┌──────────┴─────────┐                     │
│               │   Ticket TKT-N     │                     │
│               │  stageOrder[]      │                     │
│               │  currentStage      │                     │
│               └──────────┬─────────┘                     │
│                          │                               │
│       ┌──────────────────┼──────────────────┐           │
│       │                  │                  │           │
│   Planning           Execution         Review / QA       │
│   Agent              Codex /           Claude /          │
│   (pm role)          Claude Code       Codex             │
│                          │                               │
│             Issues (GRO-NNN) per stage                   │
│             assigned to specific agents                  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │  Embedded PostgreSQL (port 54329)                 │   │
│  │  Drizzle ORM — auto-migration on startup          │   │
│  │  TanStack Query + queryKeys registry              │   │
│  │  Vite dev middleware + tsx watch hot-reload        │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Technology |
|---|---|
| Server | Node.js + Fastify, TypeScript, `tsx` watch |
| Database | Embedded PostgreSQL via `embedded-postgres` (port 54329) |
| ORM | Drizzle ORM — SQL migrations in `packages/db/src/migrations/` |
| UI | React 18, Vite, TailwindCSS, shadcn/ui |
| Data fetching | TanStack Query v5 — single `queryKeys.ts` registry |
| Agents | Claude Code (local), Codex (local), HTTP adapter |
| Auth | Local trusted mode (no auth wall in dev) |

---

## Ticket Pipeline

Tickets are the primary organizing unit. Each ticket has a fully user-configurable `stageOrder` array:

```
planning → execution → review → qa → human
```

- Stage **colors** are assigned by index position in `stageOrder` — never keyed by name
- **Issues** (tasks) are spawned per stage and assigned to specific agents
- Pipeline is **sequential** — only the active stage has live work; future stages are "up next"
- **Advancing** moves `currentStage` forward; completed stages remain as history
- Stage names, colors, and order are **fully editable inline** from the ticket detail page

| Status | Meaning |
|---|---|
| `active` | Work in progress |
| `paused` | Manually paused |
| `done` | All stages completed |
| `cancelled` | Abandoned |

---

## Canonical Agents

| Agent | Role | Adapter | Purpose |
|---|---|---|---|
| **Planning Agent** | `pm` | `claude_local` | Breaks tickets into issues, writes specs |
| **Execution — Codex** | `general` | `codex_local` | Implements features from issues |
| **Execution — Claude Code** | `general` | `claude_local` | Implements features, debugging |
| **Review — Claude** | `qa` | `claude_local` | Code review, correctness checks |
| **QA/Debugger — Codex** | `qa` | `codex_local` | Test runs, regression debugging |

All agents have `canCreateAgents: true` and `canAssignTasks: true` for sub-agent spawning.

---

## Running locally

```bash
pnpm install
npm run dev
# Server + UI: http://localhost:3100
```

**No manual migrations.** Auto-migrates on every startup. To add a migration: create a `.sql` file in `packages/db/src/migrations/` and update `_journal.json` — never run `drizzle-kit push`.

---

## Key directories

```
packages/
  db/src/
    schema/        Drizzle table definitions
    migrations/    SQL files (hand-written, never generated)
  shared/src/
    types/         TypeScript types (Ticket, Issue, Agent, ...)
    validators/    Zod schemas
    constants.ts   TICKET_STAGES, TICKET_STATUSES, ...

server/src/
  routes/          Fastify route handlers
  services/        Business logic
  app.ts           Route registration

ui/src/
  pages/           React pages (Dashboard, TicketDetail, Tickets, Archive, ...)
  components/      Shared UI (NewTicketModal, Sidebar, ...)
  api/             API client (tickets.ts, issues.ts, agents.ts, ...)
  lib/
    queryKeys.ts         Single source of truth for all query keys
    company-routes.ts    Route prefix logic

agents/            Agent config markdown files
```

---

## Archive

Issues support soft-delete via `hiddenAt`. `/archive` page supports bulk archive and restore.

## GitHub PR binding

New Ticket modal fetches open PRs from your GitHub repos and binds them to tickets. PR context is stored in `ticket.metadata.pr` and surfaced to agents as part of ticket instructions.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
