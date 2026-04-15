# Brand Kit — Growthub

Public example brand kit for the Twenty CRM Worker Kit.

---

## IDENTITY

```yaml
client_name: "Growthub"
slug: "growthub"
industry: "B2B SaaS / Growth Platform"
company_size: "10-50 employees"
primary_offer: "AI-native local intelligence platform for growth teams"
campaign_owner: "Growthub Growth Team"
date_onboarded: "2026-04-15"
```

## CRM OBJECTIVE

```yaml
primary_crm_objective: "lead pipeline management and partner CRM"
current_crm_tool: "none (first-time CRM adoption)"
reason_for_switching: "first-time adoption — scaling GTM motion requires structured CRM"
deployment_mode: "cloud"
go_live_target: "2026-05-01"
```

## AUDIENCE AND PIPELINE

```yaml
primary_persona:
  role: "Head of Growth / GTM Lead"
  company_type: "B2B SaaS startup (Series A–B)"
  pain_point: "scattered lead data across spreadsheets, no pipeline visibility, no enrichment"
  desired_outcome: "structured pipeline with automated enrichment and clear stage ownership"
  awareness_level: "high — already evaluating CRM options"

pipeline_stages:
  - "Lead — new contact captured"
  - "Qualified — ICP-fit confirmed"
  - "Demo — intro call scheduled or completed"
  - "Proposal — commercial terms under discussion"
  - "Closed Won — deal signed"
  - "Closed Lost — deal lost with reason recorded"
```

## TECH STACK

```yaml
current_tools:
  email_provider: "Gmail (Google Workspace)"
  enrichment_providers:
    - "Apollo (primary outbound lead source)"
    - "Clay (enrichment waterfall)"
  product_analytics: "Segment"
  billing: "Stripe"
  support: "Intercom"
  marketing: "none (using direct outbound only)"
  data_sources:
    - "Apollo CSV exports (contacts + companies)"
    - "Stripe webhook events (customer created, subscription updated)"
    - "Intercom webhook events (conversation started, resolved)"
```

## TEAM

```yaml
team:
  crm_admin: "Head of Growth"
  sales_team_size: "3"
  cs_team_size: "2"
  admin_capacity: "4 hours/week available for CRM maintenance"
```

## MESSAGING

```yaml
voice_and_tone:
  - "direct"
  - "data-driven"
  - "operator-first"
messaging_guardrails:
  - "do not overstate pipeline values in examples"
  - "do not log client data in shared artifacts"
```

## DELIVERABLES LOG

```text
- 2026-04-15 | Twenty CRM Package v1 — Growthub GTM Stack | output/growthub/gtm-crm-v1/
```
