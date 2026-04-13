# Growthub Authentication Bridge

This document explains the shipped authentication bridge between the local `growthub` CLI and the hosted Growthub app.

It is the public-facing source of truth for:

- how the CLI authenticates a user through hosted Growthub
- how the browser and CLI stay aligned on one connection model
- how local machine metadata is synchronized into the hosted `mcp_connections` layer
- what is stored locally versus what is stored in Supabase
- how returning-user and brand-new-user flows behave

## One Sentence Summary

The CLI owns the authentication handshake, the hosted Growthub app owns user authentication and the canonical machine connection record, and the browser integrations UI reflects the exact same hosted connection state that the CLI creates.

## Scope

This document covers the current validated production path only.

It does not describe speculative future auth systems.

It does not replace the internal frozen snapshot in `gh-app/docs/protocol`.

It does not describe unrelated local runtime profile systems.

## Canonical Product Rule

There is exactly one canonical entry path for connecting a local machine to a hosted Growthub user:

1. the user starts from the `growthub` CLI discovery flow or the direct CLI auth command
2. the CLI opens hosted `/cli/login`
3. hosted Growthub reuses or establishes the user session
4. hosted Growthub creates or refreshes the `growthub_local` machine connection in `mcp_connections`
5. hosted Growthub redirects to the loopback callback URL owned by the CLI
6. the CLI writes the hosted bearer token to local CLI-owned storage
7. the browser integrations UI reads and tests that same hosted connection row

The browser does not mint a separate manual token anymore for the canonical flow.

## Repositories And Responsibilities

### `growthub-local`

`growthub-local` owns:

- the interactive discovery entry
- the CLI auth command surface
- the loopback callback listener
- local session storage
- local overlay storage
- local profile merge display
- npm package publishing for `@growthub/cli`
- npm package publishing for `@growthub/create-growthub-local`

### `gh-app`

`gh-app` owns:

- hosted user authentication
- the `/cli/login` hosted handoff route
- bearer token validation for the CLI
- hosted profile projection from Supabase data
- the `mcp_connections` row for `growthub_local`
- the integrations UI connection card and manage modal
- the server-side validation path used by `Test substrate`

## Canonical Endpoints

### Hosted routes

- `GET /cli/login`
- `GET /api/cli/session`
- `GET /api/cli/profile`
- `POST /api/providers/growthub-local/test`

### Local CLI-owned loopback route

- `GET http://127.0.0.1:<ephemeral-port>/cli-callback`

### Local runtime support routes

These remain part of the local runtime bridge surface where needed by UI parity and validation:

- `GET /api/gtm/connection`
- `POST /api/gtm/connection/test`

## Hosted Data Model

The bridge reuses existing hosted infrastructure.

### `mcp_connections`

The canonical machine connection record is stored in `mcp_connections`.

For this integration:

- `provider = growthub_local`
- `app_slug = growthub_local`
- `connection_type = oauth_first_party`
- `is_active = true` when the machine bridge is live

The row stores:

- the scoped local machine token in `access_token`
- the same token in `api_key`
- the machine identity in `connection_name`
- the deterministic machine key in `account_id`
- safe metadata in `connection_metadata`

### `profiles`

Hosted user identity is resolved from the existing `profiles` table.

The CLI does not create a second user identity model.

### `cms_content_items`

The bridge reads the already-configured `growthub_local` connector and tool definitions from `cms_content_items`.

This is how the hosted profile endpoint knows which tool slugs and capability context are attached to the authenticated machine bridge.

## Local Storage Model

The local CLI stores only CLI-owned auth state.

### Local files

- `auth/session.json`
- `profiles/hosted-overlay.json`

### What is intentionally not touched

The bridge does not write hosted identity into:

- `instances/<id>/config.json`
- worker kit exports
- unrelated local app profile files

That separation is intentional.

Hosted identity stays hosted-first.

Local workspace configuration stays local-first.

## Single Discovery Entry

The interactive discovery hub exposes one canonical auth entry:

- `🔐 Connect Growthub Account`

That entry immediately starts the hosted auth flow.

It should not fan out into extra auth-mode menus.

It should not ask the user to choose between multiple bridge strategies.

It should not require the user to manually decide how hosted auth works.

