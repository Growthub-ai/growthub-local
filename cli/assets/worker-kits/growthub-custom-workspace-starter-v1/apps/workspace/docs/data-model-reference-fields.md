# Data Model reference fields

Governed reference columns (for example `registryId` on a Data Source or `schedulerRegistryId` on a Sandbox Environment) are declared on each `dataModel.objects[]` entry under `relations[]`. Preset object types ship default relation metadata; older objects pick up the same defaults through `effectiveRelations()` at read time.

## Server option loading

`POST /api/workspace/reference-options` returns normalized `{ value, label, secondaryLabel?, source, objectType?, status?, metadata? }[]` rows. The default path scans local `dataModel.objects[]` rows whose `objectType` matches `targetObjectType`, using optional `valueField`, `labelField`, `statusField`, and `statusAllowlist` on the relation descriptor.

## UI

The Data Model page uses `ReferencePicker` for objects that have a stable `objectId`. Widget-bound tables without an `objectId` keep the legacy client-only picker.

## Authority

The browser never receives provider secrets. Reference options for workspace rows are derived from config only; resolver-backed `listEntities` runs server-side with env/bridge resolution identical to `POST /api/workspace/test-source`.

## Examples (workspace-row references)

### Data Source → API Registry (`registryId`)

- **Intent:** a Data Source row points at a tested API Registry integration row (`integrationId`) so resolver-backed tests and bindings share the same identifier.
- **Declaration:** shipped preset `objectType: "data-source"` includes a `relations[]` entry targeting `api-registry` (field `registryId`). The UI uses `ReferencePicker`, which calls `POST /api/workspace/reference-options` with `{ objectId, field: "registryId", … }`.
- **Operator flow:** create or open an **API Registry** row → set status into the allowlisted values your relation expects → open the Data Source row → pick the registry row from the dropdown (labels come from config; no secrets are listed).

### Sandbox Environment → API Registry (`schedulerRegistryId`)

- **Intent:** when `runLocality` is `serverless`, the sandbox route delegates to the scheduler URL derived from the referenced **API Registry** row.
- **Declaration:** preset `objectType: "sandbox-environment"` includes `schedulerRegistryId` → `api-registry`. Options are loaded the same way as any other reference column.
- **Operator flow:** ensure an API Registry row exists for your worker endpoint → bind **schedulerRegistryId** via the picker → keep **runLocality** consistent (`local` uses in-process adapters; `serverless` uses the registry row).

## Empty state troubleshooting

- **No options after opening the picker:** confirm a target table exists (for example API Registry rows for `registryId` / `schedulerRegistryId`). Resolver-backed relations need a valid `integrationId` and server-side credentials; failures surface as an error from `reference-options`, not as silent empty lists.
- **“Selected reference is missing or filtered out”:** the row still stores an id, but the option list no longer includes it—common when the API Registry **status** no longer passes the relation’s `statusAllowlist`, the referenced row was renamed or deleted, or filters/search hide it. Pick a new row or fix the referenced record’s status.

## `statusAllowlist` behavior

Relations may set `statusField` (usually `status`) and `statusAllowlist` (for example only `connected` rows). The collector drops rows whose status is **not** in the allowlist, which keeps untested or broken integrations out of pickers. If a valid integration shows as missing, check the **Source test** / connection status on the API Registry row first, then re-open the reference picker.
