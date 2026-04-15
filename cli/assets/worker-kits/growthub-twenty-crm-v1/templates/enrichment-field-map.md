# Enrichment Field Map — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Provider:** [Apollo / Clearbit / Clay / Hunter / other]

---

## PERSON FIELD MAP

**Dedup key:** `emails.primaryEmail`  
**Update frequency:** [weekly / monthly / on-trigger]

| Provider field | Provider type | → | Twenty object | Twenty field | Twenty type | Transformation | Required |
|---|---|---|---|---|---|---|---|
| `first_name` | string | → | `Person` | `name.firstName` | `TEXT` | none | Yes |
| `last_name` | string | → | `Person` | `name.lastName` | `TEXT` | none | Yes |
| `email` | string | → | `Person` | `emails.primaryEmail` | `EMAILS` | lowercase, trim | Yes (dedup key) |
| `phone_numbers[0].raw_number` | string | → | `Person` | `phones.primaryPhoneNumber` | `PHONES` | none | No |
| `title` | string | → | `Person` | `position` | `TEXT` | none | No |
| `linkedin_url` | string | → | `Person` | `linkedInLink.url` | `LINK` | none | No |
| `city` | string | → | `Person` | `city` | `TEXT` | none | No |
| `seniority` | string | → | `Person` | `[custom field: seniority]` | `SELECT` | map to SELECT options | No |
| `departments` | array | → | `Person` | `[custom field: department]` | `TEXT` | join with comma | No |
| `[provider field]` | [type] | → | `Person` | `[field]` | `[type]` | [transform] | [Yes/No] |

---

## COMPANY FIELD MAP

**Dedup key:** `domain`  
**Update frequency:** [same as person / separate cadence]`

| Provider field | Provider type | → | Twenty object | Twenty field | Twenty type | Transformation | Required |
|---|---|---|---|---|---|---|---|
| `organization.name` | string | → | `Company` | `name` | `TEXT` | none | Yes |
| `organization.website_url` | string | → | `Company` | `domain` | `TEXT` | strip protocol, strip trailing slash | Yes (dedup key) |
| `organization.estimated_num_employees` | integer | → | `Company` | `employees` | `NUMBER` | integer cast | No |
| `organization.annual_revenue` | number | → | `Company` | `annualRecurringRevenue.amountMicros` | `CURRENCY` | multiply by 1,000,000 | No |
| `organization.industry` | string | → | `Company` | `[custom field: industry]` | `SELECT` | map to SELECT options | No |
| `organization.linkedin_url` | string | → | `Company` | `linkedInLink.url` | `LINK` | none | No |
| `[provider field]` | [type] | → | `Company` | `[field]` | `[type]` | [transform] | [Yes/No] |

---

## SELECT OPTION MAPPINGS

### seniority → Person.seniority

| Provider value | → | Twenty SELECT value |
|---|---|---|
| `founder` | → | `FOUNDER` |
| `c_suite` | → | `C_SUITE` |
| `vp` | → | `VP` |
| `director` | → | `DIRECTOR` |
| `manager` | → | `MANAGER` |
| `individual_contributor` | → | `INDIVIDUAL_CONTRIBUTOR` |
| `[value]` | → | `[TWENTY_VALUE]` |

### industry → Company.industry

| Provider value | → | Twenty SELECT value |
|---|---|---|
| `software` | → | `SOFTWARE` |
| `saas` | → | `SOFTWARE` |
| `fintech` | → | `FINTECH` |
| `healthtech` | → | `HEALTHTECH` |
| `ecommerce` | → | `ECOMMERCE` |
| `[value]` | → | `[TWENTY_VALUE]` |

---

## FIELDS EXCLUDED FROM ENRICHMENT

| Provider field | Reason for exclusion |
|---|---|
| `id` | Internal provider ID — not stored in Twenty |
| `photo_url` | Not mapped — no avatar field in standard Twenty |
| `[field]` | [reason] |

---

## EDGE CASES AND NOTES

| Case | Handling |
|---|---|
| Email is null | Skip record — log to error file |
| Domain is null on company | Attempt to extract from email domain — if still null, skip |
| Multiple emails returned | Use `email` field as primary; log additional emails |
| Revenue value is 0 | Do not import — leave `annualRecurringRevenue` blank |
| [Case] | [handling] |

---

## ENRICHMENT MATCH KEY SUMMARY

| Object | Primary key | Secondary key | Fallback |
|---|---|---|---|
| `Person` | `emails.primaryEmail` | `linkedInLink.url` | Skip and log |
| `Company` | `domain` | `name` (exact match) | Create new |
