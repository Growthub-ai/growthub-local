# Nango Add-on Topology and Capabilities V1

This document is the v1 source of truth for the official Nango add-on in the
governed workspace starter. It documents the shipped topology: one Nango
provider account, live-discovered integration products, governed API Registry
rows, and no secret values in workspace config.

## Canonical Topology

Nango is a marketplace provider mounted through the existing Add-ons
Marketplace control plane.

```text
Nango provider account
  providerId: nango
  provider row: api-registry / nango-marketplace-provider
  credentials: local runtime env refs only

  live product discovery
    route: GET /api/workspace/add-ons/providers/nango/products/live
    source: Nango /integrations
    product ids: nango-<provider-config-key>

  discovered product: <integration display name>
    connectorKind: nango
    lane: workspace-integrations
    resolver template: nango
    binding field: providerConfigKey
    governed row: api-registry / nango-<provider-config-key>
```

The provider row and discovered integration rows live in the workspace API
Registry object. The static Nango catalog product is the discovery contract;
it is not rendered as an installable product beside live integrations.

## Provider Account

The provider setup surface accepts a Nango environment secret key and writes it
to local runtime env only:

- `NANGO_SECRET_KEY` is the required bearer secret.
- `NANGO_HOST_URL`, `NANGO_ENVIRONMENT`, and `NANGO_MODE` are optional runtime
  refs for self-hosted or environment-specific operation.
- Workspace rows store env-ref names such as `NANGO_SECRET_KEY`; they never
  store the secret value.

If no Nango key is configured, discovery and sync return blocked/needs-setup
outcomes. Existing provider or product rows are not removed by a missing key.

## Live Discovery

Nango integrations are account-scoped products discovered from the connected
Nango account.

Capabilities:

- Fetch available integrations through the operator-gated live discovery route.
- Map the real Nango payload shape (`unique_key`, `provider`,
  `display_name`) into product definitions with stable ids.
- Render only live discovered products in the install grid.
- Re-fetch and re-verify the selected integration server-side during install.
- Install a governed API Registry row with `connectorKind: "nango"`,
  `resolverTemplateId: "nango"`, and `providerConfigKey`.

The browser never calls the Nango API directly and never names or transports
the secret. It only calls governed workspace routes.

## Governed API Request Product

Each installed Nango integration is a `workspace-integrations` product.

Capabilities:

- Resolve through the existing config-driven Nango resolver loader.
- Execute as governed API requests via the Unified API Resolver Registry.
- Preserve `connectionIds` and future per-integration binding metadata; a
  product resync must not clobber connection bindings.
- Surface in Settings / Apps only after a verified governed API Registry row
  exists.

The Apps surface shows the Nango integration icon after the first verified
Nango integration product row lands. The provider account icon remains the
account/provider identity; the installed product icon represents the governed
integration.

## Mutation Boundary

Nango add-on work follows the normal governed mutation boundary:

- Provider setup writes the provider row through the provider credentials
  route.
- Live discovery is read-only and never writes workspace config.
- Product install writes a discovered product row through the product sync
  route.
- Every published or blocked product-sync outcome is receipted.
- No route writes secret values into config, receipts, browser payloads, or
  Data Model rows.
- UI success is derived from verified rows and receipts, never from optimistic
  client-side state.

## Verification

Required focused gates for this topology:

```bash
node --test scripts/unit-workspace-add-ons-nango.test.mjs
node --test scripts/unit-workspace-add-ons-supabase.test.mjs
node --test scripts/unit-workspace-add-ons-vercel.test.mjs
node --test scripts/unit-workspace-storage-buckets.test.mjs
```

Browser QA must use the existing in-app browser when available and confirm:

- `/settings/add-ons` shows the Nango provider as verified only after the
  provider account row is verified.
- The Nango provider card counts verified discovered product rows.
- Nango detail shows installed discovered integrations such as
  `Github (Getting Started)` under Installed Products.
- The install grid does not render the static `Nango Integrations` discovery
  contract as a fake product.
- `/settings/apps` shows the Nango integration icon only after a verified
  `connectorKind: "nango"` API Registry row exists.
