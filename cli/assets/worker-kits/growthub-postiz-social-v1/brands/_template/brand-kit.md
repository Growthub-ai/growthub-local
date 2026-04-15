# Brand Kit — [CLIENT NAME]

> Copy to `brands/<client-slug>/brand-kit.md` and fill before producing outputs.

---

## IDENTITY

```yaml
client_name: ""
slug: ""                       # URL-safe, lowercase, hyphens
industry: ""
primary_service: ""            # e.g., "B2B social + lifecycle email via Postiz"
campaign_name: ""
date_onboarded: ""             # YYYY-MM-DD
account_owner: ""
```

---

## AUDIENCE

```yaml
target_persona:
  role: ""
  company_type: ""
  pain_point: ""
  intent: ""

geographic_target: ""

do_not_attract:
  - ""
```

---

## CHANNELS AND WORKSPACES

```yaml
primary_channels:               # e.g., ["linkedin", "x", "youtube_shorts"]
secondary_channels: []
postiz_workspace_notes: ""      # How workspaces map to brands/teams (inspect fork/UI)
approval_chain: ""              # e.g., "Founder → Head of Marketing"
```

---

## MESSAGING

```yaml
core_message: ""
tone:
  - ""
  - ""

approved_phrases:
  - ""

messaging_guardrails:
  - ""

cta_text: ""
```

---

## COMPLIANCE

```yaml
regulated_vertical: false       # finance, health, politics, etc.
disclosure_rules: ""            # #ad, partnership tags, regional rules
banned_topics:
  - ""
```

---

## CALENDAR OBJECTIVES

```yaml
calendar_objective: ""          # One line north star for the next 2–4 weeks
pillar_urls:                    # AEO/SEO tie-in — pages to push in social
  - ""
utm_campaign_default: ""
```

---

## DELIVERABLES LOG

Append one line per shipped pack:

```
- YYYY-MM-DD | Postiz Social Pack v<N> — <Project> | output/<slug>/<project>/
```
