# Governed-Workspace Primitives — How Your Workspace Coordinates Agents at Enterprise Scale

Every workspace you create with Growthub Local — greenfield via `growthub starter init`, or imported via `growthub starter import-repo` / `import-skill`, or materialised from any worker kit via `growthub kit download` — inherits six architectural primitives that make the workspace **self-describing to agents**, **continuous across sessions**, and **auditable for enterprise operators**.

This doc explains **why** each primitive exists and **what it buys your team**. The protocol reference lives at [`docs/SKILLS_MCP_DISCOVERY.md`](../../../../docs/SKILLS_MCP_DISCOVERY.md) at the repo level; this file is written for the human and the agent who are about to operate inside the workspace you just exported.

> TL;DR — The primitives turn a folder of files into a **coordinated execution substrate** that Claude, Cursor, Codex, and custom harnesses all read the same way, that remembers what has happened across sessions, and that refuses to run away on a retry loop.

---

## The problem these primitives solve

Most agent stacks give you one of:

- a raw repo an agent can edit, with no governance;
- a prompt pack that works once and then decays;
- a hosted product that locks your customisation behind a vendor.

None of those scale to enterprise work where many agents, many sessions, and many operators act on the same substrate over time. You need a **workspace** that is:

- **discoverable** — agents know what's here without reading everything
- **continuous** — day 3 of a brief remembers day 1
- **bounded** — a broken generation doesn't loop forever
- **auditable** — every material change produces a receipt a human can review
- **composable** — heavy work spawns into its own lane without poisoning the parent context
- **safe** — side-effecting shell calls are reviewable files, not one-off prompts

The six primitives below each answer one of those needs, and the Growthub SDK (`@growthub/api-contract/skills`) is the capability-agnostic contract that lets every worker kit, every fork, and every agent harness read them the same way.

---

## 1. `SKILL.md` — The Discovery Entry

**What it is.** A single file at the root of every kit with YAML frontmatter (`name`, `description`, `triggers`, `sessionMemory`, `selfEval`, `helpers`, `subSkills`, `mcpTools`) and a short markdown routing body.

**Why it exists.** Claude / Cursor / Codex agents scan the frontmatter at session start to catalog what's available — they do **not** load the full runbook (`skills.md`) until the user actually engages the skill. That cuts token cost on discovery and lets an agent know, within milliseconds, that your workspace has a Creative Strategist, a Hyperframes studio, and a Postiz social scheduler available — without reading a single line of the detailed operator runbook.

**What it buys you.**
- Agents route faster and more predictably across many kits.
- A new team member (or a fresh agent session) gets oriented without re-explaining the repo.
- Cross-agent compatibility is automatic — the same `SKILL.md` is read identically by Claude, Cursor, Codex, and custom harnesses.

**Enterprise use case.** A creative ops team with 30 worker kits across 6 brands can expose all 30 to every agent surface in the org without a custom integration per tool. The manifest *is* the integration.

---

## 2. Symlinked Pointer — AGENTS.md as Single Source of Truth

**What it is.** The repo root has exactly one authoritative agent contract (`AGENTS.md`). `CLAUDE.md` and `.cursorrules` are plain-text pointers that say "see AGENTS.md". No duplicated rules, no drift.

**Why it exists.** Multi-agent environments drift the second a rule lives in two places. Someone updates the Cursor file and forgets the Claude file. The pointer pattern makes that impossible: there is only one file to edit.

**What it buys you.**
- Agent rules updated in one place, picked up by every surface on next session load.
- Audit is simpler — reviewers look at one file, not three.
- Cross-OS safety — pointer files work on Windows clones where symlinks don't.

**Enterprise use case.** Compliance or InfoSec can sign off on one agent-behaviour file; no more "but the Cursor rules differ from the Claude rules" gaps.

---

## 3. `.growthub-fork/project.md` — Session Memory

**What it is.** A human-readable, append-only journal seeded inside the fork's governed state directory (alongside `fork.json`, `policy.json`, `trace.jsonl`, optional `authority.json`). Written by the CLI at init/import time from the kit's `templates/project.md`.

