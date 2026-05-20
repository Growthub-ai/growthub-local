# CRM Settings Mirror primitive (Phase 1)

`objectType: "crm-settings"` mirrors Twenty CRM workspace toggles inside **`growthub.config.json#dataModel.objects[]`** on the well-known object `crm-settings-mirror`. The mirror is additive, portable, and sub-megabyte — twenty boolean rows plus admin-exposure metadata, not a parallel settings store.

## Authority model

| Surface | Phase 1 | Later phases |
| --- | --- | --- |
| **Data Model** | Contract + validator (`crm-settings-mirror-contract.js`, `workspace-schema.js`) | Unchanged |
| **Admin** | Rows editable via PATCH `dataModel` (object hidden from picker) | Nav customize / divider toggles (Phase 2) |
| **Agent** | `readCrmSettingsSnapshot()` in `crm-settings-mirror.js` | Background agent proposes only (Phase 3), safe API (Phase 4) |

Hard rules:

1. All CRM settings live in `dataModel.objects[]` on id `crm-settings-mirror` — never a sidecar JSON file.
2. Exactly **20** catalog keys; unknown keys fail validation.
3. Background agents **read** and **propose**; they do not bypass PATCH validation or mutate without apply.
4. Do not bind `crm-settings` objects as View widget sources (same rule as `sandbox-environment`).

## Row shape

```json
{
  "key": "email-sync-enabled",
  "enabled": false,
  "adminExposure": "below-divider",
  "updatedAt": "",
  "mirroredAt": ""
}
```

Catalog metadata (`label`, `description`, `category`, `externalMirrorKey`, defaults) lives in `lib/crm-settings-mirror-contract.js` — not duplicated per row.

## Admin exposure values

- `above-divider` — super-admin toggles intended for top navigation customize (Phase 2).
- `below-divider` — operator toggles below the nav divider.
- `agent-only` — readable by background agents; not surfaced in member UI.

## Modules

| File | Role |
| --- | --- |
| `lib/crm-settings-mirror-contract.js` | Canonical 20-key catalog + normalization |
| `lib/crm-settings-mirror.js` | `ensureCrmSettingsMirrorObject`, `readCrmSettingsSnapshot` |
| `lib/workspace-schema.js` | `validateCrmSettingsRow` / object governance |
| `lib/workspace-data-model.js` | `OBJECT_TYPE_PRESETS["crm-settings"]`, hidden from picker |

## Seeding

Call `ensureCrmSettingsMirrorObject(workspaceConfig)` or ship the optional starter block in `growthub.config.json`:

```json
"dataModel": {
  "objects": [
    {
      "id": "crm-settings-mirror",
      "label": "CRM Settings Mirror",
      "objectType": "crm-settings",
      "pickerHidden": true,
      "columns": ["key", "enabled", "adminExposure", "updatedAt", "mirroredAt"],
      "rows": []
    }
  ]
}
```

Empty `rows` validates; runtime normalization fills defaults from the catalog on first read.

## Agent snapshot

`readCrmSettingsSnapshot(config)` returns `{ objectId, objectType, settings[], journeySignals[] }` where `journeySignals` lists enabled keys grouped for customer-journey reasoning.

## Related kits

`growthub-twenty-crm-v1` operator checklists (`templates/workspace-config-checklist.md`) inform the catalog keys; bridge sync maps `externalMirrorKey` when hosted authority is attached.
