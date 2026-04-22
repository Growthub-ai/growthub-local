# Runtime Assumptions — AI Website Cloner

**Kit:** `growthub-ai-website-cloner-v1`

---

## Fork assumptions

This kit assumes the `ai-website-cloner-template` fork is checked out and installed:

| Assumption | Default | Override |
|---|---|---|
| Fork directory | `$HOME/ai-website-cloner-template` | `AI_WEBSITE_CLONER_HOME` (legacy: `AI_CLONER_FORK_PATH`) env var |
| Fork repo URL | `https://github.com/JCodesMore/ai-website-cloner-template` | n/a |
| Node.js version | 24+ (strict) | n/a — minimum requirement |
| Package manager | npm | n/a |
| Dev server port | 3000 | Configurable via Next.js CLI |

---

## Tech stack (locked by fork)

The fork uses a locked stack. Do not deviate inside the clone output:

| Layer | Version |
|---|---|
| Next.js | 16 (App Router, React 19) |
| TypeScript | strict mode |
| shadcn/ui | Latest at fork commit |
| Tailwind CSS | v4 |
| Design tokens | oklch color space |
| Icons | Lucide React (default) + extracted SVGs |

---

## Agent assumptions

- The AI coding agent is running in the fork's root directory
- The agent can access the internet for screenshots and asset downloads
- The agent can spawn parallel subagents / worktrees for builder dispatch
- Claude Code with `--chrome` flag is the recommended setup (enables browser automation)

---

## What the fork's `/clone-website` skill does

The skill is defined in `.claude/skills/clone-website/SKILL.md` (and synced to other agents).
When invoked by the operator, it:

1. Opens Chrome DevTools (via `--chrome` flag for Claude Code, or Playwright for other agents)
2. Navigates to the target URL
3. Captures screenshots at all viewports
4. Extracts design tokens via `getComputedStyle()` console calls
5. Downloads all external assets to `public/`
6. Writes component specs to `docs/research/components/`
7. Dispatches builder subagents in git worktrees
8. Merges and assembles the page
9. Runs visual QA

---

## Ethical use constraints

This kit must not be used to:
- Create phishing pages or impersonation sites
- Clone sites with explicit prohibitions on reproduction in their Terms of Service
- Redistribute proprietary brand assets or copy
- Pass off cloned designs as original work

These constraints are enforced by operator instruction, not technical controls. The operator must verify site terms before initiating a clone.
