# Twenty CRM Operator — Master Skill Doc

**Source of truth for methodology. Read this file completely before beginning any task.**

---

## QUICK REFERENCE TABLE

| Resource | Path |
|---|---|
| Agent operating law | `workers/twenty-crm-operator/CLAUDE.md` |
| Brand kit template | `brands/_template/brand-kit.md` |
| Growthub example brand kit | `brands/growthub/brand-kit.md` |
| Output contract | `output-standards.md` |
| Runtime assumptions | `runtime-assumptions.md` |
| Fork integration notes | `docs/twenty-fork-integration.md` |
| API and webhooks doc | `docs/api-and-webhooks.md` |
| Data model layer doc | `docs/data-model-layer.md` |
| CRM setup brief | `templates/crm-setup-brief.md` |
| Data model design | `templates/data-model-design.md` |
| Lead enrichment pipeline | `templates/lead-enrichment-pipeline.md` |
| Pipeline automation brief | `templates/pipeline-automation-brief.md` |
| Webhook integration spec | `templates/webhook-integration-spec.md` |
| API query plan | `templates/api-query-plan.md` |
| CRM playbook | `templates/crm-playbook.md` |
| Custom object design | `templates/custom-object-design.md` |
| Import mapping | `templates/import-mapping.md` |
| Workspace config checklist | `templates/workspace-config-checklist.md` |
| Integration handoff | `templates/integration-handoff.md` |
| Enrichment field map | `templates/enrichment-field-map.md` |
| Sample CRM setup | `examples/crm-setup-sample.md` |
| Sample enrichment pipeline | `examples/lead-enrichment-sample.md` |
| Sample pipeline automation | `examples/pipeline-automation-sample.md` |
| Sample CRM playbook | `examples/crm-playbook-sample.md` |

---

## STEP 0 — BEFORE ANY TASK, ANSWER THESE QUESTIONS

Before producing anything, confirm:

1. Which client or brand is this for?
2. What is the primary CRM use case?
3. What data sources exist today?
4. What deployment mode is the client using?
5. Does the client have a local fork available for inspection?
6. What is the expected go-live scope: data model only / pipeline only / full implementation?

If any of these are unknown after the 3-question gate in CLAUDE.md, stop and ask.

---

## STEP 1 — LOAD THE BRAND KIT

Read `brands/<client-slug>/brand-kit.md` if it exists. Otherwise start from `brands/_template/brand-kit.md`.

Extract:
- client identity (name, slug, industry, company size)
- primary CRM objective
- current tech stack and data sources
- pipeline stages and deal flow
- team size and CRM admin capacity
- target enrichment providers
- existing deliverables log

The brand kit drives all output naming, object naming conventions, and proposal context.

---

## STEP 2 — CHECK THE WORKING SUBSTRATE

If the user has a local Twenty fork, inspect it before planning anything.

### Source-of-truth file order in the fork

1. `README.md`
2. `packages/twenty-server/src/modules/` — standard CRM object modules
3. `packages/twenty-server/src/metadata/` — custom object and field metadata API
4. `packages/twenty-server/src/api/` — REST and GraphQL endpoint definitions
5. `packages/twenty-server/src/workflow/` — workflow trigger and action engine
6. `packages/twenty-front/src/modules/` — UI module definitions
7. `packages/twenty-cli/src/` — CLI command surface
8. `docker-compose.yml` — self-hosted stack definition

### What to verify in the fork

- Which standard CRM objects are present (`Person`, `Company`, `Opportunity`, etc.)
- Whether the metadata API is enabled and accessible
- What workflow trigger types are implemented
- Whether webhook outbound actions are supported
- What the GraphQL schema looks like for the target objects
- Which CLI commands are available
- Whether any custom modules are already registered

If the fork cannot be inspected, use the frozen assumptions in `runtime-assumptions.md` and label outputs `assumption-based`.

---

## STEP 3 — WORKFLOW SELECTION LOGIC

Select the narrowest workflow scope that satisfies the real job.

| Workflow | Primary Use | Data Model Required? | Automation Required? |
|---|---|---|---|
| `crm-setup` | Net-new workspace from scratch | Yes | Optional |
| `data-model` | Object schema design only | Yes | No |
| `lead-enrichment` | Import + enrichment pipeline | Yes | Optional |
| `pipeline-automation` | Trigger-action automation | Existing model assumed | Yes |
| `webhook-integration` | External event or outbound hook | Existing model assumed | Yes |
| `api-reporting` | Query plans for data access | Existing model assumed | No |
| `full-playbook` | All-in CRM operator documentation | Yes | Yes |

