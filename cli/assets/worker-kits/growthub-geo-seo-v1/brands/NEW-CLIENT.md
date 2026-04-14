# New Client Brand Kit Setup

Follow these steps to add a new client to the GEO SEO Studio.

---

## Step 1 — Copy the Template

```bash
# Replace <client-slug> with the client's URL-safe slug (lowercase, hyphens only)
cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
```

Examples:
```bash
cp brands/_template/brand-kit.md brands/urban-cycle/brand-kit.md
cp brands/_template/brand-kit.md brands/acme-saas/brand-kit.md
cp brands/_template/brand-kit.md brands/coastal-dental/brand-kit.md
```

---

## Step 2 — Fill In Required Fields

Open `brands/<client-slug>/brand-kit.md` and fill in all fields. The required fields are:

| Field | Location | Why It Matters |
|---|---|---|
| `client_name` | IDENTITY | Used in all output file names and reports |
| `slug` | IDENTITY | Must match the directory name — used in output paths |
| `industry` | IDENTITY | Context for tone calibration and benchmark comparison |
| `primary_service` | IDENTITY | What GEO/SEO work is being done |
| `date_onboarded` | IDENTITY | Tracks when the engagement started |
| `account_owner` | IDENTITY | Who is responsible for this account |
| `target_persona.pain_point` | AUDIENCE | Drives messaging tone in proposals and reports |
| `geographic_target` | AUDIENCE | Informs platform and language scope |
| `core_message` | MESSAGING | Used in client proposals |
| `tone` | MESSAGING | Calibrates how the operator writes client-facing content |
| `target_url` | AUDIT SCOPE | The domain to audit |
| `audit_type` | AUDIT SCOPE | quick / full / report / specific-command |
| `delivery_format` | AUDIT SCOPE | markdown / pdf / both |
| `prospect_stage` | AGENCY CONTEXT | discovery / proposal-sent / active / etc. |

Optional but recommended:
- `competitor_urls` — enables `/geo compare` command
- `monthly_retainer_range` — appears in proposals
- `crm_notes` — any notes about the account

---

## Step 3 — Tell the Agent to Use It

At the start of your session, tell the GEO SEO Operator:

> "Use the brand kit at brands/<client-slug>/brand-kit.md for this session."

Or the operator will automatically look for `brands/<client-slug>/brand-kit.md` based on the client name you provide.

---

## Step 4 — Update the Deliverables Log

After each audit package is delivered, append a line to the brand kit's DELIVERABLES LOG:

```
- YYYY-MM-DD | GEO SEO Audit Package v<N> — <Project Name> | output/<client-slug>/<project-slug>/
```

The operator will do this automatically at Step 10 of the workflow.

---

## Multiple Clients

Each client gets its own subdirectory under `brands/`:

```
brands/
  _template/
    brand-kit.md          ← blank template — never fill this in
  growthub/
    brand-kit.md          ← Growthub internal reference example
  urban-cycle/
    brand-kit.md          ← client brand kit
  acme-saas/
    brand-kit.md          ← client brand kit
  NEW-CLIENT.md           ← this file
```

Do not modify `brands/_template/brand-kit.md` — it is the frozen template. Always copy it before filling in client details.

---

## Brand Kit Field Reference

| Section | Fields |
|---|---|
| IDENTITY | client_name, slug, industry, primary_service, campaign_name, date_onboarded, account_owner |
| AUDIENCE | target_persona (role, company_type, pain_point, intent), geographic_target, do_not_attract |
| MESSAGING | core_message, tone, approved_phrases, messaging_guardrails, cta_text |
| BRAND DESIGN | colors (primary, secondary, accent, dark, white), fonts, logo_file, logo_on_dark |
| AUDIT SCOPE | target_url, competitor_urls, audit_type, delivery_format |
| AGENCY CONTEXT | monthly_retainer_range, prospect_stage, crm_notes |
| DELIVERABLES LOG | Running log of all delivered audit packages |
