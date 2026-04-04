# Growthub Local Hosted Contract

This document freezes the supported contract between the local Growthub runtime and the hosted Growthub app.

## Local To Hosted Launch

Local UI launches the hosted configuration flow using:

- hosted base URL from local config
- path: `/integrations`
- query: `return_url=<local callback url>`
- query: `state=<ephemeral one-time nonce issued by local server>`

The hosted app owns the authenticated user session.

## Hosted To Local Callback

Hosted callback returns to local:

- path: `/auth/callback`
- query params:
  - `token`
  - `portalBaseUrl`
  - `machineLabel`
  - `workspaceLabel`
  - `state` (must match an issued, unexpired local nonce)

Local callback validation:

- reject callback when `state` is missing
- reject callback when `state` is invalid/expired
- reject callback when callback actor user does not match the user associated with the issued `state`

## Local Persistence

Local runtime stores:

- `auth.token`
- `auth.growthubBaseUrl`
- `auth.growthubPortalBaseUrl`
- `auth.growthubMachineLabel`
- `auth.growthubWorkspaceLabel`

## Probe Contract

Local `Pulse` calls:

- `POST /api/providers/growthub-local/probe`

Against the hosted base URL using:

- `Authorization: Bearer <token>`

Expected outcome:

- hosted validation succeeds
- hosted knowledge probe item can be created

## Hosted Knowledge Sync Contract

Local server exposes a bridge for hosted table binding:

- `GET /api/gtm/knowledge-sync/tables` (list hosted knowledge tables visible to authenticated user)
- `POST /api/gtm/knowledge-sync/tables` (create hosted knowledge table)
- `GET /api/gtm/knowledge-sync/binding` (read local bound hosted table metadata)
- `POST /api/gtm/knowledge-sync/binding` (persist bound hosted table metadata)

Binding metadata stored locally:

- `growthubKnowledgeTableId`
- `growthubKnowledgeTableName`
- `growthubKnowledgeWorkspaceId`
- `growthubKnowledgeAdminId`

## Disconnect Contract

Local `Disconnect` clears:

- `auth.token`
- `auth.growthubPortalBaseUrl`
- `auth.growthubMachineLabel`
- `auth.growthubWorkspaceLabel`

It does not remove the configured hosted base URL.