Default selection rules:
- "Set up Twenty from scratch" → `crm-setup` → escalate to `full-playbook`
- "Design objects for X use case" → `data-model`
- "Connect Apollo / Clearbit / Clay" → `lead-enrichment`
- "Automate follow-up / stage transitions" → `pipeline-automation`
- "Connect Segment / Stripe / Intercom" → `webhook-integration`
- "Build a dashboard or export data" → `api-reporting`

---

## STEP 4 — DATA MODEL DESIGN LOGIC

Twenty supports both standard objects and fully custom metadata-defined objects.

### Standard objects (always available)

| Object | Purpose | Key fields |
|---|---|---|
| `Person` | Individual contacts | name, email, phone, company, city, linkedInLink, position |
| `Company` | Organizations | name, domain, employees, annualRecurringRevenue, address |
| `Opportunity` | Deals and pipeline | name, stage, amount, closeDate, pointOfContact |
| `Note` | Freeform notes | body, author, target (relation) |
| `Task` | Action items | title, dueAt, assignee, status, target (relation) |
| `Workspace Member` | Team users | name, email, role |

### Custom objects

When standard objects do not fit the use case:

1. Define the object in `templates/custom-object-design.md`
2. Specify all fields (name, type, required, select options if enum)
3. Define relationships to standard or other custom objects
4. Document whether creation is via UI (`Settings > Objects`) or metadata API
5. Define the default view configuration

### Field types available in Twenty

- `TEXT` — single-line text
- `RICH_TEXT` — multi-line rich text
- `NUMBER` — numeric (integer or decimal)
- `BOOLEAN` — true/false toggle
- `DATE` — date only
- `DATE_TIME` — date and time
- `SELECT` — single-choice from predefined options
- `MULTI_SELECT` — multi-choice from predefined options
- `RELATION` — link to another object (one-to-one, one-to-many, many-to-many)
- `LINK` — URL field (label + href)
- `EMAILS` — multi-email field with primary designation
- `PHONES` — multi-phone field with primary designation
- `CURRENCY` — amount + currency code pair
- `ADDRESS` — structured address (street, city, state, country, postalCode)
- `RATING` — 1–5 star rating

### Naming conventions

- Object names: PascalCase (`LeadScore`, `PartnerAccount`)
- Field names: camelCase (`enrichmentSource`, `closeDate`)
- Select option values: SCREAMING_SNAKE_CASE (`QUALIFIED`, `NOT_INTERESTED`)

---

## STEP 5 — LEAD ENRICHMENT PIPELINE LOGIC

Enrichment pipelines connect external data providers to Twenty CRM contact and company records.

### Supported enrichment patterns

| Pattern | Description |
|---|---|
| CSV import + field map | Bulk import from Apollo/Clay export with field-to-Twenty mapping |
| Webhook ingest | Inbound webhook from enrichment provider populates records |
| GraphQL mutation | Direct API call to create/update Person or Company records |
| REST API batch | POST to Twenty REST API with enriched data |

### Deduplication strategy (required)

Every enrichment pipeline must define a match key before import:

| Match key | When to use |
|---|---|
| `email` | Primary match for Person objects — highest reliability |
| `domain` | Primary match for Company objects |
| `linkedInLink` | Secondary match for Person when email is unavailable |
| `phone` | Tertiary match — use only when domain and email are both absent |
| Composite | Email + domain for contacts with company context |

Deduplication behavior in Twenty:
- On import, Twenty checks for existing records matching the key field
- If a match is found: update existing record (merge mode)
- If no match: create new record (insert mode)
- Always document whether the pipeline runs in merge or insert-only mode

### Enrichment field map requirements

For every provider integration, produce an `EnrichmentFieldMap` that lists:
- provider field name
- provider data type
- target Twenty object
- target Twenty field name
- target Twenty field type
- transformation required (none / normalize / truncate / format)
- required / optional

Use `templates/enrichment-field-map.md`.

---

## STEP 6 — PIPELINE AUTOMATION LOGIC

Twenty's workflow engine supports trigger-action automation for any object.

### Trigger types

| Trigger | Event |
|---|---|
| `on_create` | A record of the specified object type is created |
| `on_update` | A record is updated (optionally scoped to specific fields) |
| `on_field_change` | A specific field value changes (supports before/after conditions) |
| `on_delete` | A record is deleted |
| `on_schedule` | Time-based trigger (cron expression) |
| `on_webhook` | Inbound webhook event triggers a workflow |

### Action types

| Action | What it does |
|---|---|
| `update_field` | Set one or more fields on the trigger record or a related record |
| `create_record` | Create a new record of any object type |
| `send_webhook` | Fire an outbound HTTP POST to an external endpoint |
| `assign_owner` | Assign the record to a specific workspace member or rotation |
| `create_task` | Create a Task linked to the trigger record |
| `send_notification` | In-app notification to a workspace member |

### Automation design rules

