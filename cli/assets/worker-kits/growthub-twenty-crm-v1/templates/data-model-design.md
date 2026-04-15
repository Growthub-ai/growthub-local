# Data Model Design — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `[cloud / self-hosted / local-fork / agent-only]`

---

## 1. STANDARD OBJECTS IN USE

| Object | In use? | Configuration notes |
|---|---|---|
| `Person` | [Yes / No] | [e.g. "primary contact object — email as dedup key"] |
| `Company` | [Yes / No] | [e.g. "linked to Person via relation"] |
| `Opportunity` | [Yes / No] | [e.g. "6-stage pipeline: Lead → Closed Won"] |
| `Note` | [Yes / No] | [e.g. "used for Intercom conversation summaries"] |
| `Task` | [Yes / No] | [e.g. "auto-created by stage-change automation"] |
| `Workspace Member` | Yes | [roles: admin, sales, cs] |

---

## 2. CUSTOM OBJECTS

### [Custom Object Name 1]

**Purpose:** [description]  
**Creation method:** [UI (Settings > Objects) / metadata API]

| Field name | Type | Required | Options / Notes |
|---|---|---|---|
| `[fieldName]` | `[TEXT / NUMBER / SELECT / RELATION / ...]` | [Yes / No] | [options or notes] |
| `[fieldName]` | `[TYPE]` | [Yes / No] | |

**Relationships:**
- Links to `[Object]` via `[fieldName]` (one-to-one / one-to-many / many-to-many)

**Display configuration:**
- Label (singular): [label]
- Label (plural): [label plural]
- Icon: [Twenty icon name]
- Default view: [list / kanban]

---

## 3. PERSON OBJECT — FIELD CONFIGURATION

| Field name | Type | Required | Notes |
|---|---|---|---|
| `name.firstName` | `TEXT` | Yes | |
| `name.lastName` | `TEXT` | Yes | |
| `emails.primaryEmail` | `EMAILS` | Yes | Dedup key |
| `phones.primaryPhoneNumber` | `PHONES` | No | |
| `company` | `RELATION` | No | Links to Company |
| `position` | `TEXT` | No | Job title |
| `linkedInLink.url` | `LINK` | No | |
| `city` | `TEXT` | No | |
| `[customField]` | `[TYPE]` | [Yes/No] | [source: enrichment provider] |

---

## 4. COMPANY OBJECT — FIELD CONFIGURATION

| Field name | Type | Required | Notes |
|---|---|---|---|
| `name` | `TEXT` | Yes | |
| `domain` | `TEXT` | No | Dedup key |
| `employees` | `NUMBER` | No | |
| `annualRecurringRevenue.amountMicros` | `CURRENCY` | No | |
| `address` | `ADDRESS` | No | |
| `linkedInLink.url` | `LINK` | No | |
| `[customField]` | `[TYPE]` | [Yes/No] | |

---

## 5. OPPORTUNITY OBJECT — FIELD CONFIGURATION

| Field name | Type | Required | Notes |
|---|---|---|---|
| `name` | `TEXT` | Yes | |
| `stage` | `SELECT` | Yes | See stage options below |
| `amount.amountMicros` | `CURRENCY` | No | Store in micros (×1,000,000) |
| `closeDate` | `DATE` | No | ISO 8601 |
| `pointOfContact` | `RELATION` | No | Links to Person |
| `[customField]` | `[TYPE]` | [Yes/No] | |

**Stage options (SELECT values):**

| Value | Label | Order |
|---|---|---|
| `LEAD` | Lead | 1 |
| `QUALIFIED` | Qualified | 2 |
| `DEMO` | Demo | 3 |
| `PROPOSAL` | Proposal | 4 |
| `CLOSED_WON` | Closed Won | 5 |
| `CLOSED_LOST` | Closed Lost | 6 |

---

## 6. RELATIONSHIP MAP

```text
Person ──── company ────> Company
Person <─── pointOfContact ─── Opportunity
Company <─── [relation] ─── [CustomObject]
```

---

## 7. OPEN QUESTIONS / DECISIONS REQUIRED

- [ ] [Decision 1 — e.g. "Should LeadSource be a custom field on Person or a separate custom object?"]
- [ ] [Decision 2]
