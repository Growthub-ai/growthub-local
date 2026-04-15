# Webhook Integration Spec — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `[cloud / self-hosted / local-fork / agent-only]`

---

## WEBHOOK INVENTORY

| # | Name | Direction | Event | Status |
|---|---|---|---|---|
| 1 | [Name] | [inbound / outbound] | [event] | [planned / active] |
| 2 | [Name] | [inbound / outbound] | [event] | [planned / active] |

---

## WEBHOOK 1 — [NAME]

**Direction:** `[inbound / outbound]`  
**Purpose:** [What this webhook enables — e.g. "When a Stripe customer is created, create a Company record in Twenty"]

### Event Definition

| Property | Value |
|---|---|
| Event source | `[Stripe / Intercom / Segment / Twenty / other]` |
| Event name | `[e.g. customer.created / opportunity.created]` |
| Trigger object | `[Twenty object or external object]` |
| Trigger condition | `[e.g. "all events" / "stage = CLOSED_WON"]` |

### Payload Schema

**Source payload (what the sender sends):**

```json
{
  "event": "[event-name]",
  "created": 1713000000,
  "data": {
    "object": {
      "id": "[source-id]",
      "email": "[email]",
      "name": "[name]",
      "[field]": "[value]"
    }
  }
}
```

**Target payload (what Twenty or the receiver expects):**

```json
{
  "name": "[value]",
  "emails": { "primaryEmail": "[email]" },
  "[field]": "[value]"
}
```

### Endpoint

| Property | Value |
|---|---|
| URL | `[https://api.twenty.com/graphql or external endpoint]` |
| Method | `[POST]` |
| Auth header | `Authorization: Bearer <TWENTY_API_TOKEN>` |
| Content-Type | `application/json` |

### Field Mapping (inbound to Twenty)

| Source field | → | Twenty object | Twenty field | Transformation |
|---|---|---|---|---|
| `data.object.email` | → | `Person` | `emails.primaryEmail` | none |
| `data.object.name` | → | `Company` | `name` | none |

### Retry Policy

| Property | Value |
|---|---|
| Max retries | 3 |
| Backoff | 5s, 15s, 45s |
| On max retry failure | log to error queue and alert CRM admin |

### Test Procedure

1. Use [Stripe CLI / webhook testing tool] to send a test event
2. Verify the payload arrives at the endpoint
3. Verify the Twenty record is created or updated correctly
4. Check for any field mapping errors in the response

---

## WEBHOOK 2 — [NAME]

**Direction:** `[inbound / outbound]`  
**Purpose:** [Purpose]

### Event Definition

| Property | Value |
|---|---|
| Event source | `[source]` |
| Event name | `[event]` |

### Payload Schema

[See payload schema above pattern]

### Endpoint

| Property | Value |
|---|---|
| URL | `[URL]` |
| Auth | `[auth mechanism]` |

### Retry Policy

| Property | Value |
|---|---|
| Max retries | 3 |
| On failure | [behavior] |

---

## OPEN QUESTIONS

- [ ] [Open question 1 — e.g. "Does Intercom's webhook payload include the contact email consistently?"]
- [ ] [Open question 2]
