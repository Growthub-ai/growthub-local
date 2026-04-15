# Brand Kit — [CLIENT NAME]

Copy to `brands/<client-slug>/brand-kit.md` and fill before producing outputs.

---

## IDENTITY

```yaml
client_name: "[CLIENT NAME]"
slug: "[client-slug]"
industry: "[industry]"
company_size: "[e.g. 10-50 employees]"
primary_offer: "[offer]"
campaign_owner: "[owner]"
date_onboarded: "YYYY-MM-DD"
```

## CRM OBJECTIVE

```yaml
primary_crm_objective: "[e.g. lead pipeline management / customer success tracking / partner CRM]"
current_crm_tool: "[e.g. Salesforce / HubSpot / Airtable / none]"
reason_for_switching: "[reason or first-time adoption]"
deployment_mode: "[cloud / self-hosted / local-fork]"
go_live_target: "YYYY-MM-DD"
```

## AUDIENCE AND PIPELINE

```yaml
primary_persona:
  role: "[role]"
  company_type: "[company type]"
  pain_point: "[pain]"
  desired_outcome: "[desired outcome]"
  awareness_level: "[awareness]"

pipeline_stages:
  - "[Stage 1 — e.g. Lead]"
  - "[Stage 2 — e.g. Qualified]"
  - "[Stage 3 — e.g. Demo]"
  - "[Stage 4 — e.g. Proposal]"
  - "[Stage 5 — e.g. Closed Won]"
  - "[Stage 6 — e.g. Closed Lost]"
```

## TECH STACK

```yaml
current_tools:
  email_provider: "[e.g. Gmail / Outlook]"
  enrichment_providers:
    - "[Apollo / Clearbit / Clay / Hunter / none]"
  product_analytics: "[Segment / Amplitude / Mixpanel / none]"
  billing: "[Stripe / Chargebee / none]"
  support: "[Intercom / Zendesk / none]"
  marketing: "[HubSpot / Mailchimp / none]"
  data_sources:
    - "[CSV exports from ...]"
    - "[API connection from ...]"
```

## TEAM

```yaml
team:
  crm_admin: "[name or role]"
  sales_team_size: "[number]"
  cs_team_size: "[number]"
  admin_capacity: "[hours/week available for CRM maintenance]"
```

## MESSAGING

```yaml
voice_and_tone:
  - "[direct]"
  - "[data-driven]"
messaging_guardrails:
  - "[no-go claim or data privacy rule]"
```

## DELIVERABLES LOG

```text
- YYYY-MM-DD | Twenty CRM Package v<N> — <Project Name> | output/<client-slug>/<project-slug>/
```