## Direct CLI Commands

The shipped CLI surface is:

```bash
growthub auth login
growthub auth whoami
growthub auth logout
growthub profile status
growthub profile pull
growthub profile push
```

### `growthub auth login`

This command:

1. resolves the hosted base URL
2. opens a loopback listener
3. constructs the hosted `/cli/login` URL
4. opens the browser or prints the URL
5. waits for the callback
6. stores the returned hosted session token locally

### `growthub auth whoami`

This command uses the locally stored hosted bearer token and calls the hosted session surface to display:

- hosted user id
- hosted email
- linked local instance information when available

### `growthub auth logout`

This command removes the local hosted session and overlay while leaving local workspace config untouched.

### `growthub profile status`

This prints the merged effective view:

- local base state
- hosted overlay state
- session state

### `growthub profile pull`

This reads hosted bridge profile data into the local overlay.

### `growthub profile push`

This sends safe machine linkage metadata upward without replacing local workspace configuration.

## Browser Integrations Parity

The browser integrations path is not a second auth system.

It is a visibility and validation surface over the same hosted connection row.

### What users see

Inside `/integrations`, the `Growthub Local Machine` integration should:

1. show a connected state after CLI auth succeeds
2. show the connection name from `mcp_connections`
3. open the manage modal for that same connection row
4. run `Test substrate` against the hosted bridge token stored in that row

### What users should not see in the canonical flow

Users should not need to:

- manually paste a browser-issued token into the CLI
- choose between multiple auth modes
- create one browser connection and a second CLI connection
- manage different records for browser and CLI

## Returning User Flow

The validated returning-user path is:

1. user starts from the CLI
2. CLI opens hosted `/cli/login`
3. browser already has a valid hosted session
4. hosted app immediately resolves the user
5. hosted app upserts the `growthub_local` connection row
6. hosted app redirects to the loopback callback with the scoped token
7. CLI stores the token locally
8. CLI bearer token resolves on `/api/cli/session`
9. CLI bearer token resolves on `/api/cli/profile`
10. browser integrations UI shows the same connection

## Brand-New User Flow

The validated brand-new-user path is:

1. user starts from the CLI
2. CLI opens hosted `/cli/login`
3. browser has no hosted session
4. hosted app redirects to `/auth?returnTo=<encoded cli login path>`
5. user signs up or signs in as a brand-new hosted user
6. hosted auth returns to `/auth/callback`
7. `/auth/callback` preserves `returnTo`
8. browser lands back on `/cli/login`
9. `/cli/login` upserts the `growthub_local` connection row
10. hosted app redirects to the loopback callback with the scoped token
11. CLI stores the token locally
12. hosted `/api/cli/session` resolves for the new user
13. hosted `/api/cli/profile` resolves for the new user
14. browser integrations UI reads the same hosted row

## Main Auth Safety

The hosted bridge intentionally builds on the existing auth stack instead of replacing it.

The main auth changes are limited to preserving `returnTo` through:

- `/auth`
- `/auth/callback`
- the email sign-in flow
- the Google OAuth sign-in flow

This means the main app auth system keeps behaving as before for normal application sign-in while also supporting the CLI return path.

## Token Rules

### Hosted token authority

The hosted app is the only authority that mints the bridge token.

### Token reuse rule

For an existing `growthub_local` machine connection row, the hosted app preserves the existing token instead of rotating it on every `/cli/login`.

This matters because duplicate browser hits or repeated redirects must not invalidate the token the CLI just stored.

### Token validation rule

The CLI token is valid only if:

- the row exists in `mcp_connections`
- `provider = growthub_local`
- `is_active = true`
- the stored token matches `access_token`

## Connection Verification

The browser `Test substrate` flow validates the same hosted bridge.

It does not do a fake local-only test.

It resolves the `mcp_connections` row and then:

1. validates the hosted bridge token
2. reads the hosted profile projection
3. marks the connection verified
4. updates validation timestamps

This is why the browser can truthfully say the hosted CLI bridge was resolved for a particular email address.

## Metadata Stored In `connection_metadata`

The hosted machine connection metadata can include:

