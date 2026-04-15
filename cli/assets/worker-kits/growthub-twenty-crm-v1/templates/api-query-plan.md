# API Query Plan — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `[cloud / self-hosted / local-fork / agent-only]`

---

## QUERY INVENTORY

| # | Name | Type | Object | Use case |
|---|---|---|---|---|
| 1 | [Name] | [GraphQL / REST] | [object] | [use case] |
| 2 | [Name] | [GraphQL / REST] | [object] | [use case] |

---

## QUERY 1 — [NAME]

**Use case:** [What this query supports — e.g. "Weekly pipeline report: all open Opportunities by stage"]  
**Consumer:** [dashboard / export script / integration / reporting tool]  
**Type:** `GraphQL`

### Query

```graphql
query GetOpenOpportunitiesByStage($filter: OpportunityFilterInput) {
  opportunities(filter: $filter, orderBy: { createdAt: DescNullsLast }) {
    edges {
      node {
        id
        name
        stage
        amount { amountMicros currencyCode }
        closeDate
        pointOfContact {
          name { firstName lastName }
          emails { primaryEmail }
        }
        company { name domain }
        createdAt
        updatedAt
      }
    }
    totalCount
  }
}
```

**Variables:**

```json
{
  "filter": {
    "stage": { "in": ["LEAD", "QUALIFIED", "DEMO", "PROPOSAL"] }
  }
}
```

**Expected response structure:**

```json
{
  "data": {
    "opportunities": {
      "edges": [
        {
          "node": {
            "id": "...",
            "name": "...",
            "stage": "QUALIFIED",
            "amount": { "amountMicros": 10000000, "currencyCode": "USD" }
          }
        }
      ],
      "totalCount": 42
    }
  }
}
```

**Authentication:**

```
Authorization: Bearer <TWENTY_API_TOKEN>
Content-Type: application/json
POST <TWENTY_API_URL>/graphql
```

---

## QUERY 2 — [NAME]

**Use case:** [description]  
**Consumer:** [consumer]  
**Type:** `[GraphQL / REST]`

### REST Query (if applicable)

```bash
GET <TWENTY_API_URL>/api/objects/people?filter=emails.primaryEmail[eq]=jane@example.com
Authorization: Bearer <TWENTY_API_TOKEN>
```

### GraphQL Query (if applicable)

```graphql
query {
  # [query here]
}
```

---

## QUERY 3 — MUTATION: CREATE PERSON

**Use case:** [e.g. "Create a new Person record from enrichment pipeline"]  
**Type:** `GraphQL mutation`

```graphql
mutation CreatePerson($data: PersonCreateInput!) {
  createPerson(data: $data) {
    id
    name { firstName lastName }
    emails { primaryEmail }
    createdAt
  }
}
```

**Variables:**

```json
{
  "data": {
    "name": { "firstName": "Jane", "lastName": "Doe" },
    "emails": { "primaryEmail": "jane@example.com" },
    "position": "Head of Growth",
    "linkedInLink": { "url": "https://linkedin.com/in/janedoe", "label": "LinkedIn" }
  }
}
```

---

## QUERY 4 — MUTATION: UPDATE OPPORTUNITY STAGE

**Use case:** [e.g. "Automation updates stage when deal is marked as won"]  
**Type:** `GraphQL mutation`

```graphql
mutation UpdateOpportunityStage($id: ID!, $stage: String!) {
  updateOpportunity(id: $id, data: { stage: $stage }) {
    id
    stage
    updatedAt
  }
}
```

**Variables:**

```json
{
  "id": "<opportunity-id>",
  "stage": "CLOSED_WON"
}
```

---

## RATE LIMITS AND CONSTRAINTS

| Constraint | Value | Notes |
|---|---|---|
| GraphQL endpoint | `<TWENTY_API_URL>/graphql` | All mutations and queries |
| REST endpoint | `<TWENTY_API_URL>/api/objects/<object>` | CRUD only |
| Auth | Bearer token | Workspace-scoped |
| [Rate limit if known] | [value] | [notes] |
