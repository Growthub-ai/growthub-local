# Growthub Agent Observability

**Location:** `scripts/observability/`  
**Purpose:** Live stream and frozen snapshots of all running agents — tool calls, browser actions, Chrome processes, token usage, and server state.

---

## What This Captures

Every agent run is stored as a structured `.ndjson` file at:
```
~/.paperclip/instances/default/data/run-logs/<company_id>/<agent_id>/<run_id>.ndjson
```

Each line is a JSON event: `tool_use`, `tool_result`, `thinking`, `text`, `system/init`, `rate_limit_event`. This is the **full unfiltered token stream** from Claude — every thought, every browser action, every result.

---

## Scripts

### `watch-agents.sh` — Full snapshot of all running agents
```bash
bash scripts/observability/watch-agents.sh
```
Shows:
- Paperclip runtime PID
- Chrome renderer count + high-CPU processes (agents in browser)
- All active run logs with event counts and last-write timestamps
- Last 5 tool calls per agent
- Recent server warnings
- Saves a frozen snapshot to `~/.paperclip/instances/default/observability-snapshots/`

### `tail-run.sh` — Live stream a specific run
```bash
# Stream Lead Hunter (f8a2f45f run)
bash scripts/observability/tail-run.sh d898be8d f8a2f45f

# Stream LinkedIn SDR (3450c721 run)
bash scripts/observability/tail-run.sh 4b993ee8 3450c721
```
Prints real-time:
- `[THINKING]` — agent's internal reasoning
- `[TOOL CALL]` — every tool invoked with target URL/command
- `[RESULT]` — what the browser/bash returned
- `[AGENT TEXT]` — agent's spoken output

---

## What's Happening Right Now (Frozen Snapshot — 2026-04-03 ~04:52)

### System State
| Resource | Status |
|---|---|
| Paperclip runtime | PID 69573 |
| Chrome main process | PID 705 |
| Chrome renderer (145% CPU) | PID 86391 — active agent tab |
| Chrome renderer (108% CPU) | PID 79719 — active agent tab |
| Chrome renderer (92% CPU) | PID 86379 — active agent tab |
| PostgreSQL connections | 8 active (paperclip DB) |
| claude app | PID 80436, 71391 |

### Active Runs
| Agent | Run ID | Events | Task |
|---|---|---|---|
| Lead Hunter (d898be8d) | f8a2f45f | 689+ | Sending LinkedIn DMs — 2 parallel Chrome tabs |
| LinkedIn SDR (4b993ee8) | 3450c721 | 188 | Unconnecting India 1st-tier connections on GHA-23 |

### Lead Hunter Run f8a2f45f — Behavior Trace
- Started with fallback workspace (no issueId in context — expected behavior)
- Self-recovered: decoded JWT → got companyId → queried issues API correctly
- Discovered 19 total issues, all assigned DM tasks (GHA-20/21/22/25) already `done`
- Found GHA-23/24/8 assigned to LinkedIn SDR — correctly did NOT take them over
- Created new DM issue at 04:39:28 (POST /companies/.../issues → 201)
- Currently running: 2 parallel Chrome tabs executing LinkedIn DMs
  - Tab 358550400: navigating LinkedIn profiles, clicking Message, composing DMs
  - Tab 358550401: parallel second profile stream
  - Last seen: Antara Ganguly + Cyril Ivannik profiles loaded, DM compose open

### LinkedIn SDR Run 3450c721 — Behavior Trace
- Assigned to GHA-23: "Unconnect 50 India 1st-Tier Connections (Batch 1)"
- First run (8f774699) was cancelled by user at 04:47:40
- Second run (3450c721) started at 04:48:34
- Active: log growing, workspace-operations polling every 2s confirms alive
- Log at 04:51:56 confirmed UI viewing this run

### Notable Events
- `04:37:43` — Lead Hunter paused, then resumed 4 seconds later (user action)
- `04:38:41` — `GET /issues/GHA-23 404` — Lead Hunter tried identifier lookup (wrong route, self-corrected)
- `04:45:30` — `WARN: failed to wake agent on issue comment` — LinkedIn SDR was paused when comment posted on GHA-23, server correctly rejected with 409
- `04:46:42` — LinkedIn SDR manually resumed
- `04:47:40` — Run 8f774699 cancelled, new run 3450c721 started
- `04:49:30` — `WARN: /issues/82aac867.../comments 404` — Lead Hunter queried a stale issue ID (non-critical)

---

## How to Add This to Any Future Agent Session

Any agent or human can run observability from scratch:

```bash
# Quick system snapshot
bash scripts/observability/watch-agents.sh

# Live-tail the Lead Hunter
bash scripts/observability/tail-run.sh d898be8d f8a2f45f

# Live-tail the LinkedIn SDR
bash scripts/observability/tail-run.sh 4b993ee8 3450c721

# See all available runs
bash scripts/observability/tail-run.sh
```

---

## What I Cannot See (Honest Limitations)

I can read:
- Every JSON event in the ndjson run logs (full token stream)
- Chrome process table (PIDs, CPU%, memory)
- Paperclip server HTTP logs
- PostgreSQL connections

I cannot read:
- **What's actually rendered on screen** in Chrome (no screenshot without browser MCP)
- **Which specific LinkedIn profiles** are currently visible in each Chrome tab (without browser automation)
- **macOS window manager state** — which app is focused, window positions
- **Chrome DevTools / network tab** content without browser MCP attached

To get full screen visibility, use the `cursor-ide-browser` MCP or the `browser-use` subagent which has actual page snapshot access.
