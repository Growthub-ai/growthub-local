# Growthub GEO SEO Studio — Quickstart

**Kit:** `growthub-geo-seo-v1`
**Worker:** `geo-seo-operator`
**Tool:** [geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude)

---

## What This Kit Does

The Growthub GEO SEO Studio is a self-contained AI agent environment that audits websites for AI search visibility, citability, and traditional SEO health. It wraps the open-source `geo-seo-claude` tool to produce:

- GEO Scores (0–100 composite score across 6 components)
- Citability analyses (5-metric algorithm measuring AI quotability)
- AI crawler permission reports (14 major crawlers)
- Brand visibility reports (8 platforms)
- llms.txt implementation plans
- 4-week remediation roadmaps
- Client-ready PDF reports

---

## Setup — 6 Steps

### Step 1 — Point Your Working Directory

Export this kit to a local folder and point Claude Code's Working Directory at the kit root. All paths in the kit are relative to the kit root.

### Step 2 — Copy the Environment File

```bash
cp .env.example .env
```

No API keys are required for core analysis. Python and Playwright handle all data collection locally. If you want agent-enhanced analysis, add your `ANTHROPIC_API_KEY` to `.env`.

### Step 3 — Verify the Environment

```bash
node setup/verify-env.mjs
```

This checks:
- Whether `geo-seo-claude` is cloned at `GEO_SEO_FORK_PATH` (default: `~/geo-seo-claude`)
- Whether key Python scripts exist in the fork
- Whether `ANTHROPIC_API_KEY` is valid format (if set)
- No network calls are made during verification

### Step 4 — Check Dependencies

```bash
bash setup/check-deps.sh
```

Verifies that `python3`, `pip`, `playwright`, `git`, and `node` are available. Checks Python version (3.8+ required). Checks Playwright chromium browser is installed.

### Step 5 — Clone and Install the Fork (Local-Fork Mode Only)

```bash
bash setup/clone-fork.sh
```

This clones `geo-seo-claude` to `~/geo-seo-claude` (or `GEO_SEO_FORK_PATH` if set), runs `pip install -r requirements.txt`, and installs Playwright chromium.

Skip this step if you are using **agent-only mode** — the operator can perform analysis without the local fork.

### Step 6 — Start a Session

Open Claude Code, set the Working Directory to this kit root, and start your session. The operator will guide you through the 10-step workflow.

---

## Execution Modes

| Mode | Requirements | Use When |
|---|---|---|
| `local-fork` | Python 3.8+, Playwright, geo-seo-claude cloned | You want the full tool stack — Python scripts, PDF generation, real crawl data |
| `agent-only` | Nothing — Claude handles everything | You need a quick analysis and don't have the fork installed |
| `hybrid` | ANTHROPIC_API_KEY + fork | Best of both — agent reasoning with Python data collection |

---

## First Run

1. Tell the operator: **"Run a full GEO audit on [your domain]"**
2. The operator will ask 3 clarifying questions (target URL, scope, delivery format)
3. The operator runs the 10-step workflow and produces all audit artifacts
4. Output is saved to `output/<client-slug>/<project-slug>/`

---

## New Client Setup

See `brands/NEW-CLIENT.md` for instructions on adding a new client brand kit.

Quick version:
```bash
cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
# Then fill in the fields in the new file
```

---

## Available Commands

The geo-seo-claude tool provides 14 commands. Tell the operator which you need:

| Command | What It Does |
|---|---|
| `/geo audit` | Full GEO + SEO audit — all components |
| `/geo citability` | Citability score only |
| `/geo crawlers` | AI crawler permission check |
| `/geo brands` | Brand mention and authority scan |
| `/geo report` | Structured Markdown report |
| `/geo report-pdf` | Branded PDF report |
| `/geo content` | E-E-A-T and content quality |
| `/geo schema` | Structured data validation |
| `/geo technical` | Server headers and technical health |
| `/geo llmstxt` | Generate llms.txt plan |
| `/geo quick` | 60-second AI visibility snapshot |
| `/geo proposal` | Client proposal with pricing |
| `/geo prospect` | Prospect qualification scan |
| `/geo compare` | Side-by-side URL comparison |

---

## Key Files

| File | Purpose |
|---|---|
| `workers/geo-seo-operator/CLAUDE.md` | Agent operating instructions (start here) |
| `skills.md` | Full methodology — read at every session |
| `brands/_template/brand-kit.md` | Blank brand kit template |
| `brands/growthub/brand-kit.md` | Growthub reference example |
| `output/README.md` | Output directory structure and naming |
| `docs/geo-seo-fork-integration.md` | How this kit integrates with geo-seo-claude |
| `docs/scoring-methodology.md` | GEO Score formula and citability algorithm |
| `validation-checklist.md` | Pre-session checklist |
