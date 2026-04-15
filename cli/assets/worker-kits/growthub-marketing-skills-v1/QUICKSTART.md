# Growthub Marketing Operator — Quickstart

**Kit:** `growthub-marketing-skills-v1`
**Worker:** `marketing-operator`
**Upstream:** [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)

---

## What This Kit Does

The Growthub Marketing Operator is a self-contained AI agent environment for executing structured marketing workflows. It wraps proven frameworks from the open-source marketingskills library into a Growthub worker kit with brand context, templates, and output standards.

Domains covered:
- **CRO** — Landing page, signup flow, form, popup, paywall, and onboarding optimization
- **SEO** — Technical audit, on-page, content quality, AI search visibility, schema markup
- **Content** — Strategy, editorial planning, distribution, pillar mapping
- **Email** — Welcome, nurture, re-engagement, cold outbound, event-based sequences
- **Launch** — Pre-launch, launch day, post-launch phased playbooks
- **Competitive** — Positioning gap analysis, feature matrices, messaging teardowns
- **Growth** — Marketing ideas, pricing, referrals, free tools, churn prevention
- **Copy** — Landing pages, ads, email, social — grounded in brand voice

---

## Setup — 4 Steps

### Step 1 — Point Your Working Directory

Export this kit to a local folder and point your AI agent's Working Directory at the kit root. All paths are relative to the kit root.

### Step 2 — Copy the Environment File

```bash
cp .env.example .env
```

No API keys are required for core analysis. The operator works with any AI agent that can read markdown files.

### Step 3 — Verify the Environment

```bash
node setup/verify-env.mjs
```

This confirms the kit structure is intact and all required files are present.

### Step 4 — Set Up Your Product Context

Copy the template and fill it in:

```bash
cp brands/_template/product-marketing-context.md brands/<your-company>/product-marketing-context.md
```

This is the single most important step. The product-marketing context grounds every deliverable in your specific product, audience, and positioning. Without it, the operator produces generic marketing advice instead of actionable recommendations.

---

## First Run

1. Tell the operator: **"Run a CRO audit on [your landing page URL]"** or any marketing task
2. The operator reads your product-marketing context for brand grounding
3. The operator identifies the marketing domain and asks 3 clarifying questions
4. The operator applies the appropriate framework and produces structured deliverables
5. Output is saved to `output/<client-slug>/<project-slug>/`

---

## New Client Setup

```bash
cp brands/_template/product-marketing-context.md brands/<client-slug>/product-marketing-context.md
# Fill in the 12 sections in the new file
```

The 12 sections: Product Overview, Target Audience, Personas, Problems & Pain Points, Competitive Landscape, Differentiation, Objections, Switching Dynamics, Customer Language, Brand Voice, Proof Points, Goals.

---

## Available Domains

Tell the operator which marketing domain you need:

| Domain | Example Request |
|---|---|
| CRO | "Audit this landing page for conversions" |
| SEO | "Run an SEO audit on my site" |
| Content | "Build a content strategy for my blog" |
| Email | "Design a welcome email sequence" |
| Launch | "Create a launch checklist for my new feature" |
| Competitive | "Analyze my top 3 competitors" |
| Copy | "Write homepage copy for my SaaS" |
| Growth | "Give me 10 marketing ideas for my startup" |

The operator will map your request to the correct framework and template automatically.

---

## Key Files

| File | Purpose |
|---|---|
| `workers/marketing-operator/CLAUDE.md` | Agent operating instructions (start here) |
| `skills.md` | Full methodology and skill dispatch table |
| `brands/_template/product-marketing-context.md` | Blank product context template |
| `brands/growthub/product-marketing-context.md` | Growthub reference example |
| `templates/` | Frozen deliverable templates per domain |
| `output/README.md` | Output directory structure and naming |
| `docs/fork-integration.md` | How this kit relates to marketingskills |
| `docs/skill-dispatch-methodology.md` | How skill routing works |
| `docs/evaluation-frameworks.md` | Scoring and evaluation criteria |
