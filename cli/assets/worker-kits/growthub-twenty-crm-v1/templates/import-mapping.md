# Import Mapping — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Source CRM / tool:** [e.g. Salesforce / HubSpot / Apollo CSV / Airtable]  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `[cloud / self-hosted / local-fork / agent-only]`

---

## 1. SOURCE EXPORT FORMAT

**Format:** `[CSV / JSON / API response]`  
**Export method:** [e.g. "Apollo: Settings > Exports > All Contacts as CSV"]  
**Encoding:** `UTF-8`  
**Record count (estimated):** [N]  
**Date of export:** YYYY-MM-DD

---

## 2. PERSON RECORD MAPPING

**Dedup key:** `emails.primaryEmail`  
**Import mode:** `[insert-only / merge]`

| Source column | Source type | → | Twenty object | Twenty field | Transformation |
|---|---|---|---|---|---|
| `First Name` | string | → | `Person` | `name.firstName` | none |
| `Last Name` | string | → | `Person` | `name.lastName` | none |
| `Email` | string | → | `Person` | `emails.primaryEmail` | lowercase, trim |
| `Phone` | string | → | `Person` | `phones.primaryPhoneNumber` | none |
| `Title` | string | → | `Person` | `position` | none |
| `LinkedIn URL` | string | → | `Person` | `linkedInLink.url` | none |
| `Company Name` | string | → | `Company` | `name` | create or link |
| `[Source column]` | [type] | → | `[Object]` | `[field]` | [transformation] |

**Columns to skip (no mapping):**

| Source column | Reason |
|---|---|
| `[column]` | [reason — e.g. "internal ID not needed in Twenty"] |

---

## 3. COMPANY RECORD MAPPING

**Dedup key:** `domain`  
**Import mode:** `[insert-only / merge]`

| Source column | Source type | → | Twenty object | Twenty field | Transformation |
|---|---|---|---|---|---|
| `Company Name` | string | → | `Company` | `name` | none |
| `Website` | string | → | `Company` | `domain` | strip `https://` prefix, strip trailing `/` |
| `Employee Count` | integer | → | `Company` | `employees` | integer cast |
| `Industry` | string | → | `Company` | `[custom field]` | none |
| `[Source column]` | [type] | → | `Company` | `[field]` | [transformation] |

---

## 4. OPPORTUNITY RECORD MAPPING (if applicable)

**Dedup key:** [opportunity name + company combination — no direct dedup key]  
**Import mode:** `[insert-only]`

| Source column | Source type | → | Twenty object | Twenty field | Transformation |
|---|---|---|---|---|---|
| `Deal Name` | string | → | `Opportunity` | `name` | none |
| `Stage` | string | → | `Opportunity` | `stage` | see stage map below |
| `Amount` | number | → | `Opportunity` | `amount.amountMicros` | multiply by 1,000,000 |
| `Currency` | string | → | `Opportunity` | `amount.currencyCode` | uppercase (e.g. USD) |
| `Close Date` | date | → | `Opportunity` | `closeDate` | ISO 8601 (YYYY-MM-DD) |

**Stage mapping:**

| Source stage value | → | Twenty stage value |
|---|---|---|
| `[New]` | → | `LEAD` |
| `[Qualified]` | → | `QUALIFIED` |
| `[Discovery Call]` | → | `DEMO` |
| `[Proposal Sent]` | → | `PROPOSAL` |
| `[Won]` | → | `CLOSED_WON` |
| `[Lost]` | → | `CLOSED_LOST` |

---

## 5. TRANSFORMATION RULES

| Rule | Field | Input pattern | Output pattern |
|---|---|---|---|
| Domain normalization | `Company.domain` | `https://acme.com/` | `acme.com` |
| Email lowercase | `Person.emails.primaryEmail` | `Jane@ACME.COM` | `jane@acme.com` |
| Amount to micros | `Opportunity.amount.amountMicros` | `10000` | `10000000000` |
| Date to ISO 8601 | `Opportunity.closeDate` | `04/15/2026` | `2026-04-15` |

---

## 6. IMPORT SEQUENCE

1. **Pre-import clean:**
   - Remove records with blank email (Person) or blank domain (Company)
   - Deduplicate within the CSV itself (keep most recent by modification date)
   - Normalize email addresses to lowercase

2. **Company import first:**
   - Import Company CSV before Person CSV so that Person-Company links can be resolved

3. **Person import:**
   - Run Person import with company linking enabled
   - Review linked count vs. unlinked count in import summary

4. **Opportunity import (if applicable):**
   - Run after Person and Company imports
   - Confirm `pointOfContact` and company relations are set

5. **Post-import audit:** see section 7

---

## 7. POST-IMPORT VALIDATION

| Check | Expected result | Action if failed |
|---|---|---|
| Total record count | Within ±2% of source count | Check error log |
| Duplicate email check | 0 duplicates | Merge or remove duplicates |
| Company linkage | ≥ 90% of Persons linked to a Company | Review unlinked persons |
| Required fields | 0 blank required fields | Enrich manually |
| Stage mapping | All stages are valid Twenty values | Fix mapping and re-import affected rows |

---

## 8. ROLLBACK PLAN

If the import produces significant data quality issues:

1. Note the import timestamp
2. Use the Twenty audit log to identify all records created after that timestamp
3. Bulk delete the affected records via the GraphQL API using a `deleteMany` mutation
4. Fix the source CSV and re-import

**Contact the developer** if bulk delete is needed — do not manually delete records one by one.
