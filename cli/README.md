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

The CLI also ships a bundled Worker Kit export surface for local working-directory artifacts:

```bash
growthub kit list
growthub kit inspect creative-strategist-v1
growthub kit download creative-strategist-v1
growthub kit path creative-strategist-v1
```

V1 is intentionally narrow:

- bundled catalog plus local export only
- one downloadable Creative Strategist kit
- deterministic zip plus expanded export folder
- public `solawave` example brand included
- no heartbeat wiring, app install flow, server registry, plugin lifecycle, or database kit records

The exported folder is a machine artifact produced by the CLI for existing Working Directory path support.

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
