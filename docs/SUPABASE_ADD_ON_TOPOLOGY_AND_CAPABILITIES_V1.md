# Supabase Add-on Topology and Capabilities V1

This document is the v1 source of truth for the official Supabase add-on in
the governed workspace starter. It replaces the earlier phase-plan view with
the shipped topology: one Supabase provider account, two installable products,
two execution lanes, and no secret values in workspace config.

## Canonical Topology

Supabase is a marketplace provider mounted through the existing Add-ons
Marketplace control plane.

```text
Supabase provider account
  providerId: supabase
  provider row: api-registry / supabase-provider
  credentials: local runtime env refs only

  product: Supabase Postgres (PostgREST)
    productId: supabase-postgrest
    integrationId: supabase-postgrest
    lane: workspace-data
    governed door: /api/workspace/add-ons/supabase/data
    governed object type: data-source

  product: Supabase Storage (Global CDN)
    productId: supabase-storage
    integrationId: supabase-storage
    lane: workspace-storage
    governed door: /api/workspace/add-ons/supabase/storage
    governed object: supabase-buckets
    linked table: existing or created data-source table
```

The provider row and product rows live in the workspace API Registry object.
Product rows are installed by the standard product-sync route and carry refs,
status, proof strings, selected resource metadata, and env-ref names only.

## Provider Account

The provider setup surface supports two legitimate paths:

- Supabase Management API personal access token for project discovery.
- Direct project binding with project URL plus service role key.

Runtime values are written to `.env.local` only. Workspace rows store env-ref
names such as `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optional
`SUPABASE_ANON_KEY`. The service role key is server-side only.

## Postgres Product

Supabase Postgres is the `workspace-data` product.

Capabilities:

- Verify the bound project through PostgREST using the `apikey` header and
  `Authorization: Bearer`.
- Install a verified API Registry row for `supabase-postgrest`.
- Discover and bind external tables as governed `data-source` objects.
- Pull and push through `/api/workspace/add-ons/supabase/data`.
- Stamp sync proof on the governed object:
  `lastSyncedAt`, `lastSyncStatus`, `lastSyncSummary`,
  `lastSyncReceiptId`, and `lastSyncFingerprint`.
- Feed causation-derived state through `deriveExternalSyncFreshness`:
  `unbound`, `never-synced`, `drifted`, `conflict`, `stale`, `synced`.

The database-table cockpit/lens state is never guessed from a product badge.
It is derived from the governed table object's binding and sync stamps.

## Storage Product

Supabase Storage is the `workspace-storage` product.

Capabilities:

- Verify the Storage API through `/storage/v1/bucket`.
- Install a verified API Registry row for `supabase-storage`.
- Create or link a governed file-record table for first-run setup.
- Create a real Supabase bucket through the server-side storage route.
- Read the bucket inventory back and write governed bucket rows into
  `supabase-buckets`.
- Preserve bucket configuration in governed rows:
  bucket id, access, MIME allowlist, file-size limit, CDN URL for public
  buckets, linked table, registry id, status, and response summary.
- Sync and delete buckets through the same governed route.

Storage has its own causation gate:

```text
provider-required -> link-required -> ready -> active
```

The gate is derived by `deriveBucketProductState`, not by optimistic UI text.
Blocked actions are receipted as `workspace-add-on-storage`.

## Workspace Apps Surface

The Apps settings surface shows external links derived from installed product
rows. Supabase Postgres and Supabase Storage intentionally use the same
Supabase product icon on the app card so the paired product links read as one
provider family. The Apps surface does not render standalone "proof pills" for
Storage buckets; detailed proof lives in the governed bucket rows, product
rows, receipts, and lane-specific cockpit/readback routes.

Other provider icons must remain provider-specific and must not be changed to
fix the Supabase pair.

## Mutation Boundary

Supabase add-on work follows the normal governed mutation boundary:

- Provider/product setup writes API Registry rows through add-on routes.
- Postgres table sync writes governed `data-source` objects through the data
  route.
- Storage bucket setup writes the buckets object through the storage route.
- No route writes secret values into config, receipts, browser payloads, or
  Data Model rows.
- No UI surface should invent success. It must read back route results,
  installed rows, governed objects, or receipt-backed causation state.

## Verification

Required focused gates for this topology:

```bash
node --test scripts/unit-workspace-add-ons-supabase.test.mjs
node --test scripts/unit-supabase-provider-hardening.test.mjs
node --test scripts/unit-workspace-storage-buckets.test.mjs
node --test scripts/unit-external-data-causation.test.mjs
node --test scripts/unit-workspace-external-sync.test.mjs
```

Browser QA must use the existing in-app browser when available and confirm:

- `/settings/add-ons` Supabase product cards show Postgres and Storage using
  the same Supabase product icon.
- `/settings/apps` workspace app external links show the same Supabase product
  icon for the Postgres and Storage links.
- Storage bucket state is backed by `supabase-buckets` rows and the
  `/api/workspace/add-ons/supabase/storage` readback.
- Database table state is backed by external table objects and
  `deriveExternalSyncFreshness` stamps when a table is actually bound.