- One trigger per workflow — do not chain triggers into a single workflow definition
- Conditions on `on_update` must specify which field changed and what values are relevant
- `send_webhook` actions must include the full endpoint, payload schema, and retry policy
- Every automation must have an explicit "when this fails" path documented
- Do not design polling loops when `on_update` or `on_webhook` triggers are available

---

## STEP 7 — API AND WEBHOOK INTEGRATION LOGIC

### GraphQL API

Twenty's GraphQL API is the primary data access surface.

Common query patterns:

```graphql
# Fetch all persons with company relation
query {
  people {
    edges {
      node {
        id
        name { firstName lastName }
        emails { primaryEmail }
        company { name domain }
        createdAt
      }
    }
  }
}

# Create a person record
mutation {
  createPerson(data: {
    name: { firstName: "Jane", lastName: "Doe" }
    emails: { primaryEmail: "jane@example.com" }
    companyId: "<company-id>"
  }) {
    id
    createdAt
  }
}

# Update an opportunity stage
mutation {
  updateOpportunity(
    id: "<opportunity-id>"
    data: { stage: "CLOSING" }
  ) {
    id
    stage
    updatedAt
  }
}
```

### REST API

Twenty provides a REST API at `/api/objects/<object-name>` for simple CRUD operations.

```bash
# GET all companies
GET /api/objects/companies

# POST a new person
POST /api/objects/people
Content-Type: application/json
Authorization: Bearer <app-token>

# PATCH update a field
PATCH /api/objects/opportunities/<id>
```

### Webhooks

Twenty emits webhook events for object lifecycle events.

Event naming pattern: `<object>.<event>` (e.g., `opportunity.created`, `person.updated`)

Every webhook spec must define:
- event name
- trigger object and conditions
- payload schema (what Twenty sends)
- target endpoint URL pattern
- auth mechanism on the receiving end
- retry policy (Twenty default: 3 attempts with exponential backoff)

---

## STEP 8 — IMPORT AND MIGRATION LOGIC

When migrating from another CRM (Salesforce, HubSpot, Pipedrive, Airtable):

### Import workflow

1. Export data from source CRM as CSV
2. Clean and deduplicate the CSV (remove test records, normalize email format)
3. Produce an `ImportMapping` document that maps every source column to a Twenty field
4. Run a sample import (first 50 rows) and verify field alignment
5. Run the full import
6. Run a post-import audit: record count, duplicate check, relation integrity

### Common source-to-Twenty field mappings

| Source (generic) | Twenty Field | Object | Notes |
|---|---|---|---|
| First Name | `name.firstName` | Person | |
| Last Name | `name.lastName` | Person | |
| Email | `emails.primaryEmail` | Person | Use as dedup key |
| Phone | `phones.primaryPhoneNumber` | Person | |
| Company Name | `company.name` | Company | Create or link |
| Company Domain | `company.domain` | Company | Use as dedup key |
| Job Title | `position` | Person | |
| LinkedIn URL | `linkedInLink.url` | Person | |
| Deal Name | `name` | Opportunity | |
| Deal Stage | `stage` | Opportunity | Map to Twenty select values |
| Deal Value | `amount.amountMicros` | Opportunity | Multiply by 1,000,000 for micros |
| Close Date | `closeDate` | Opportunity | ISO 8601 format |

---

## STEP 9 — OUTPUT ORDER

Produce artifacts in this strict order:

1. CRM Setup Brief (`templates/crm-setup-brief.md`)
2. Data Model Design (`templates/data-model-design.md`)
3. Lead Enrichment Pipeline (`templates/lead-enrichment-pipeline.md`)
4. Pipeline Automation Brief (`templates/pipeline-automation-brief.md`)
5. Webhook Integration Spec (`templates/webhook-integration-spec.md`)
6. API Query Plan (`templates/api-query-plan.md`)
7. Custom Object Design (`templates/custom-object-design.md`) — if custom objects required
8. Import Mapping (`templates/import-mapping.md`) — if data migration required
9. Workspace Config Checklist (`templates/workspace-config-checklist.md`)
10. Integration Handoff (`templates/integration-handoff.md`)
11. Enrichment Field Map (`templates/enrichment-field-map.md`)
12. CRM Playbook (`templates/crm-playbook.md`)

---

## STEP 10 — QUALITY BAR

Good output looks like this:

- all object schemas are grounded in Twenty's actual field types and naming conventions
- data model is complete before any automation or pipeline spec is written
- deduplication key is explicitly named in every import or enrichment pipeline
- every automation trigger-action pair has a named failure path
- webhook specs include the full payload schema, not just the event name
- GraphQL queries are syntactically correct and reference real Twenty field paths
- CRM playbook is written at a level a non-technical team member can execute
- every output file can be handed to a developer or CRM admin and acted on immediately
- no filler paragraphs — every sentence either presents a decision, explains a constraint, or specifies an action
