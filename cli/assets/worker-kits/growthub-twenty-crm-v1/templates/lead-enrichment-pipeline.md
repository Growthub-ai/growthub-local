# Lead Enrichment Pipeline — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `[cloud / self-hosted / local-fork / agent-only]`

---

## 1. ENRICHMENT PROVIDER(S)

| Provider | Auth mechanism | Data tier | Primary use |
|---|---|---|---|
| [Apollo] | Bearer token | Person + Company | Outbound lead source |
| [Clearbit] | Bearer token | Company | Company enrichment |
| [Clay] | API key | Person + Company | Enrichment waterfall |
| [Hunter] | API key | Person | Email verification |

---

## 2. SOURCE FIELDS PROVIDED

### [Provider name] — Person fields

| Provider field | Data type | Example value |
|---|---|---|
| `first_name` | string | `Jane` |
| `last_name` | string | `Doe` |
| `email` | string | `jane@example.com` |
| `title` | string | `Head of Growth` |
| `linkedin_url` | string | `https://linkedin.com/in/janedoe` |
| `organization.name` | string | `Acme Corp` |
| `organization.website_url` | string | `acme.com` |

### [Provider name] — Company fields

| Provider field | Data type | Example value |
|---|---|---|
| `name` | string | `Acme Corp` |
| `website_url` | string | `acme.com` |
| `employee_count` | integer | `250` |
| `industry` | string | `Software` |

---

## 3. DEDUPLICATION STRATEGY

**Person dedup key:** `emails.primaryEmail`  
**Company dedup key:** `domain`  
**Secondary person key (when email unavailable):** `linkedInLink.url`

**Dedup behavior:**
- Match found → **merge** (update existing record with enriched fields)
- No match found → **insert** (create new record)
- If both email and LinkedIn are absent → **skip and log** the record for manual review

---

## 4. IMPORT MODE

**Selected mode:** `[insert-only / merge / merge-with-insert-fallback]`

**Rationale:** [Why this mode was chosen for this client's data state]

---

## 5. IMPORT METHOD

**Method:** `[CSV import via Twenty UI / GraphQL mutation batch / REST API batch / webhook ingest]`

**Import sequence:**
1. Export [source] as CSV
2. Clean CSV: remove duplicates, normalize email format (lowercase), strip leading/trailing spaces
3. Run field mapping (see section 6)
4. Upload via Twenty UI (Settings > Import) or batch via API
5. Run post-import audit (section 7)

**Batch size recommendation:** [N] records per batch (to avoid rate limits)

---

## 6. FIELD MAPPING

See `EnrichmentFieldMap` artifact for full field-by-field alignment table.

Summary of key mappings:

| Source field | → | Twenty object | Twenty field | Transformation |
|---|---|---|---|---|
| `email` | → | `Person` | `emails.primaryEmail` | none |
| `first_name` | → | `Person` | `name.firstName` | none |
| `last_name` | → | `Person` | `name.lastName` | none |
| `title` | → | `Person` | `position` | none |
| `linkedin_url` | → | `Person` | `linkedInLink.url` | none |
| `organization.name` | → | `Company` | `name` | none |
| `organization.website_url` | → | `Company` | `domain` | strip protocol prefix |
| `employee_count` | → | `Company` | `employees` | integer cast |

---

## 7. POST-IMPORT VALIDATION

After import completes:

- [ ] Record count matches expected import total (within ±2%)
- [ ] Duplicate check: no duplicate email addresses in Person
- [ ] Relation integrity: all Person records with a company are linked to a Company record
- [ ] Sample review: spot-check 10 records for correct field mapping
- [ ] Error log reviewed: all skipped records documented with reason

---

## 8. ERROR AND FAILURE HANDLING

| Error type | Behavior | Resolution |
|---|---|---|
| Invalid email format | Skip record, log to error file | Manual review |
| Duplicate email (on insert-only) | Skip record, log | Merge manually or switch to merge mode |
| Missing required field | Skip record, log | Enrich from secondary provider |
| API rate limit hit | Pause [N] seconds, retry | Reduce batch size |
| Company not found | Create new Company record | Review after import |

---

## 9. UPDATE FREQUENCY

**Enrichment cadence:** [one-time import / weekly / monthly / on-trigger]

**Trigger for re-enrichment (if event-driven):** [e.g. "when Opportunity stage changes to QUALIFIED"]
