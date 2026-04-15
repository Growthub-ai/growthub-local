# Lead Enrichment Pipeline — Growthub (SAMPLE)

**Date:** 2026-04-15  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `cloud`

> **Note:** This is a sample output. Adapt all values to the actual client context.

---

## 1. ENRICHMENT PROVIDER(S)

| Provider | Auth mechanism | Data tier | Primary use |
|---|---|---|---|
| Apollo | Bearer token | Person + Company | Outbound lead source |
| Clay | API key | Person + Company | Enrichment waterfall (email verification + firmographic) |

---

## 2. SOURCE FIELDS PROVIDED

### Apollo — Person fields

| Provider field | Data type | Example value |
|---|---|---|
| `first_name` | string | `Jane` |
| `last_name` | string | `Doe` |
| `email` | string | `jane@acme.com` |
| `title` | string | `Head of Growth` |
| `seniority` | string | `director` |
| `linkedin_url` | string | `https://linkedin.com/in/janedoe` |
| `city` | string | `San Francisco` |
| `organization.name` | string | `Acme Corp` |
| `organization.website_url` | string | `https://acme.com` |
| `organization.estimated_num_employees` | integer | `250` |

---

## 3. DEDUPLICATION STRATEGY

**Person dedup key:** `emails.primaryEmail`  
**Company dedup key:** `domain`  
**Secondary person key (when email unavailable):** `linkedInLink.url`

**Dedup behavior:**
- Match found → **merge** (update existing record with enriched fields, preserve existing data)
- No match found → **insert** (create new record)
- If both email and LinkedIn are absent → **skip and log** for manual review

---

## 4. IMPORT MODE

**Selected mode:** `merge-with-insert-fallback`

**Rationale:** Growthub has existing contacts from previous manual spreadsheet work. Merging ensures enrichment data layers on top without creating duplicates.

---

## 5. IMPORT METHOD

**Method:** CSV import via Twenty UI (first batch), then GraphQL mutation batch (ongoing enrichment)

**Import sequence:**
1. Export Apollo contact list as CSV with all available fields selected
2. Clean CSV: lowercase all emails, strip `https://` and trailing slashes from domain field
3. Import Company records first (Settings > Companies > Import)
4. Import Person records second with company linking enabled
5. Run post-import audit

**Batch size recommendation:** 500 records per batch

---

## 6. FIELD MAPPING (SUMMARY)

| Source field | → | Twenty object | Twenty field | Transformation |
|---|---|---|---|---|
| `email` | → | `Person` | `emails.primaryEmail` | lowercase, trim |
| `first_name` | → | `Person` | `name.firstName` | none |
| `last_name` | → | `Person` | `name.lastName` | none |
| `title` | → | `Person` | `position` | none |
| `linkedin_url` | → | `Person` | `linkedInLink.url` | none |
| `city` | → | `Person` | `city` | none |
| `organization.name` | → | `Company` | `name` | none |
| `organization.website_url` | → | `Company` | `domain` | strip `https://` and trailing `/` |
| `organization.estimated_num_employees` | → | `Company` | `employees` | integer cast |

---

## 7. POST-IMPORT VALIDATION

| Check | Expected result | Actual result |
|---|---|---|
| Total Person records imported | ~1,200 | [fill after import] |
| Total Company records imported | ~400 | [fill after import] |
| Duplicate email check | 0 duplicates | [fill after import] |
| Company linkage rate | ≥ 90% | [fill after import] |
| Skipped records (no email) | < 5% | [fill after import] |

---

## 8. ERROR AND FAILURE HANDLING

| Error type | Behavior | Resolution |
|---|---|---|
| Invalid email format | Skip record, log to `enrichment-errors.csv` | Manual review and clean |
| Duplicate email (post-dedup) | Merge into existing record | Review merged record for accuracy |
| Missing company domain | Create Company with name only; flag for manual domain entry | Review flagged companies weekly |
| API rate limit hit | Pause 30 seconds, retry with smaller batch | Reduce to 250 records/batch |

---

## 9. UPDATE FREQUENCY

**Enrichment cadence:** Weekly on Monday mornings  
**Trigger:** Apollo saves a new export on Sundays; enrichment job runs at 6 AM Monday via cron
