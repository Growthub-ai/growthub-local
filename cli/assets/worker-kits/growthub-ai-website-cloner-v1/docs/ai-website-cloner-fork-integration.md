# AI Website Cloner — Fork Integration

**Kit:** `growthub-ai-website-cloner-v1`  
**Fork:** [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template)

---

## What the fork is

`ai-website-cloner-template` is a production-grade Next.js 16 + shadcn/ui + Tailwind CSS v4 template purpose-built for AI coding agents. It provides:

- A pre-scaffolded Next.js codebase at the correct version and configuration
- The `/clone-website` skill — a multi-phase pipeline for cloning any website
- Built-in multi-agent / parallel worktree support for builder dispatch
- Support for 13+ AI coding agents (Claude Code, Cursor, Copilot, Codex, Gemini CLI, etc.)

The template is a **git repository you clone locally** — the AI agent operates inside it as its working directory.

---

## How this kit integrates with the fork

This Growthub worker kit provides the **operator layer** on top of the fork:

| Layer | What it does |
|---|---|
| Fork (`ai-website-cloner-template`) | Scaffold, skill definitions, parallel builder infrastructure |
| This kit (Growthub operator) | Workflow methodology, templates, QA standards, brand management |

The Growthub operator (`workers/ai-website-cloner-operator/CLAUDE.md`) reads the fork's skill definition and applies a structured 8-phase workflow with:
- Strict phase ordering
- Mandatory reconnaissance before spec writing
- Explicit builder dispatch plan with worktree isolation
- Formal QA standards with diff requirements
- Brand kit management

---

## Fork setup path

The fork is set up by `setup/clone-fork.sh`:

```
git clone https://github.com/JCodesMore/ai-website-cloner-template.git ~/ai-website-cloner-template
cd ~/ai-website-cloner-template
npm install
```

Default path: `~/ai-website-cloner-template`  
Override: set `AI_CLONER_FORK_PATH` environment variable.

---

## Fork tech stack (locked)

| Layer | Version |
|---|---|
| Next.js | 16 (App Router, React 19) |
| TypeScript | strict mode |
| shadcn/ui | Latest at fork commit |
| Tailwind CSS | v4 |
| Design tokens | oklch color space |
| Icons | Lucide React + extracted SVGs |
| Node.js requirement | 24+ |

---

## Agent support

The fork's skill is defined in `.claude/skills/clone-website/SKILL.md` (synced to other agents). Supported agents:

- Claude Code (recommended — `--chrome` flag enables browser automation)
- Cursor, Windsurf, Copilot, Cline, Roo Code, Continue, Codex, OpenCode, Gemini CLI, Amazon Q, Augment Code, Aider

---

## How the `/clone-website` skill works

When invoked, the skill:

1. Opens Chrome (Claude Code) or uses Playwright/browser integration for other agents
2. Navigates to each target URL
3. Takes screenshots at desktop (1440px), tablet (768px), mobile (375px)
4. Executes `getComputedStyle()` extraction in the browser console
5. Downloads all external assets to `public/`
6. Writes component spec files to `docs/research/components/`
7. Dispatches parallel builder subagents — each works in a `git worktree` branch
8. Merges all builder branches and assembles the page
9. Runs `npm run build`, `npm run lint`, and `npm run typecheck`

---

## Fork structure (relevant paths for the operator)

```
~/ai-website-cloner-template/
  .claude/
    skills/
      clone-website/
        SKILL.md             # The core skill definition
  AGENTS.md                  # Agent project instructions
  src/
    app/
      page.tsx               # Main cloned page (written by orchestrator)
      layout.tsx             # Root layout
      globals.css            # Design tokens and base styles
    components/
      <section-slug>/        # One directory per cloned section (written by builders)
      icons.tsx              # Extracted SVG icons
    lib/
      utils.ts               # cn() utility
  public/
    images/                  # Downloaded images
    videos/                  # Downloaded videos
    seo/                     # Favicon, OG, webmanifest
  docs/
    research/                # Reconnaissance output (created by operator)
```
