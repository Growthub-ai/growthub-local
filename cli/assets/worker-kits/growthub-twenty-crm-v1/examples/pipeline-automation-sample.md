# Pipeline Automation Brief — Growthub (SAMPLE)

**Date:** 2026-04-15  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `cloud`

> **Note:** This is a sample output. Adapt all values to the actual client context.

---

## AUTOMATION INVENTORY

| # | Automation name | Trigger | Action | Status |
|---|---|---|---|---|
| 1 | Lead Qualified — Assign Rep + Create Follow-Up Task | Stage changes to QUALIFIED | Assign owner, create Task | planned |
| 2 | Demo Scheduled — Notify Slack | Stage changes to DEMO | Send outbound webhook to Slack | planned |
| 3 | Closed Won — Create Customer Onboarding Task | Stage changes to CLOSED_WON | Create Task, update field | planned |

---

## AUTOMATION 1 — LEAD QUALIFIED: ASSIGN REP AND CREATE FOLLOW-UP TASK

**Purpose:** When a lead's stage changes to QUALIFIED, assign the opportunity to the next available sales rep (round-robin, two reps) and create a follow-up task due in 24 hours.

### Trigger

| Property | Value |
|---|---|
| Trigger type | `on_field_change` |
| Target object | `Opportunity` |
| Field | `stage` |
| Previous value | any (except QUALIFIED) |
| New value | `QUALIFIED` |

### Action sequence

| Step | Action type | Target | Parameters |
|---|---|---|---|
| 1 | `assign_owner` | `Opportunity` | Round-robin between [Sales Rep 1 ID] and [Sales Rep 2 ID] |
| 2 | `create_task` | `Person` (pointOfContact) | `title: "Follow up with [Person name]", dueAt: +24h, assignee: opportunity.assignee` |
| 3 | `update_field` | `Opportunity` | `qualifiedAt: now()` (custom date field) |

### Failure behavior

**If step 1 fails (assignment):** Assign to CRM Admin as fallback  
**If step 2 fails (task creation):** Retry once after 60 seconds; if still failing, send in-app notification to CRM Admin  
**If step 3 fails (field update):** Log error; non-critical, do not halt

### Monitoring

Check the automation execution log in Twenty > Settings > Workflows weekly. Expected volume: 5–15 triggers per week.

---

## AUTOMATION 2 — DEMO SCHEDULED: NOTIFY SLACK

**Purpose:** When a deal enters the DEMO stage, post a message to the #sales-pipeline Slack channel so the full team sees demo activity in real time.

### Trigger

| Property | Value |
|---|---|
| Trigger type | `on_field_change` |
| Target object | `Opportunity` |
| Field | `stage` |
| Previous value | `QUALIFIED` |
| New value | `DEMO` |

### Action sequence

| Step | Action type | Target | Parameters |
|---|---|---|---|
| 1 | `send_webhook` | Slack Incoming Webhook URL | See payload below |

**Slack payload:**

```json
{
  "text": "🎯 Demo stage reached: *{{opportunity.name}}* — assigned to {{opportunity.assignee.name}}. Close date: {{opportunity.closeDate}}",
  "channel": "#sales-pipeline"
}
```

### Failure behavior

**If webhook fails:** Retry 3× (5s, 15s, 45s). If all retries fail: log error and send in-app notification to CRM Admin. Non-critical — pipeline is not blocked.

---

## AUTOMATION 3 — CLOSED WON: CREATE ONBOARDING TASK

**Purpose:** When a deal is marked as CLOSED_WON, automatically create a customer onboarding task assigned to the CS Manager.

### Trigger

| Property | Value |
|---|---|
| Trigger type | `on_field_change` |
| Target object | `Opportunity` |
| Field | `stage` |
| Previous value | any |
| New value | `CLOSED_WON` |

### Action sequence

| Step | Action type | Target | Parameters |
|---|---|---|---|
| 1 | `create_task` | `Person` (pointOfContact) | `title: "Onboard [Person name] — [Company name]", dueAt: +3 days, assignee: [CS Manager ID]` |
| 2 | `update_field` | `Opportunity` | `closedAt: now()` (custom date field) |
| 3 | `send_webhook` | Slack Incoming Webhook | Post to #customer-success: "New customer: [Company name]" |

### Failure behavior

**If task creation fails:** Retry once; then send email notification to CS Manager directly  
**If Slack webhook fails:** Retry 3×; if all fail, log — non-critical

---

## AUTOMATION DESIGN DECISIONS

| Decision | Choice | Rationale |
|---|---|---|
| Assignment method | Round-robin (2 reps) | Equal load distribution; no territory segmentation needed at current team size |
| Slack notification trigger | Stage change to DEMO (not QUALIFIED) | QUALIFIED happens frequently (5–15/week); only DEMO warrants team visibility |
| Onboarding task assignee | CS Manager (fixed) | Single CS contact at current team size; revisit when team grows |

---

## OPEN QUESTIONS

- [ ] Should the Closed Won Slack notification include the deal amount? (confirm with head of sales)
- [ ] What is the round-robin assignment rule when one rep is on leave — assign to the other rep only, or default to CRM Admin?
