# Custom Object Design — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `[cloud / self-hosted / local-fork / agent-only]`

---

## CUSTOM OBJECT: [OBJECT NAME]

**Purpose:** [What problem this custom object solves — e.g. "Track partner accounts separate from customer companies"]  
**Creation method:** `[Settings > Objects (UI) / metadata API]`  
**Scope:** `[per-workspace / this client only]`

---

## FIELD TABLE

| Field name (camelCase) | Display label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `[fieldName]` | [Label] | `TEXT` | [Yes / No] | |
| `[fieldName]` | [Label] | `NUMBER` | [Yes / No] | |
| `[fieldName]` | [Label] | `SELECT` | [Yes / No] | Options: [A, B, C] |
| `[fieldName]` | [Label] | `RELATION` | [Yes / No] | Links to `[Object]` |
| `[fieldName]` | [Label] | `DATE` | [Yes / No] | |
| `[fieldName]` | [Label] | `BOOLEAN` | [Yes / No] | |
| `[fieldName]` | [Label] | `LINK` | [Yes / No] | |
| `[fieldName]` | [Label] | `EMAILS` | [Yes / No] | |
| `[fieldName]` | [Label] | `CURRENCY` | [Yes / No] | Store in micros |

**Select field options (if any):**

| Field | Option value (SCREAMING_SNAKE_CASE) | Display label |
|---|---|---|
| `[fieldName]` | `[OPTION_A]` | [Label A] |
| `[fieldName]` | `[OPTION_B]` | [Label B] |

---

## RELATIONSHIP DEFINITIONS

| Relation field | Direction | Target object | Cardinality | Notes |
|---|---|---|---|---|
| `[relationField]` | outgoing | `[TargetObject]` | many-to-one | [notes] |
| `[relationField]` | incoming | `[TargetObject]` | one-to-many | [notes] |

**Relationship map:**

```text
[CustomObject] ──── [relationField] ────> [TargetObject]
[AnotherObject] <─── [inverseField] ─── [CustomObject]
```

---

## DISPLAY CONFIGURATION

| Property | Value |
|---|---|
| Label (singular) | [e.g. Partner Account] |
| Label (plural) | [e.g. Partner Accounts] |
| Icon | [Twenty icon name — e.g. `building`, `user`, `star`] |
| Default view | `[list / kanban]` |
| Kanban grouping field (if kanban) | `[fieldName]` |

---

## CREATION PROCEDURE

### Via UI (Settings > Objects)

1. Go to Settings > Objects
2. Click `+ New custom object`
3. Set label (singular and plural), icon
4. Add each field from the field table above
5. Configure select options for any SELECT fields
6. Add relation fields and select the target object
7. Save and activate the object

### Via Metadata API

```graphql
mutation CreateCustomObject {
  createOneObject(input: {
    labelSingular: "[Label Singular]"
    labelPlural: "[Label Plural]"
    nameSingular: "[objectName]"
    namePlural: "[objectNames]"
    icon: "[icon-name]"
    description: "[description]"
  }) {
    id
    nameSingular
    labelSingular
  }
}
```

Then add fields with `createOneField` mutations per field.

---

## VALIDATION RULES

| Rule | Field | Condition | Behavior |
|---|---|---|---|
| [Rule 1] | `[field]` | [condition] | [show error / block save] |
| [Rule 2] | `[field]` | [condition] | [behavior] |

---

## OPEN QUESTIONS

- [ ] [Decision needed — e.g. "Should this object be visible to all team members or only admins?"]
- [ ] [Question 2]
