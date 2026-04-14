# Brand Kit — [CLIENT NAME]

> Copy to `brands/<client-slug>/brand-kit.md` and fill in all fields before producing outputs.
> The GEO SEO Operator reads this file at Step 1 of every session.

---

## IDENTITY

```yaml
client_name: ""                # Full legal or trading name
slug: ""                       # URL-safe slug, lowercase, hyphens only (e.g., "urban-cycle")
industry: ""                   # Industry category (e.g., "e-commerce — electric bikes")
primary_service: ""            # What GEO/SEO work is being done (e.g., "GEO + SEO audit and AI search visibility remediation")
campaign_name: ""              # This engagement's name (e.g., "Q2 2026 AI Search Launch Audit")
date_onboarded: ""             # YYYY-MM-DD
account_owner: ""              # Growthub team member responsible for this account
```

---

## AUDIENCE

```yaml
target_persona:
  role: ""                     # Job title or role of the ideal website visitor / buyer
  company_type: ""             # e.g., "DTC e-commerce brand", "B2B SaaS", "local service business"
  pain_point: ""               # What they are struggling with (e.g., "losing organic traffic to AI search answers")
  intent: ""                   # What they are trying to accomplish (e.g., "rank in AI-generated answers, not just Google blue links")

geographic_target: ""          # e.g., "US, Canada, UK" or "Local — Chicago metro"

do_not_attract:                # Who we are NOT trying to reach with this content
  - ""
  - ""
```

---

## MESSAGING

```yaml
core_message: ""               # One sentence: what does this brand want to be known for in AI search?

tone:                          # 3–5 adjectives describing the brand voice
  - ""
  - ""
  - ""

approved_phrases:              # Phrases that are on-brand and should appear in content
  - ""
  - ""
  - ""

messaging_guardrails:          # What NOT to say — claims to avoid, topics to sidestep
  - ""
  - ""

cta_text: ""                   # Primary call-to-action (e.g., "Start your free GEO audit")
```

---

## BRAND DESIGN

```yaml
colors:
  primary: ""                  # Hex code (e.g., "#1A1A2E")
  secondary: ""                # Hex code
  accent: ""                   # Hex code
  dark: ""                     # Hex code — for dark backgrounds
  white: ""                    # Hex code — for light backgrounds (usually #FFFFFF)

fonts:
  heading: ""                  # Font name (e.g., "Inter Bold")
  body: ""                     # Font name (e.g., "Inter Regular")

logo_file: ""                  # Path to logo file (e.g., "brands/<slug>/assets/logo.png")
logo_on_dark: ""               # Path to reversed logo for dark backgrounds
```

---

## AUDIT SCOPE

```yaml
target_url: ""                 # Primary URL to audit (e.g., "https://domain.com")

competitor_urls:               # Competitor domains for comparison — fill per engagement
  - ""
  - ""
  - ""

audit_type: ""                 # quick | full | report | specific-command

delivery_format: ""            # markdown | pdf | both
```

---

## AGENCY CONTEXT

```yaml
monthly_retainer_range: ""     # e.g., "$2,500–$4,000/month" or "N/A — project only"
prospect_stage: ""             # discovery | proposal-sent | active | paused | churned | internal
crm_notes: ""                  # Free text — any notes about the account, deal status, key contacts
```

---

## DELIVERABLES LOG

> Append a line here each time an audit package is delivered.
> Format: `- YYYY-MM-DD | GEO SEO Audit Package v<N> — <Project Name> | output/<client-slug>/<project-slug>/`

<!-- No deliverables yet. First entry goes here. -->