- `capabilities`
- `connected_at`
- `machine_label`
- `portal_base_url`
- `workspace_label`
- `last_cli_login_at`
- `last_cli_push_at`
- `last_tested_at`
- `last_sync_at`
- `last_cli_bridge_validation_at`
- `linked_instance_id`
- `surface_profile`

These values are safe machine-linkage fields.

They are not a replacement for local workspace configuration.

## Production URL Behavior

### Local validation

For local development, the CLI can target:

- `http://127.0.0.1:3000`

### Default production behavior

Without a local override, the CLI defaults to:

- `https://www.growthub.ai`

This is intentional because the same CLI surface must work against production after local validation passes.

## Loopback Callback Safety

The hosted `/cli/login` route only accepts loopback callback targets:

- `127.0.0.1`
- `localhost`
- `::1`

This ensures the hosted redirect cannot be used to send the token to arbitrary external domains.

## Example Connection Row

An example hosted row looks like:

```json
{
  "provider": "growthub_local",
  "app_slug": "growthub_local",
  "connection_type": "oauth_first_party",
  "is_active": true,
  "is_verified": true,
  "connection_name": "Antonios-Mini.attwifi.manager"
}
```

## Example CLI Session File

An example local session file looks like:

```json
{
  "version": 1,
  "hostedBaseUrl": "http://127.0.0.1:3000",
  "accessToken": "ghlcl_...",
  "userId": "user-id",
  "email": "user@example.com",
  "machineLabel": "Antonios-Mini.attwifi.manager",
  "issuedAt": "2026-04-13T22:42:15.325Z"
}
```

## Validation Checklist

Use this checklist when validating the bridge:

### CLI

- `growthub auth login` completes
- local session file exists
- local overlay file exists when expected
- `growthub auth whoami` resolves hosted identity
- `growthub profile pull` succeeds
- `growthub profile push` succeeds
- `growthub profile status` reflects the hosted overlay

### Hosted API

- `/api/cli/session` returns `200`
- `/api/cli/profile` returns `200`

### Browser

- `/integrations` shows `Growthub Local Machine` as connected
- manage modal opens the canonical connection row
- `Test substrate` succeeds

### Supabase

- `mcp_connections.provider = growthub_local`
- `is_active = true`
- `access_token` matches the CLI token
- metadata timestamps update after validation

## Supported Extension Direction

Future extension should continue using the same architecture:

1. hosted Growthub user remains the top-level identity
2. `mcp_connections` remains the machine bridge table
3. `cms_content_items` remains the tool definition layer
4. CLI keeps owning the loopback handshake
5. browser integrations keep reflecting the same hosted connection state

## Unsupported Extension Direction

Do not extend this system by:

1. adding a second browser-only token path for the canonical flow
2. storing hosted identity inside local app profile config
3. introducing a second machine-connection table
4. bypassing hosted auth with a local-only identity model
5. diverging CLI and browser connection semantics

## Files To Read For Implementation Details

### In `growthub-local`

- `cli/src/index.ts`
- `cli/src/commands/auth-login.ts`
- `cli/src/auth/login-flow.ts`
- `cli/src/auth/session-store.ts`
- `cli/src/auth/overlay-store.ts`
- `cli/src/auth/effective-profile.ts`
- `server/src/routes/gtm.ts`

### In `gh-app`

- `src/app/cli/login/route.ts`
- `src/app/api/cli/session/route.ts`
- `src/app/api/cli/profile/route.ts`
- `src/lib/auth/cli-auth-bridge.ts`
- `src/app/api/providers/growthub-local/test/route.ts`
- `src/app/integrations/components/GrowthubLocalConnectionModal.tsx`
- `src/app/integrations/components/GrowthubLocalManageModal.tsx`
- `src/app/auth/page.tsx`
- `src/app/auth/auth-form.tsx`
- `src/app/auth/callback/page.tsx`

## Related Docs

- [Growthub Local Hosted Contract](./LOCAL_HOSTED_CONTRACT.md)
- [Worker Kits Overview](./WORKER_KITS.md)
- [CLI Template Contribution Extension Workflows](./CLI_TEMPLATE_CONTRIBUTION_EXTENSION_WORKFLOWS.md)

For the internal architecture record, see the frozen snapshot protocol document in `gh-app/docs/protocol`.
