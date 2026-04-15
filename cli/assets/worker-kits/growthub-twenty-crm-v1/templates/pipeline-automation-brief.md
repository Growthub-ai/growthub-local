# Pipeline Automation Brief — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `[cloud / self-hosted / local-fork / agent-only]`

---

## AUTOMATION INVENTORY

| # | Automation name | Trigger | Action | Status |
|---|---|---|---|---|
| 1 | [Name] | [trigger type] | [action type] | [planned / active] |
| 2 | [Name] | [trigger type] | [action type] | [planned / active] |

---

## AUTOMATION 1 — [NAME]

**Purpose:** [What problem this automation solves]

### Trigger

| Property | Value |
|---|---|
| Trigger type | `[on_create / on_update / on_field_change / on_schedule / on_webhook]` |
| Target object | `[Person / Company / Opportunity / Note / Task / <custom>]` |
| Condition | `[field] [operator] [value]` (e.g. `stage == "QUALIFIED"`) |
| Previous value (if field change) | `[previous value]` |
| New value (if field change) | `[new value]` |

### Action sequence

| Step | Action type | Target | Parameters |
|---|---|---|---|
| 1 | `[update_field]` | `[Opportunity]` | `[field: assignee, value: <sales-rep-id>]` |
| 2 | `[create_task]` | `[Person]` | `[title: "Follow up", dueAt: +2 days, assignee: <sales-rep-id>]` |
| 3 | `[send_webhook]` | external | See webhook spec |

### Failure behavior

**If step 1 fails:** [retry / skip / halt]  
**If step 2 fails:** [retry / skip / halt]  
**If webhook fails:** retry 3× with exponential backoff (5s, 15s, 45s), then log and alert

### Monitoring

**How to verify this automation is running:** [e.g. "Check Task creation count in Twenty dashboard daily"]

---

## AUTOMATION 2 — [NAME]

**Purpose:** [What problem this automation solves]

### Trigger

| Property | Value |
|---|---|
| Trigger type | `[trigger type]` |
| Target object | `[object]` |
| Condition | `[condition]` |

### Action sequence

| Step | Action type | Target | Parameters |
|---|---|---|---|
| 1 | `[action type]` | `[target]` | `[parameters]` |

### Failure behavior

**If any action fails:** [behavior]

---

## AUTOMATION DESIGN DECISIONS

| Decision | Choice | Rationale |
|---|---|---|
| [Decision 1] | [Choice] | [Rationale] |
| [Decision 2] | [Choice] | [Rationale] |

---

## OPEN QUESTIONS

- [ ] [Open question 1 — e.g. "Should the assignment automation use round-robin or territory-based routing?"]
- [ ] [Open question 2]
