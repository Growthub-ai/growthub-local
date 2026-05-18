# Memory & Knowledge Profile Guide

This guide explains the customer journey and agent contract for the Growthub Local free profile, persistent Memory & Knowledge, and 2-way knowledge-base sync.

## Customer Journey

1. A user starts in Growthub Local through `growthub` or `growthub discover`.
2. They open **Memory & Knowledge**.
3. If they are not connected, Growthub Local offers **Connect Growthub Account**.
4. `growthub auth login` opens hosted Growthub, connects the local CLI session, and stores the hosted session locally.
5. The user keeps working locally. Observations, summaries, workspace config changes, work-session notes, and traces are captured in the local JSON memory store.
6. When the user syncs, Growthub Local creates a project knowledge table and saves each memory record as a hosted knowledge item.
7. When the user pulls, Growthub Local reads the hosted knowledge items for that project table and reconciles hosted IDs back into local sync state.
8. If auto-sync is enabled, Growthub Local pushes pending deltas when the user exits the Memory & Knowledge surface.

The result is a free Growthub profile that follows the local machine, preserves local-first work, and turns work sessions into a durable knowledge engine instead of disposable chat history.

## What Sync Persists

Memory sync persists:

- project table item: a hosted knowledge item named `growthub-cli-memory-<project>.md`
- observation items: markdown records with `growthubCliObservationId`, `growthubCliProject`, `growthubCliSessionId`, and concept metadata
- summary items: markdown records with `growthubCliSummaryId`, `growthubCliProject`, and session metadata
- sync state: local cursor, hosted table id, and local-record to hosted-knowledge-item id maps

Hosted list responses may normalize table items back to `source_type = "markdown"`. Growthub Local treats the project table item as a knowledge item and uses its id as `metadata.table_id` on child observation and summary items.

The local JSON memory store remains the capture source of truth. The hosted knowledge base becomes the durable shared substrate and readback surface.

## Commands

Interactive customer path:

```bash
growthub
growthub discover
```

Headless agent and smoke-test path:

```bash
growthub auth whoami --json
growthub memory status --project <project> --json
growthub memory seed --project <project> --title "Test memory" --narrative "What changed and why" --json
growthub memory sync --project <project> --json
growthub memory pull --project <project> --json
growthub bridge knowledge list --agent-slug growthub_local_bridge --json
```

Demo parity path from the repo:

```bash
bash scripts/demo-cli.sh memory-plg --use-real-home --project <project>
```

## Live Routes

Growthub Local knowledge persistence uses the live hosted knowledge routes:

```text
POST /api/knowledge/upload
GET  /api/knowledge-base/list
GET  /api/knowledge-base/download/<id>
```

These routes require the active CLI session projected as the hosted session cookie shape. Bearer-only auth is not sufficient for this knowledge surface.

Do not use `/api/providers/growthub-local/probe` for memory persistence. That route is only a bridge health check that creates generic probe items.

Do not use `/api/cli/profile?action=sync-memory` for new code. That legacy path is not the active memory persistence API.

## Agent Contract

Agents should:

- use `growthub memory status --json` before making sync claims
- use `growthub memory sync --json` to push local memory deltas
- use `growthub memory pull --json` to prove hosted readback
- treat `sync-state.json` as the local binding map between local records and hosted knowledge items
- keep all memory writes additive and non-destructive
- report the hosted `knowledgeItemId` values when proving remote persistence

Agents should not:

- call probe routes as persistence
- claim 2-way sync without a successful `sync` and `pull`
- erase local memory state to fix duplicates
- move secrets or provider tokens into memory content

## Benefits

- Persistent memory across sessions instead of throwaway prompts.
- Hosted knowledge items for real work traces, decisions, config changes, and session summaries.
- Local-first capture with hosted readback.
- Auto-sync for low-friction PLG profile value.
- A stable substrate for future agents to inspect what happened, why it happened, and what changed.
