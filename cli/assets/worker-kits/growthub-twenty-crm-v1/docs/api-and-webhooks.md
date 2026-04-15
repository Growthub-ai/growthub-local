# API and Webhooks — Twenty CRM

**Kit:** `growthub-twenty-crm-v1`

---

## OVERVIEW

Twenty CRM exposes two API surfaces:

1. **GraphQL API** at `<TWENTY_API_URL>/graphql` — the primary data access surface for queries and mutations
2. **REST API** at `<TWENTY_API_URL>/api/objects/<object-name>` — simpler CRUD operations

Both require a Bearer token authentication header.

---

## AUTHENTICATION

```
Authorization: Bearer <TWENTY_API_TOKEN>
Content-Type: application/json
```

Tokens are workspace-scoped and generated in:
**Settings > API > Tokens > Generate API Token**

---

## GRAPHQL API

### Endpoint

```
POST <TWENTY_API_URL>/graphql
```

### Common query patterns

#### List all People

```graphql
query {
  people {
    edges {
      node {
        id
        name { firstName lastName }
        emails { primaryEmail }
        position
        company { name domain }
        createdAt
      }
    }
    totalCount
  }
}
```

#### Filter People by email domain

```graphql
query {
  people(filter: {
    emails: { primaryEmail: { like: "%@acme.com" } }
  }) {
    edges {
      node {
        id
        name { firstName lastName }
        emails { primaryEmail }
      }
    }
  }
}
```

#### Get open Opportunities by stage

```graphql
query {
  opportunities(filter: {
    stage: { in: ["LEAD", "QUALIFIED", "DEMO", "PROPOSAL"] }
  }, orderBy: { closeDate: AscNullsLast }) {
    edges {
      node {
        id
        name
        stage
        amount { amountMicros currencyCode }
        closeDate
        assignee { name { firstName lastName } }
        pointOfContact { name { firstName lastName } emails { primaryEmail } }
      }
    }
    totalCount
  }
}
```

#### Create a Person

```graphql
mutation {
  createPerson(data: {
    name: { firstName: "Jane", lastName: "Doe" }
    emails: { primaryEmail: "jane@example.com" }
    position: "Head of Growth"
    linkedInLink: { url: "https://linkedin.com/in/janedoe", label: "LinkedIn" }
    companyId: "<company-uuid>"
  }) {
    id
    name { firstName lastName }
    createdAt
  }
}
```

#### Update an Opportunity stage

```graphql
mutation {
  updateOpportunity(
    id: "<opportunity-uuid>"
    data: { stage: "CLOSED_WON" }
  ) {
    id
    stage
    updatedAt
  }
}
```

#### Create a Note linked to a Person

```graphql
mutation {
  createNote(data: {
    body: "Spoke on 2026-04-15 — interested in Growthub platform for their outbound motion."
    noteTargets: {
      createMany: {
        data: [{ personId: "<person-uuid>" }]
        skipDuplicates: true
      }
    }
  }) {
    id
    body
    createdAt
  }
}
```

---

## REST API

### Endpoint

```
GET/POST/PATCH/DELETE <TWENTY_API_URL>/api/objects/<object-name>
```

Object name is the plural lowercase form (e.g. `people`, `companies`, `opportunities`).

### Examples

#### List companies

```bash
curl -X GET "<TWENTY_API_URL>/api/objects/companies" \
  -H "Authorization: Bearer $TWENTY_API_TOKEN"
```

#### Create a company via REST

```bash
curl -X POST "<TWENTY_API_URL>/api/objects/companies" \
  -H "Authorization: Bearer $TWENTY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp", "domainName": {"primaryLinkUrl": "acme.com"}}'
```

#### Update an opportunity

```bash
curl -X PATCH "<TWENTY_API_URL>/api/objects/opportunities/<id>" \
  -H "Authorization: Bearer $TWENTY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stage": "PROPOSAL"}'
```

---

## WEBHOOKS

### Outbound webhooks (Twenty → external)

Twenty can fire outbound webhooks on object lifecycle events. Configure in:  
**Settings > API > Webhooks > Add Webhook**

Or create via the workflow engine using the `SEND_HTTP_REQUEST` action type.

**Event naming convention:** `<object>.<event>` (e.g. `opportunity.created`, `person.updated`)

**Outbound webhook payload schema:**

```json
{
  "targetUrl": "https://your-endpoint.com/webhook",
  "eventName": "opportunity.created",
  "workspaceId": "<workspace-uuid>",
  "webhookId": "<webhook-uuid>",
  "eventDate": "2026-04-15T10:00:00.000Z",
  "objectMetadata": {
    "id": "<object-uuid>",
    "nameSingular": "opportunity"
  },
  "record": {
    "id": "<record-uuid>",
    "name": "Acme Corp — Deal",
    "stage": "LEAD",
    "createdAt": "2026-04-15T10:00:00.000Z"
  }
}
```

**Note:** The exact `record` payload structure depends on the object and Twenty version. Inspect the actual webhook in the Twenty UI or via a test event before finalizing payload parsing.

### Inbound webhooks (external → Twenty)

Twenty does not natively receive inbound webhooks — you must build a webhook receiver that:
1. validates the incoming event signature (from the source system)
2. transforms the payload to the Twenty GraphQL mutation format
3. calls the Twenty API to create or update the relevant record

See `docs/twenty-fork-integration.md` for the workflow engine's inbound webhook trigger, which can be used to trigger automations from external systems.

### Retry policy

Twenty's outbound webhooks retry on failure with exponential backoff. The default retry count and backoff schedule depend on the Twenty version. Check the workflow logs in Settings > Workflows for retry status.

---

## METADATA API

Used to create and manage custom objects and fields programmatically.

### Endpoint

```
POST <TWENTY_API_URL>/metadata
Authorization: Bearer <TWENTY_API_TOKEN>
```

### Introspect existing metadata

```graphql
query {
  objects {
    edges {
      node {
        id
        nameSingular
        labelSingular
        isActive
        fields {
          edges {
            node {
              id
              name
              type
              isNullable
            }
          }
        }
      }
    }
  }
}
```

---

## ERROR HANDLING

| HTTP Status | Meaning | Action |
|---|---|---|
| 200 | Success | Check `errors` array in GraphQL response body |
| 401 | Unauthorized | Token is missing, expired, or wrong workspace |
| 403 | Forbidden | Token valid but lacks access to the resource |
| 404 | Not found | Object ID does not exist |
| 429 | Rate limited | Back off and retry after the period indicated in headers |
| 500 | Server error | Log and retry; contact workspace admin if persistent |

**GraphQL errors** are returned with HTTP 200 but include an `errors` array. Always check `body.errors` after parsing the response.
