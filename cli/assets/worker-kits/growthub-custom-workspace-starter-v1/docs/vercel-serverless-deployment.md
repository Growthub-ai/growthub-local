# Vercel Serverless Deployment

The clean cloud deployment lane is the app payload:

```text
apps/workspace/
```

The Growthub local-first workspace remains the kit root. The deployable app lives under `apps/workspace`.

## Vercel project settings

- Root directory: `apps/workspace`
- Build command: `npm run build`
- Install command: `npm install`
- Framework preset: Next.js

## Required adapter env

At minimum, set:

```text
WORKSPACE_DEPLOY_TARGET=vercel
WORKSPACE_DATA_ADAPTER=<postgres|qstash-kv|provider-managed>
WORKSPACE_AUTH_ADAPTER=<oidc|clerk|authjs|provider-managed>
WORKSPACE_PAYMENT_ADAPTER=<none|stripe|polar>
WORKSPACE_INTEGRATION_ADAPTER=<static|growthub-bridge|byo-api-key>
```

Then set the provider-specific env required by `docs/adapter-contracts.md`.

For hosted Growthub authority, set:

```text
GROWTHUB_BRIDGE_BASE_URL=<growthub-gh-app-url>
GROWTHUB_BRIDGE_INTEGRATIONS_PATH=/api/mcp/accounts
GROWTHUB_BRIDGE_ACCESS_TOKEN=<bridge-token-issued-by-growthub-authority>
```

The deployed app reads normalized integration state from the bridge. It does not require raw Shopify, Meta, Google Analytics, Asana, Slack, GoHighLevel, Google Drive, Notion, Windsor, or Google Sheets secrets.

If `WORKSPACE_INTEGRATION_ADAPTER=byo-api-key`, set `WORKSPACE_BYO_CONNECTIONS_JSON` with the same normalized integration object fields and secret env names.

## Keyless control-plane ingress

A customer workspace can keep its own browser-session proxy while accepting
the exact server-to-server actions issued by the Growthub control plane. Import
the bundled verifier into that proxy and evaluate it before redirecting an
unauthenticated browser to the customer login page:

```js
import { NextResponse } from "next/server";
import { authorizeWorkspaceControlPlaneRequest } from "./lib/workspace-control-plane-auth";

export async function proxy(request) {
  const controlPlane = await authorizeWorkspaceControlPlaneRequest(request);
  if (controlPlane.ok) return NextResponse.next();

  // Continue with the workspace's existing browser-session authorization.
}
```

The verifier is deliberately closed to the governed action set: Workspace
readback, sandbox run/status, helper apply, and workflow publish. It verifies
the short-lived bearer signature against Vercel's issuer JWKS, then requires
the configured issuer, audience, project ID, owner ID, environment, and
canonical Vercel subject. Unrelated routes and incomplete trust configuration
fail closed.

Do not add governed routes to a public-path list, store the bearer, introduce a
shared API key, or replace the workspace's own browser authentication. The
stable `GROWTHUB_CONTROL_PLANE_OIDC_*` values are trust policy, not credentials.
