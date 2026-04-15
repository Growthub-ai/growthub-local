# Multi-Workspace Operations

Postiz supports multiple workspaces (teams, brands, or clients). This kit standardizes how agents document workspace strategy in Markdown.

---

## Planning dimensions

1. **Workspace boundary** — Which brand or legal entity owns the calendar?
2. **Channel ownership** — Who approves LinkedIn vs X vs Instagram tone?
3. **Asset library** — Where creative lives (Postiz media, DAM, or drive links — describe, do not invent paths)
4. **Approval SLA** — Draft → review → scheduled windows

---

## Output convention

When a deliverable spans workspaces, use a section per workspace in `templates/channel-mix-matrix.md` and cross-link calendar rows in `templates/calendar-week-plan.md`.

---

## Fork inspection hint

If the fork is available, look for workspace-related modules under `apps/backend` and shared libraries. Name routes and entities **only** after reading code — never from memory.
