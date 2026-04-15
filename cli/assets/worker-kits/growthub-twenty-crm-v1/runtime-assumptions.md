# Runtime Assumptions — Twenty CRM v1

This document defines the runtime boundary for this kit.

---

## OVERVIEW

This kit targets a self-contained local working directory used by an agent operating against one of four execution surfaces:

| Mode | When to use | Assumption |
|---|---|---|
| `local-fork` | local checkout of Twenty via Docker Compose | repo files can be inspected before planning |
| `self-hosted` | Twenty deployed on the team's own infrastructure | API is live and accessible via token |
| `cloud` | Twenty Cloud workspace at app.twenty.com | API is live, no repo inspection required |
| `agent-only` | no live Twenty instance | produce planning artifacts only, label as assumption-based |

Default planning mode is `agent-only` when no deployment info is provided. Escalate to `local-fork` if a checkout path is confirmed.

---

## TWENTY CRM FROZEN ASSUMPTIONS

Frozen upstream assumptions for this kit (based on Twenty v0.35+, MIT, TypeScript/React/NestJS):

- Standard objects are: `Person`, `Company`, `Opportunity`, `Note`, `Task`, `Workspace Member`
- Custom objects are supported via `Settings > Objects` (UI) and the metadata API
- GraphQL is the primary query and mutation surface
- REST API exists at `/api/objects/<object-name>` for CRUD operations
- App tokens are generated in `Settings > API > Tokens` and must be sent as `Bearer` in the `Authorization` header
- The workflow engine supports trigger types: `on_create`, `on_update`, `on_field_change`, `on_delete`, `on_schedule`, `on_webhook`
- Outbound webhook actions are a supported workflow action type
- The CLI (`@twenty-crm/cli`) exposes `twenty` commands for workspace management
- Docker Compose is the canonical local development stack (PostgreSQL + Redis + server + frontend)
- The default local development port for the Twenty server is `3000` and for the frontend is `3001`
- The GraphQL endpoint is at `<TWENTY_API_URL>/graphql` (authenticated via Bearer token)
- The metadata API is at `<TWENTY_API_URL>/metadata` (authenticated via Bearer token)

If the local fork or live deployment differs, those actual values win.

---

## DEPLOYMENT MODE DETAILS

### Local fork

Expected operator flow:
1. clone via `bash setup/clone-fork.sh`
2. Docker Compose starts PostgreSQL, Redis, server, and frontend
3. navigate to `http://localhost:3001` to configure workspace
4. generate an API token in Settings
5. set `TWENTY_API_TOKEN` and `TWENTY_API_URL=http://localhost:3000` in `.env`
6. run `node setup/verify-env.mjs` to confirm connectivity
7. proceed with data model inspection and implementation

### Self-hosted

Expected operator flow:
1. confirm deployment URL and auth mechanism
2. generate API token from the hosted workspace
3. set `TWENTY_API_TOKEN` and `TWENTY_API_URL` to the deployed endpoint
4. verify with `node setup/verify-env.mjs`
5. proceed — no local fork inspection required

### Cloud

Expected operator flow:
1. log in to Twenty Cloud at [app.twenty.com](https://app.twenty.com)
2. go to Settings > API > Tokens and generate a token
3. set `TWENTY_API_TOKEN` and `TWENTY_API_URL=https://api.twenty.com` in `.env`
4. verify with `node setup/verify-env.mjs`
5. proceed — no local fork inspection required

### Agent-only

- produce all planning artifacts using the frozen assumptions in this document
- label every output with `mode: agent-only` at the top
- note that implementation requires a live Twenty instance before any data or automation work can execute

---

## API AUTHENTICATION

Twenty uses Bearer token authentication for all API access.

```
Authorization: Bearer <TWENTY_API_TOKEN>
Content-Type: application/json
```

For the metadata API, the same token is used:

```
Authorization: Bearer <TWENTY_API_TOKEN>
```

Tokens are workspace-scoped. One token per workspace. Generate new tokens if the workspace membership changes.

---

## GRAPHQL ENDPOINT

```
POST <TWENTY_API_URL>/graphql
Authorization: Bearer <TWENTY_API_TOKEN>
Content-Type: application/json
```

Example:

```bash
curl -X POST https://api.twenty.com/graphql \
  -H "Authorization: Bearer $TWENTY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ people { edges { node { id name { firstName lastName } } } } }"}'
```

---

## METADATA API ENDPOINT

The metadata API is used to create and manage custom objects and fields.

```
POST <TWENTY_API_URL>/metadata
Authorization: Bearer <TWENTY_API_TOKEN>
Content-Type: application/json
```

---

## DATA VOLUME ASSUMPTIONS

- Small team (1–10 users): up to 10,000 Person records, 2,000 Company records
- Mid-market (10–100 users): up to 100,000 Person records, 20,000 Company records
- Enterprise (100+ users): requires infrastructure review before recommending Twenty without dedicated devops

For enrichment pipelines above 50,000 records, recommend batched imports over direct CSV upload.

---

## OUTPUT WRITING ASSUMPTION

All deliverables are written as Markdown in:

```text
output/<client-slug>/<project-slug>/
```

The kit does not require its own npm install or custom CLI to be operational. API connectivity requires only `node` for `setup/verify-env.mjs`.