**Why it exists.** The machine-readable `trace.jsonl` is perfect for systems to replay history, but it is lossy to humans. `project.md` is the narrative layer — "what we tried, what we approved, what we rejected, where we stopped" — so the next session (yours or another agent's) can resume without re-explaining.

**What it buys you.**
- Day 3 of a multi-day brief opens with yesterday's context already in scope.
- Approvals, rejections, and self-eval outcomes are preserved across handoffs.
- Operators who return to a workspace after a month see exactly where work paused.

**Enterprise use case.** Hand-offs between a contract creative team and an in-house team stop losing context. An agent in the in-house session reads the last 3 entries in `project.md` and picks up where the contractor left off.

---

## 4. Self-Evaluation — Bounded Retry Loop

**What it is.** Every `SKILL.md` declares `selfEval.criteria[]` (what good looks like) and `selfEval.maxRetries` (default `3`). The agent runs `generate → apply → evaluate → record`, records each attempt to both `project.md` and `trace.jsonl`, and **must stop** when it hits the retry ceiling. The CLI primitive `recordSelfEval()` (`cli/src/skills/self-eval.ts`) is the single place that writes both surfaces.

**Why it exists.** Unbounded agent loops are the #1 source of cost overruns and silent failures. A governed self-eval contract guarantees every attempt is observable *and* gives the agent a principled stopping point.

**What it buys you.**
- Runaway jobs are impossible — the ceiling is enforced in the bookkeeping primitive.
- Every retry produces a receipt a human can read.
- The Fork Sync Agent's existing `preview → apply → trace` loop is reused, not reinvented — so operators who already trust Fork Sync get the same governance here.

**Enterprise use case.** A marketing ops team approves "at most 3 retries per creative unit" as policy. The SDK enforces it. Failed attempts surface in `project.md` immediately; nobody has to write a watchdog.

---

## 5. Sub-Skills — Parallel Agent Lanes

**What it is.** A kit can declare nested skills under `<kit>/skills/<slug>/SKILL.md`. The parent skill spawns a sub-agent for a sub-skill when the work is (a) heavy enough to pollute the parent's context, or (b) narrow enough to benefit from a specialist lane. Both parent and sub-skill share the same `project.md` journal — so the parent reads the sub-agent's outcome on return without losing continuity.

**Why it exists.** Heavy work (frame extraction, Manim render, PIL compositing, audit passes) shouldn't share the parent's context budget. And specialist work is easier to govern as its own unit.

**What it buys you.**
- Lower token cost on the parent — the parent stays focused on the user-facing artifact.
- Clean audit trail — each sub-skill run appends to `project.md::subSkillRuns` with its own start/result.
- Reusable lanes — a sub-skill like `frame-analysis` can be shared across multiple parent kits.

**Enterprise use case.** Video / creative pipelines get the EDL-per-cut pattern as a sub-skill spawned by the parent brief skill, while non-video kits (CRM, email, SEO) stay on a simple flat loop — one SDK, both patterns, same governance.

---

## 6. `helpers/` — Safe Shell Tool Layer

**What it is.** Small, deterministic scripts (`helpers/<verb>.{sh,mjs,py}`) that agents invoke via one shell call instead of reconstructing a raw pipeline inline.

**Why it exists.** Raw shell in a prompt is fragile, unreviewable, and drifts every session. Moving the same snippets into reviewable files in the kit makes them (a) inspectable, (b) testable, (c) safer — and agents read *one line* ("run helpers/grep-hooks.sh") instead of reconstructing a 4-line pipeline.

**What it buys you.**
- Reliability — the same inputs always produce the same outputs.
- Reviewable by security — helpers live in the repo and diff cleanly.
- Lower cognitive load for agents — one invocation is easier than four.

**Enterprise use case.** A security review of your agent workflow doesn't require reading agent transcripts — it reads the `helpers/` folder once. That's the full list of side-effecting operations.

---

## How the primitives compose: the export guarantee

Every kit export (`scripts/export-worker-kit.mjs --qa`) asserts all six primitives are present before shipping. The assertions are:

1. `SKILL.md` exists with well-formed frontmatter (`name`, `description`).
2. `templates/project.md` exists (session memory seed).
3. `templates/self-eval.md` exists (self-eval pattern).
4. `helpers/README.md` exists (safe-shell convention).
5. `skills/README.md` exists (sub-skill convention).
6. `kit.json.frozenAssetPaths` declares all five paths.

A kit that forgets any of these **cannot ship** — the export script refuses to produce a bundle. That guarantee is what makes the primitive layer trustworthy at scale: every workspace your team exports will have them, every time.

---

## How to operate inside this workspace

1. **At session start.** Read `.growthub-fork/project.md` (what happened last time) → `SKILL.md` (what's here) → `skills.md` (how to do the work).
2. **During work.** After every material change, write a dated bullet to `project.md`'s "Session log" AND call `appendKitForkTraceEvent` for the machine log. The CLI primitive `recordSelfEval` does both in one call — use it.
3. **On retry.** Every attempt goes to both surfaces. At `attempt === maxRetries`, park with a `needs_confirmation` note and stop.
4. **On heavy work.** Spawn a sub-skill from `skills/<slug>/` when context isolation helps. The sub-skill shares this fork's `project.md` — no separate journal.
5. **On side effects.** Use a helper from `helpers/`. If you're about to write raw shell for the third time, promote it to a helper first.

---

## Command surface from inside the workspace

```bash
# Catalog every SKILL.md reachable from here (root + nested sub-skills)
growthub skills list [--json]

# Strict shape check — frontmatter + helper/sub-skill path existence
growthub skills validate

# Read the session memory for this fork
growthub skills session show [--body]

# (Re-)seed the session memory if it is missing
growthub skills session init [--kit <id>]
```

## What this substrate is NOT

- **Not a sandbox.** It's a set of conventions. The filesystem is still yours to edit.
- **Not a lock-in.** Every primitive file is plain markdown or JSON — readable without Growthub tooling.
- **Not a replacement for policy.** `policy.json` and the Fork Sync Agent remain the safety envelope. The primitives ride on top.
- **Not capability-specific.** The SDK contract (`@growthub/api-contract/skills::SkillSelfEval`) is intentionally agnostic. Creative, code, content, CRM, social, audit — all specialise inside their own `skills.md` without changing the contract.

---

## Further reading

- [`../SKILL.md`](../SKILL.md) — the discovery entry for this kit
- [`../skills.md`](../skills.md) — the operator runbook (the deep how-to)
- [`../workers/agency-portal-operator/CLAUDE.md`](../workers/agency-portal-operator/CLAUDE.md) — the worker agent contract
- [`../templates/project.md`](../templates/project.md) — session-memory template
- [`../templates/self-eval.md`](../templates/self-eval.md) — self-evaluation template
- [`../helpers/README.md`](../helpers/README.md) — safe-shell convention
- [`../skills/README.md`](../skills/README.md) — sub-skill convention
- Repo-level protocol reference: `docs/SKILLS_MCP_DISCOVERY.md`
- SDK source of truth: `@growthub/api-contract/skills`
