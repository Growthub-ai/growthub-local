# Data Model reference fields

Governed reference columns (for example `registryId` on a Data Source or `schedulerRegistryId` on a Sandbox Environment) are declared on each `dataModel.objects[]` entry under `relations[]`. Preset object types ship default relation metadata; older objects pick up the same defaults through `effectiveRelations()` at read time.

## Server option loading

`POST /api/workspace/reference-options` returns normalized `{ value, label, secondaryLabel?, source, objectType?, status?, metadata? }[]` rows. The default path scans local `dataModel.objects[]` rows whose `objectType` matches `targetObjectType`, using optional `valueField`, `labelField`, `statusField`, and `statusAllowlist` on the relation descriptor.

## UI

The Data Model page uses `ReferencePicker` for objects that have a stable `objectId`. Widget-bound tables without an `objectId` keep the legacy client-only picker.

## Authority

The browser never receives provider secrets. Reference options for workspace rows are derived from config only; resolver-backed `listEntities` runs server-side with env/bridge resolution identical to `POST /api/workspace/test-source`.
