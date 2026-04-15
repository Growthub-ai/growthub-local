# Integration Handoff — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Handoff from:** [CRM Operator / Consultant]  
**Handoff to:** [Developer / DevOps]

---

## PURPOSE

This document gives the implementing developer everything needed to connect [CLIENT NAME]'s external tools to their Twenty CRM workspace without needing to ask follow-up questions.

---

## 1. SYSTEM INTEGRATION DIAGRAM

```text
[Apollo / Clay]
     |
     | CSV export or API
     ▼
[Import Script / Enrichment Job]
     |
     | GraphQL mutation batch
     ▼
[Twenty CRM API] ─────── workspace: [workspace-id]
     ▲
     |
     | Outbound webhooks
     ▼
[Slack / Notification endpoint]

[Stripe]
     |
     | webhook: customer.created
     ▼
[Webhook handler endpoint]
     |
     | GraphQL mutation
     ▼
[Twenty CRM API]

[Intercom]
     |
     | webhook: conversation.created
     ▼
[Webhook handler endpoint]
     |
     | GraphQL mutation (create Note)
     ▼
[Twenty CRM API]
```

---

## 2. CREDENTIALS REQUIRED

**Types only — do not store values in this document.**

| Secret | Type | Where to get it | Where to store it |
|---|---|---|---|
| `TWENTY_API_TOKEN` | Bearer token | Twenty: Settings > API > Tokens | `.env` / secrets manager |
| `TWENTY_API_URL` | URL string | Twenty workspace URL | `.env` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | Stripe: Developers > Webhooks | `.env` / secrets manager |
| `INTERCOM_WEBHOOK_SECRET` | Webhook signing secret | Intercom: Settings > Developers | `.env` / secrets manager |
| `APOLLO_API_KEY` | API key | Apollo: Settings > API | `.env` / secrets manager |

---

## 3. ENDPOINT CONTRACTS

### Twenty GraphQL API

```
URL:     <TWENTY_API_URL>/graphql
Method:  POST
Auth:    Authorization: Bearer <TWENTY_API_TOKEN>
Type:    application/json
```

### Twenty REST API

```
URL:     <TWENTY_API_URL>/api/objects/<object-name>
Method:  GET / POST / PATCH / DELETE
Auth:    Authorization: Bearer <TWENTY_API_TOKEN>
Type:    application/json
```

### Inbound webhook receiver (to be built by developer)

```
URL:     https://[your-domain]/webhooks/stripe  (example)
Method:  POST
Auth:    Validate STRIPE_WEBHOOK_SECRET signature header
Handles: customer.created, customer.subscription.updated
```

---

## 4. DATA FLOW — ENRICHMENT PIPELINE

**Sequence:**

1. Enrichment job reads Apollo export (CSV or API)
2. For each record:
   a. Check if `email` already exists in Twenty (GraphQL query)
   b. If match found: update Person record (GraphQL mutation: `updatePerson`)
   c. If no match: create Person record (GraphQL mutation: `createPerson`)
   d. Check if company domain already exists in Twenty
   e. If no match: create Company record (`createCompany`) and link to Person
3. Log all results (created, updated, skipped, error) to output file
4. Report: total processed, errors, duplicates merged

**Key GraphQL operations:**

- `people` query — check for existing Person by email
- `createPerson` mutation — insert new Person
- `updatePerson` mutation — merge enrichment fields
- `createCompany` mutation — insert new Company
- `companies` query — check for existing Company by domain

---

## 5. DATA FLOW — STRIPE WEBHOOK

**Sequence:**

1. Stripe fires `customer.created` event to webhook receiver
2. Receiver validates `Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET`
3. Receiver extracts: `email`, `name`, `metadata.company_name`
4. Receiver queries Twenty for existing Person by email
5. If not found: creates Person record with `createPerson` mutation
6. Creates a Note on the Person: "Stripe customer created — ID: [stripe-id]"
7. Returns HTTP 200 to Stripe

---

## 6. DATA FLOW — INTERCOM WEBHOOK

**Sequence:**

1. Intercom fires `conversation.created` event
2. Receiver validates signature
3. Receiver extracts: `contact.email`, `conversation.id`, `conversation.subject`
4. Receiver queries Twenty for Person by email
5. If found: creates Note on Person with conversation summary
6. Returns HTTP 200 to Intercom

---

## 7. ENVIRONMENT CHECKLIST

| Environment | Status | Twenty workspace | API token |
|---|---|---|---|
| Development | [ready / pending] | [dev workspace ID] | [dev token] |
| Staging | [ready / pending] | [staging workspace ID] | [staging token] |
| Production | [ready / pending] | [prod workspace ID] | [prod token] |

---

## 8. ROLLBACK PLAN

If a bad data push occurs:

1. Stop the enrichment job or webhook receiver
2. Note the exact timestamp of the bad push
3. Query Twenty for all records created/updated after that timestamp:
   ```graphql
   query {
     people(filter: { createdAt: { gte: "YYYY-MM-DDTHH:MM:SSZ" } }) {
       edges { node { id createdAt } }
     }
   }
   ```
4. Use `deleteManyPeople` mutation to remove the affected records
5. Fix the source data and re-run the pipeline

**Contact for rollback approvals:** [CRM Admin name and email]

---

## 9. OPEN ITEMS FOR DEVELOPER

| Item | Owner | Due date | Notes |
|---|---|---|---|
| [Webhook receiver for Stripe] | [developer] | YYYY-MM-DD | |
| [Enrichment job script] | [developer] | YYYY-MM-DD | |
| [Secrets stored in CI] | [devops] | YYYY-MM-DD | |
