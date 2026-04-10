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

## Worker Kits

Worker kits are frozen, working-directory-ready execution environments for local AI agents.
Each kit bundles prompts, templates, output standards, brand guides, setup scripts, and a
`CLAUDE.md` operator contract — everything an agent needs to run a vertical workflow immediately.

### Discovery

```bash
# Interactive browser — family filter → searchable selector → preview → download
growthub kit

# All kits grouped by family with descriptions and inline download commands
growthub kit list

# Filter by family (studio · workflow · operator · ops)
growthub kit list --family studio
growthub kit list --family studio,operator

# Machine-readable output for scripting / agent use
growthub kit list --json

# Official family taxonomy — taglines, surfaces, and examples
growthub kit families
```

### Download

```bash
# Interactive (picker if no kit-id given)
growthub kit download

# Fuzzy slug — partial IDs resolve automatically
growthub kit download higgsfield           # → growthub-open-higgsfield-studio-v1
growthub kit download email                # → growthub-email-marketing-v1
growthub kit download studio-v1            # → growthub-open-higgsfield-studio-v1

# Full ID
growthub kit download growthub-open-higgsfield-studio-v1

# Custom output directory
growthub kit download higgsfield --out ~/my-kits

# Skip confirmation prompt (scripting / agent use)
growthub kit download higgsfield --yes
```

### Inspect & validate

```bash
# Pretty manifest output with family badge and required paths
growthub kit inspect higgsfield-studio-v1
growthub kit inspect creative-strategist-v1
growthub kit inspect growthub-open-higgsfield-studio-v1

# Raw JSON for scripting
growthub kit inspect growthub-email-marketing-v1 --json

# Resolve export folder path without exporting
growthub kit path creative-strategist-v1

# Validate a kit directory against the schema
growthub kit validate /absolute/path/to/kit
growthub kit validate ~/kits/growthub-open-higgsfield-studio-v1
```

```bash
# Full ID download examples
growthub kit download creative-strategist-v1
growthub kit download growthub-open-higgsfield-studio-v1
```

### After download

```
1. Point Growthub local Working Directory at the exported folder
   (or Claude Code Working Directory as an alternative)
2. cp .env.example .env  →  add your API key
3. bash setup/clone-fork.sh  →  boot local fork (studio kits only)
4. Open a new session — the operator agent loads automatically from CLAUDE.md
```

### Kit families

| Family | Description | Default surface |
|---|---|---|
| 🎬 **studio** | AI generation studio backed by a local fork | local-fork |
| 🔄 **workflow** | Multi-step pipeline operator across tools or APIs | browser-hosted |
| 🤖 **operator** | Domain vertical specialist — structured deliverables | browser-hosted |
| ⚙️ **ops** | Infrastructure / toolchain operator | local-fork |

### Available kits

| Kit | Family | Description |
|---|---|---|
| `growthub-open-higgsfield-studio-v1` | studio | Open Higgsfield AI visual production (image, video, lip sync, cinema) |
| `growthub-email-marketing-v1` | operator | Brand-aware email campaigns, nurture sequences, and content pillar plans |
| `creative-strategist-v1` | workflow | Video creative briefs and campaign strategy |

### How local adapters use worker kits

Local adapters (Claude Code, Codex, Cursor, Gemini, OpenCode) execute inside the agent
`Working directory` path. Worker kits are designed to plug into that path directly:

1. `growthub kit download <id>` — exports the kit as a folder + zip
2. Point the agent `Working directory` at the exported folder path
3. The agent reads `CLAUDE.md` on session start and runs the operator workflow automatically

### Adding new kits

Each new kit should be:

1. A self-contained kit folder in `cli/assets/worker-kits/`
2. A `kit.json` manifest (schema v2) with `family`, `frozenAssetPaths`, and `outputStandard`
3. A bundle manifest in `bundles/`
4. A catalog entry in `cli/src/kits/catalog.ts`
5. Validated with `growthub kit validate ./path/to/kit`

The kit family factory layer (`cli/src/kits/core/factory/`) provides typed `createStudioKitConfig()`,
`createWorkflowKitConfig()`, `createOperatorKitConfig()`, and `createOpsKitConfig()` builders that
assemble a fully validated `ForkAdapterCoreConfig` from a small set of options.

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
