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

# Bridge resource commands (require active session)
growthub bridge agents list
growthub bridge agents inspect <slug>
growthub bridge agents bind <slug>
growthub bridge agents bindings
growthub bridge agents unbind <slug>
growthub bridge assets list
growthub bridge assets download
growthub bridge brand kits
growthub bridge brand assets
growthub bridge brand download
growthub bridge knowledge tables
growthub bridge knowledge list
growthub bridge knowledge write
growthub bridge knowledge download <id>
growthub bridge knowledge delete <id>
growthub bridge knowledge metadata <id>
growthub bridge run-sync
growthub bridge mcp accounts
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
- `cli/src/commands/bridge.ts`
- `cli/src/auth/login-flow.ts`
- `cli/src/auth/session-store.ts`
- `cli/src/auth/overlay-store.ts`
- `cli/src/auth/effective-profile.ts`
- `cli/src/runtime/growthub-bridge-client/index.ts`
- `packages/api-contract/src/bridge.ts`
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

---

## Bridge Resource Commands

The bridge surface exposes authenticated access to hosted Growthub resources from the CLI. All commands require an active session (`growthub auth login`). All commands support `--json` for machine-readable output.

### Agents

```bash
growthub bridge agents list --json
growthub bridge agents inspect <slug> --json
growthub bridge agents bind <slug> [--fork-id <id>] [--workspace <path>] [--allow-local] --json
growthub bridge agents bindings [--fork-id <id>] [--workspace <path>] [--allow-local] --json
growthub bridge agents unbind <slug> [--fork-id <id>] [--workspace <path>] [--allow-local] --json
```

`agents list` — fetches all hosted agent manifests for the authenticated user via `/api/cli/profile?view=agent-orchestrator-manifests`. Returns the full `BridgeHostedAgentManifestListResponse` including per-agent `operations`, `workspaceBinding`, `diagnostics`, and `provenance`.

`agents inspect <slug>` — fetches one manifest via `/api/cli/profile?view=agent-orchestrator-manifest&agentSlug=<slug>`.

`agents bind <slug>` — writes a `.growthub-fork/agents/<slug>.json` binding file into a governed workspace without executing the agent. Requires a registered fork-sync workspace (`--fork-id`) or a local `.growthub-fork` directory with `--allow-local`.

`agents bindings` — lists all `.growthub-fork/agents/*.json` binding files for a workspace.

`agents unbind <slug>` — removes the binding file without touching the hosted agent.

Binding files have this shape:

```json
{
  "version": 1,
  "kind": "growthub-governed-workspace-agent-binding",
  "agentSlug": "quick-image-generator-xlq5",
  "executionAuthority": "gh-app",
  "localExecution": false,
  "forkSyncRegistered": true,
  "remoteSyncConfigured": false,
  "boundAt": "2026-05-01T00:24:14.000Z"
}
```

Execution stays in `gh-app`. Binding files are local-only workspace state.

### Assets

```bash
growthub bridge assets list [--page <n>] [--limit <n>] [--source <source>] [--media-type <type>] [--search <query>] --json
growthub bridge assets download --storage-path <path> [--bucket <bucket>] [--out <path>] --json
```

`assets list` — fetches the authenticated user's gallery assets via `/api/cli/profile?view=gallery-assets`, falling back to `/api/gallery/assets`. Returns `BridgeAssetListResponse` with pagination.

`assets download` — downloads an asset by storage path through `/api/secure-image?bucket=<bucket>&path=<path>` using bearer-token auth. Safe download path; does not use Supabase anon keys.

### Brand Kits and Brand Assets

```bash
growthub bridge brand kits [--include-assets] --json
growthub bridge brand assets [--brand-kit-id <id>] [--asset-type <type>] --json
growthub bridge brand download --storage-path <path> [--bucket <bucket>] [--out <path>] --json
```

`brand kits` — fetches all brand kits from `/api/brand-settings` using session-cookie auth. Pass `--include-assets` to embed per-kit asset arrays in the response.

`brand assets` — fetches brand assets from `/api/brand-settings/assets`, optionally filtered by `brandKitId` or `assetType`.

`brand download` — downloads a brand asset through the same authenticated storage proxy as `assets download`.

The hosted brand system (`/api/brand-settings`) is the source of truth. The CLI does not maintain a local brand-kit cache.

### Knowledge

```bash
growthub bridge knowledge tables [--origin <origin>] [--connector-type <type>] --json
growthub bridge knowledge list [--type <type>] [--agent-slug <slug>] [--table-id <id>] --json
growthub bridge knowledge write [--id <id>] [--title <title>] [--content <md>] [--table-id <id>] [--notes <notes>] [--agent-slug <slug>] --json
growthub bridge knowledge download <id> --out <path> --json
growthub bridge knowledge delete <id> --json
growthub bridge knowledge metadata <id> [--table-id <id>] [--notes <notes>] --json
```

`knowledge tables` — lists knowledge table groupings via `/api/cli/profile?view=knowledge-tables`, falling back to `/api/providers/growthub-local/knowledge/tables`.

