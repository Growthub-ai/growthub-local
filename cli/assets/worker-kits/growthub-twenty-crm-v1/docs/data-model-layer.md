# Data Model Layer — Twenty CRM

**Kit:** `growthub-twenty-crm-v1`

---

## OVERVIEW

Twenty CRM's data model layer controls how objects, fields, and relations are defined, stored, and exposed via the API. Understanding this layer is essential for designing accurate CRM schemas and writing reliable migration or enrichment scripts.

---

## STANDARD VS. CUSTOM OBJECTS

### Standard objects

Standard objects ship with Twenty and cannot be deleted. Their core fields are fixed, but additional custom fields can be added.

| Object | Purpose | Key standard fields |
|---|---|---|
| `Person` | Individual contact | `name`, `emails`, `phones`, `company` (relation), `position`, `linkedInLink`, `city` |
| `Company` | Organization | `name`, `domainName`, `employees`, `annualRecurringRevenue`, `address`, `linkedInLink` |
| `Opportunity` | Sales pipeline item | `name`, `stage`, `amount`, `closeDate`, `pointOfContact` (relation), `company` (relation) |
| `Note` | Freeform text | `body`, `noteTargets` (polymorphic relation to any object) |
| `Task` | Action item | `title`, `body`, `dueAt`, `assignee` (relation to WorkspaceMember), `taskTargets` |
| `Workspace Member` | CRM user | `name`, `email`, `role` |

### Custom objects

Custom objects are created via:
- **UI:** Settings > Objects > `+ New custom object`
- **Metadata API:** `createOneObject` mutation at `/metadata`

Once created and activated, custom objects are immediately queryable and mutable via the GraphQL API using automatically generated resolvers.

**Custom object naming:**
- `nameSingular`: camelCase (e.g. `partnerAccount`)
- `namePlural`: camelCase plural (e.g. `partnerAccounts`)
- `labelSingular`: Display name singular (e.g. `Partner Account`)
- `labelPlural`: Display name plural (e.g. `Partner Accounts`)

---

## FIELD TYPES

| Type | Description | Example values |
|---|---|---|
| `TEXT` | Single-line string | `"Jane Doe"`, `"San Francisco"` |
| `RICH_TEXT` | Multi-line rich text | Note body, description |
| `NUMBER` | Integer or decimal | `250`, `4.5` |
| `BOOLEAN` | True/false | `true`, `false` |
| `DATE` | Date only (ISO 8601) | `"2026-04-15"` |
| `DATE_TIME` | Date and time (ISO 8601) | `"2026-04-15T10:00:00.000Z"` |
| `SELECT` | Single choice from options | `"QUALIFIED"`, `"CLOSED_WON"` |
| `MULTI_SELECT` | Multiple choices | `["INBOUND", "REFERRAL"]` |
| `RELATION` | Link to another object | `{ id: "<uuid>" }` |
| `LINK` | URL with optional label | `{ url: "https://...", label: "LinkedIn" }` |
| `EMAILS` | Multi-email with primary | `{ primaryEmail: "jane@example.com" }` |
| `PHONES` | Multi-phone with primary | `{ primaryPhoneNumber: "+14155550100" }` |
| `CURRENCY` | Amount + currency code | `{ amountMicros: 10000000, currencyCode: "USD" }` |
| `ADDRESS` | Structured address | `{ addressStreet1: "...", addressCity: "...", addressCountryCode: "US" }` |
| `RATING` | Star rating (1–5) | `"RATING_4"` |
| `FULL_NAME` | First + last name pair | `{ firstName: "Jane", lastName: "Doe" }` |
| `UUID` | Universally unique identifier | `"a3d9f2..."` |

---

## RELATIONS

Twenty uses three types of relations between objects:

| Relation type | Description |
|---|---|
| One-to-one | One record on each side (rare) |
| One-to-many | One parent record links to many child records (e.g. Company → many Persons) |
| Many-to-many | Records on both sides can link to multiple records on the other side |

### Relation field definition

When you add a RELATION field to an object, you define:
- **Source object** (where the field appears)
- **Target object** (what it links to)
- **Cardinality** (one-to-one, one-to-many, many-to-many)
- **Field name** on both the source and target sides

### Standard relation examples

```text
Person ─── company (manyToOne) ──> Company
Company ─── people (oneToMany) ──> [Person]

Opportunity ─── pointOfContact (manyToOne) ──> Person
Opportunity ─── company (manyToOne) ──> Company

Note ─── noteTargets (polymorphic) ──> [Person | Company | Opportunity | ...]
Task ─── taskTargets (polymorphic) ──> [Person | Company | Opportunity | ...]
```

---

## SELECT FIELD OPTIONS

SELECT fields require predefined options. Each option has:
- `value`: internal identifier, `SCREAMING_SNAKE_CASE` (e.g. `CLOSED_WON`)
- `label`: display name (e.g. `Closed Won`)
- `color`: optional UI color for the badge
- `position`: display order

**Opportunity stage options (default):**

| Value | Label | Typical position |
|---|---|---|
| `LEAD` | Lead | 1 |
| `QUALIFIED` | Qualified | 2 |
| `MEETING` | Meeting | 3 |
| `PROPOSAL` | Proposal | 4 |
| `CUSTOMER` | Customer | 5 |
| `CLOSED` | Closed | 6 |

**Note:** The exact default stage values depend on the Twenty version and workspace seed. Inspect the actual Opportunity object in your workspace before mapping stage values in automation or import scripts.

---

## CURRENCY FIELD: MICROS FORMAT

Twenty stores currency amounts in **micros** (millionths of the base unit) to avoid floating-point precision issues.

**Conversion:**
- `$10,000` → `amountMicros: 10000000000` (multiply by 1,000,000)
- `amountMicros: 5000000` → `$5` (divide by 1,000,000)

Always convert amounts to micros before writing to the API. Always divide by 1,000,000 when reading amounts for display.

---

## ID FORMAT

All Twenty record IDs are UUIDs (version 4). Example:

```
a3d9f2c1-4b5e-4a8b-9c7d-0e1f2a3b4c5d
```

Never assume sequential IDs. Use the UUID when referencing related records in mutations.

---

## SYSTEM FIELDS

Every object (standard or custom) automatically includes these system fields:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key — auto-generated |
| `createdAt` | DATE_TIME | Set at creation — do not override |
| `updatedAt` | DATE_TIME | Set on every update — do not override |
| `deletedAt` | DATE_TIME | Set on soft delete — null if record is active |

Do not create custom fields with these names.

---

## DATABASE LAYER

Twenty uses PostgreSQL. Each workspace has its own schema (multi-tenant by schema). Custom objects create new tables within the workspace schema.

For local-fork development:
- PostgreSQL runs on `localhost:5432` (Docker)
- Default credentials are in `.env` (from `.env.example`)
- Use `npx nx run twenty-server:database:migrate` to run migrations after code changes

**Do not query the database directly in production.** Always use the GraphQL or REST API. Direct database access is only appropriate during local-fork development for schema inspection.
