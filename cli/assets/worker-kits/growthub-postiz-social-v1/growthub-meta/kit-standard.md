# Kit Standard — growthub-postiz-social-v1

---

## Identity

| Field | Value |
|---|---|
| Kit ID | `growthub-postiz-social-v1` |
| Worker ID | `postiz-social-operator` |
| Bundle ID | `growthub-postiz-social-v1` |
| Brief type | `postiz-social-aeo-operating` |
| Family | `studio` (Custom Workspaces in CLI UX) |

---

## Export naming

| Artifact | Folder | Zip |
|---|---|---|
| Export | `growthub-agent-worker-kit-postiz-social-v1` | `growthub-agent-worker-kit-postiz-social-v1.zip` |

---

## Frozen asset contract

- `kit.json` `frozenAssetPaths` must match shipped files on disk.
- `bundles/growthub-postiz-social-v1.json` `requiredFrozenAssets` must mirror the frozen list for export validation.

---

## Versioning

- Bump `kit.kit.version` and `bundle.bundle.version` together when frozen assets change materially.

---

## CLI compatibility

`kit.json` `compatibility.cliMinVersion` should match the lowest CLI version that successfully lists and exports this kit.