`knowledge list` — lists knowledge items via `/api/cli/profile?view=knowledge`, falling back to `/api/providers/growthub-local/knowledge/items`.

`knowledge write` — creates or updates a markdown knowledge item. Pass `--id` to update an existing item, omit for a new item with `--title` and `--content`.

`knowledge download <id>` — downloads the raw content of a knowledge item by id.

`knowledge delete <id>` — deletes a knowledge item.

`knowledge metadata <id>` — patches metadata (`table_id`, `notes`) on an existing item.

### Run Output Sync

```bash
growthub bridge run-sync [--run-id <id>] [--title <title>] [--output <json>] [--table-id <id>] [--agent-slug <slug>] --json
```

Persists a local run output into the hosted knowledge substrate via `/api/providers/growthub-local/runs/sync`. Used by agent harnesses to write governed run traces into the hosted knowledge layer.

### MCP Accounts

```bash
growthub bridge mcp accounts --json
```

Lists all MCP-connected accounts for the authenticated user via `/api/mcp/accounts`. Returns `BridgeMcpAccountsResponse` with provider, connection name, type, active/verified status, and per-provider metadata.

---

## SDK Types — `@growthub/api-contract/bridge`

All bridge resource shapes are typed in `@growthub/api-contract/bridge`. Import by subpath:

```ts
import type {
  BridgeAssetType,
  BridgeAssetSource,
  BridgeAssetItem,
  BridgePagination,
  BridgeAssetListResponse,
  BridgeBrandKit,
  BridgeBrandAsset,
  BridgeBrandKitListResponse,
  BridgeBrandAssetListResponse,
  BridgeKnowledgeItem,
  BridgeKnowledgeTable,
  BridgeKnowledgeListResponse,
  BridgeKnowledgeTableListResponse,
  BridgeKnowledgeSaveInput,
  BridgeKnowledgeSaveResponse,
  BridgeKnowledgeMetadataPatchInput,
  BridgeRunOutputSyncInput,
  BridgeMcpAccount,
  BridgeMcpAccountsResponse,
  BridgeHostedAgentSourceStatus,
  BridgeHostedAgentSourceDiagnostics,
  BridgeHostedAgentDiagnostics,
  BridgeHostedAgentManifest,
  BridgeHostedAgentManifestListResponse,
  BridgeHostedAgentManifestResponse,
  BridgeHostedAgentWorkspaceBinding,
  BridgeHostedAgentWorkspaceBindingResponse,
  BridgeHostedAgentWorkspaceBindingsResponse,
} from "@growthub/api-contract/bridge";
```

These types are re-exported from the root barrel (`@growthub/api-contract`) as well. Use the subpath import when you only need bridge types.

---

## Bridge Client — `GrowthubBridgeClient`

The client lives at `cli/src/runtime/growthub-bridge-client/index.ts`. Instantiate it via the factory:

```ts
import { createGrowthubBridgeClient } from "./runtime/growthub-bridge-client/index.js";
const client = createGrowthubBridgeClient();
```

The constructor reads the active session from `~/.paperclip/auth/session.json` and throws if the session is missing or expired.

Two request strategies are used internally:

- `requestJson` — sends `Authorization: Bearer <token>` + `x-user-id` headers. Used for bridge API routes that accept bearer-token auth.
- `requestJsonWithSessionCookie` — sends `sb-growthub-auth-token` cookie. Used for brand-settings routes that require the Supabase session cookie.

The base URL is read from `session.hostedBaseUrl` and can be overridden with `GROWTHUB_BRIDGE_BASE_URL` for local development.

All list methods implement a primary + fallback URL strategy to remain compatible across hosted API versions.

---

## Updated Validation Checklist

In addition to the auth checklist above, validate bridge resources:

### Bridge agents

- `growthub bridge agents list --json` returns `agents` array with at least one manifest
- `growthub bridge agents inspect <slug> --json` returns `agent` or `manifest` field
- `growthub bridge agents bind <slug> --allow-local --json` writes binding file into `.growthub-fork/agents/`
- `growthub bridge agents bindings --allow-local --json` lists the written binding
- `growthub bridge agents unbind <slug> --allow-local --json` removes the binding

### Bridge assets

- `growthub bridge assets list --limit 3 --json` returns `assets` array with `pagination.total`

### Bridge brand

- `growthub bridge brand kits --json` returns `brandKits` array

### Bridge knowledge

- `growthub bridge knowledge list --json` returns `items` array with `count`

### Bridge MCP accounts

- `growthub bridge mcp accounts --json` returns `accounts` array including the `growthub_local` entry

---

## Related Docs

- [Growthub Local Hosted Contract](./LOCAL_HOSTED_CONTRACT.md)
- [Worker Kits Overview](./WORKER_KITS.md)
- [CLI Template Contribution Extension Workflows](./CLI_TEMPLATE_CONTRIBUTION_EXTENSION_WORKFLOWS.md)

For the internal architecture record, see the frozen snapshot protocol document in `gh-app/docs/protocol`.
