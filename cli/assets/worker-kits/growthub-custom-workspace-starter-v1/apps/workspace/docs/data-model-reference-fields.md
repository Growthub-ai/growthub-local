# Data Model reference fields

Governed reference columns (for example `registryId` on a Data Source or `schedulerRegistryId` on a Sandbox Environment) are declared on each `dataModel.objects[]` entry under `relations[]`. Preset object types ship default relation metadata; older objects pick up the same defaults through `effectiveRelations()` at read time.

## Server option loading

`POST /api/workspace/reference-options` returns normalized `{ value, label, secondaryLabel?, source, objectType?, status?, metadata? }[]` rows. The default path scans local `dataModel.objects[]` rows whose `objectType` matches `targetObjectType`, using optional `valueField`, `labelField`, `statusField`, and `statusAllowlist` on the relation descriptor.

## UI

The Data Model page uses `ReferencePicker` for objects that have a stable `objectId`. Widget-bound tables without an `objectId` keep the legacy client-only picker.

## Authority

The browser never receives provider secrets. Reference options for workspace rows are derived from config only; resolver-backed `listEntities` runs server-side with env/bridge resolution identical to `POST /api/workspace/test-source`.

## Examples (operator mental model)

### Data Source `registryId` → API Registry `integrationId`

- A **Data Source** row stores `registryId` as a governed foreign key to an **API Registry** row.
- In `relations[]`, the relation’s `field` is `registryId`, `targetObjectType` is `api-registry`, and the option collector uses `valueField: "integrationId"` (preset) so pickers show registry rows keyed by stable `integrationId`.
- Pick a connected registry row in the UI; the value saved on the Data Source is the **integration id string**, not a dashboard widget id.

### Sandbox Environment `schedulerRegistryId` → API Registry `integrationId`

- For **serverless** runs (`runLocality: "serverless"`), `schedulerRegistryId` must reference an API Registry row used as the outbound scheduler (Edge function, queue worker, etc.).
- The shipped relation uses the same `targetObjectType: "api-registry"` pattern with `valueField: "integrationId"`.
- `POST /api/workspace/sandbox-run` resolves credentials from `authRef` **server-side** only when calling that registry URL.

### Empty picker troubleshooting

1. **No rows of the target type** — create at least one API Registry row (or fix `targetObjectType` on the relation).
2. **Status allowlist** — if the relation defines `statusField` + `statusAllowlist`, only rows whose status is in the allowlist appear. Example: scheduler pickers often require `connected` / `approved` style statuses; a row stuck in `failed` or `draft` will be hidden until retested or edited.
3. **Search query** — server-driven search sends `query` to `reference-options`; clear the search box to see the first page again.
4. **Resolver-backed relations** — if options come from `listEntities`, run **Test source** on the parent integration first; failures surface as empty or error text from `fetchReferenceOptions`.

### Status allowlist behavior

When `statusAllowlist` is present on the relation descriptor, the collector filters candidate rows **before** labels are built. This is intentional governance: untrusted or untested registry rows should not appear as schedulers. If a valid row is missing, fix `status` on the API Registry row (often via the same drawer’s source test bar) or widen the allowlist in schema defaults deliberately—not by bypassing the API.
