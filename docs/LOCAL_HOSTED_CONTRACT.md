# Growthub Local Hosted Contract

This document freezes the supported contract between the local Growthub runtime and the hosted Growthub app.

## Local To Hosted Launch

Local UI launches the hosted configuration flow using:

- hosted base URL from local config
- path: `/integrations`
- query: `return_url=<local callback url>`

The hosted app owns the authenticated user session.

## Hosted To Local Callback

Hosted callback returns to local:

- path: `/auth/callback`
- query params:
  - `token`
  - `portalBaseUrl`
  - `machineLabel`
  - `workspaceLabel`

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

## Disconnect Contract

Local `Disconnect` clears:

- `auth.token`
- `auth.growthubPortalBaseUrl`
- `auth.growthubMachineLabel`
- `auth.growthubWorkspaceLabel`

It does not remove the configured hosted base URL.
