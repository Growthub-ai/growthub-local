# New Client — Brand Kit Setup Guide

Use this guide to create a brand kit for a new client before running the Twenty CRM operator.

---

## Step 1 — Create the brand kit folder

```bash
mkdir -p brands/<client-slug>
cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
```

Replace `<client-slug>` with the client's slug — lowercase, hyphenated (e.g. `acme-corp`, `growth-agency`).

---

## Step 2 — Fill in the brand kit

Open `brands/<client-slug>/brand-kit.md` and fill in:

1. **IDENTITY** — client name, slug, industry, company size, primary offer, campaign owner, date onboarded
2. **CRM OBJECTIVE** — what problem they are solving with Twenty, deployment mode, go-live target
3. **AUDIENCE AND PIPELINE** — primary persona, pipeline stages in order
4. **TECH STACK** — current tools, enrichment providers, data sources
5. **TEAM** — CRM admin, team sizes, admin capacity

Leave `DELIVERABLES LOG` empty for now. The operator will append a line after each session.

---

## Step 3 — Tell the agent

When you start a new session, point the agent to the brand kit:

> "Load `brands/<client-slug>/brand-kit.md` as the active client context."

The agent loads it in Step 1 of the workflow and uses it to name outputs, set the pipeline stage vocabulary, and calibrate proposal scope.

---

## Naming convention

- `client_name`: Full name (e.g. `Acme Corporation`)
- `slug`: lowercase, hyphenated, no spaces (e.g. `acme-corporation`)
- Output files use PascalCase ClientSlug (e.g. `AcmeCorporation_DataModelDesign_v1_20260415.md`)

---

## Required fields (session will not proceed without these)

- `client_name`
- `slug`
- `primary_crm_objective`
- `deployment_mode`
- `pipeline_stages` (at least 3 stages)
- `data_sources` (at least one)
