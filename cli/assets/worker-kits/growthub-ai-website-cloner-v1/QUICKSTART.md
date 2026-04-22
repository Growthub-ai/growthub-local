# AI Website Cloner — Quickstart

**Kit:** `growthub-ai-website-cloner-v1`  
**Fork:** [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template)

---

## Prerequisites

- Node.js 24+ — [nodejs.org](https://nodejs.org/)
- An AI coding agent (Claude Code recommended) — `npm install -g @anthropic-ai/claude-code`
- Git

---

## Step 1 — Set up the fork

```bash
bash setup/clone-fork.sh
```

This clones the `ai-website-cloner-template` fork to `$HOME/ai-website-cloner-template` and runs `npm install`.

---

## Step 2 — Copy the env file (optional — no API key required)

```bash
cp .env.example .env
```

The cloner works without an API key. The `.env` file is used for optional configuration (custom fork path, default agent).

---

## Step 3 — Verify the environment

```bash
node setup/verify-env.mjs
```

---

## Step 4 — Point your AI agent at this kit

In Claude Code:
```bash
cd <path-to-this-kit>
claude --chrome
```

In Cursor or other agents, open this directory as the project root.

---

## Step 5 — Run the clone skill

In your AI agent chat:
```
/clone-website https://example.com
```

Or provide multiple URLs for a multi-page clone:
```
/clone-website https://example.com https://example.com/about https://example.com/pricing
```

---

## What happens next

The agent will:
1. Screenshot the target at desktop, tablet, and mobile viewports
2. Extract all design tokens using `getComputedStyle()`
3. Inventory all assets (images, videos, fonts, SVGs)
4. Write a component spec for every section
5. Dispatch parallel builder agents in git worktrees
6. Assemble and merge all builder outputs
7. Run visual QA against the original screenshots
8. Produce a platform handoff document

---

## Output location

All artifacts land in:
```
$HOME/ai-website-cloner-template/output/<client-slug>/<project-slug>/
```

The cloned Next.js components live in:
```
$HOME/ai-website-cloner-template/src/components/
```

---

## Running the cloned site

```bash
cd $HOME/ai-website-cloner-template
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the clone.

---

## Docs

- `skills.md` — Full skill and pipeline reference
- `docs/ai-website-cloner-fork-integration.md` — Fork integration details
- `docs/multi-phase-pipeline.md` — Pipeline architecture deep-dive
- `docs/parallel-builder-dispatch.md` — Worktree builder system
- `docs/design-token-system.md` — Token extraction and Tailwind v4 mapping
- `validation-checklist.md` — Pre-handoff validation checklist
