# CMS SDK v1 — Phase 2: Manifest Registry (Discovery Spine)

**Status:** Shipped in this branch.

Phase 2 makes `CapabilityManifestEnvelope` (frozen in `@growthub/api-contract` v1)
the canonical discovery spine for every Growthub surface. This doc describes
what shipped, the portable artifacts produced, and the sub-branches now
available under `growthub workflow`.

---

## Intent

> "A new capability ships once and becomes inspectable across every surface
> without per-surface work."

The CLI, hosted UI, harnesses, and third-party adapters now resolve
capabilities through one primitive — the manifest envelope — with explicit
`ManifestProvenance` so downstream surfaces can tell hosted, derived, and
local-extension origins apart without heuristics.

---

## Sources of truth

| Source | Provenance | Produced by |
| --- | --- | --- |
| Hosted capability endpoint | `hosted` | `createHostedExecutionClient().getHostedCapabilities()` |
| Fallback: derived from hosted workflow payloads | `derived-from-workflow` | existing CLI behavior |
| Local extension manifests | `local-extension` | `<workspace>/.growthub/manifests/*.json` |

The producer composes all three into one `CapabilityManifestEnvelope`
(`version: 1`). Hosted remains the source of truth; extensions layer on top
by slug.

---

## What ships

### New runtime module

```
cli/src/runtime/manifest-registry/
  index.ts                 # public entrypoint
  envelope-producer.ts     # hosted + derived + local-extension compose
  cache.ts                 # machine-scoped cache + drift stamping
  local-extensions.ts      # declarative extension loading
  drift.ts                 # compareEnvelopes → ManifestDriftReport
  types.ts                 # internal types (public types re-exported)
```

### New config home

```
GROWTHUB_MANIFEST_HOME/          # default: ~/.growthub/manifests
  index.json                     # known hosts + last fetch
  hosts/<host-slug>/
    envelope.json                # latest CapabilityManifestEnvelope
    envelope.prev.json           # previous envelope (drift basis)
```

Mirrors the layout convention established by `kit-forks-home.ts`.

### In-fork snapshot

```
<forkPath>/.growthub-fork/
  manifest.json                  # frozen CapabilityManifestEnvelope
  bindings/<slug>/<name>.json    # saved bindings (Phase 3)
```

Co-located with `fork.json` / `policy.json` / `trace.jsonl` / `authority.json`
so a fork is a self-describing artifact for both code and capabilities.

### New trace lifecycle events

Added to `KitForkTraceEventType`:

- `manifest_snapshot`
- `manifest_imported`
- `manifest_drift_observed`
- `bindings_saved`
- `bindings_loaded`
- `bindings_deleted`

---

## Sub-branch: `growthub workflow manifest …`

Every subcommand honors `--json` for agent parity.

```bash
growthub workflow manifest pull   [--host <url>] [--workspace <path>] [--json]
growthub workflow manifest show   [--slug <slug>] [--host <url>] [--json]
growthub workflow manifest drift  [--host <url>] [--json]
growthub workflow manifest hosts  [--json]
growthub workflow manifest snapshot --fork <path> [--host <url>] [--json]
growthub workflow manifest export --out <path> [--host <url>]
growthub workflow manifest import <path> [--fork <path>] [--json]
```

- `pull` — fetch fresh envelope, cache, rotate `.prev`, stamp drift.
- `show` — inspect full envelope or a single slug's manifest.
- `drift` — replay drift between the cached envelope and its prior snapshot.
- `hosts` — list cached hosts on this machine.
- `snapshot` — write the current envelope into a fork's in-fork substrate.
- `export` — emit the envelope as a portable JSON file.
- `import` — load a peer-exported envelope (stamped as local-extension) and optionally write it into a fork.

---

## Delegation (zero duplication)

`createCmsCapabilityRegistryClient()` at
`cli/src/runtime/cms-capability-registry/index.ts` now delegates to
`resolveEnvelope()`. The public client signature is unchanged — `capability
list`, `capability inspect`, the workflow picker, and the machine resolver
all read through the manifest registry automatically.

---

## Cross-machine and team sharing

Rides existing fork-sync:

1. `manifest.json` and `bindings/` under `.growthub-fork/` are additive
   artifacts — the existing fork-sync agent propagates them with its
   protected-paths / additive-apply rails.
2. Lifecycle is recorded to `trace.jsonl` via
   `appendForkLifecycleEvent(forkPath, type, summary, detail)`.
3. No new transport. No new home. No new abstraction.

---

## Drift taxonomy

`ManifestDriftMarker.change` is frozen by the v1 contract:

- `added` — new slug present in the fresh envelope
- `removed` — slug missing from the fresh envelope
- `executionKind` — execution kind changed
- `requiredBindings` — required binding set changed
- `outputTypes` — declared outputs changed
- `enabled` — enabled flag flipped
- `schema` — `inputSchema` or `outputSchema` changed

The same drift primitive backs Phase 3 schema migration previews via
`compareRecordToSchema(record, schema)`.

---

## Tests

- `cli/src/__tests__/manifest-drift.test.ts` — every drift kind
- `cli/src/__tests__/manifest-cache.test.ts` — atomic write + rotation + snapshot
- `cli/src/__tests__/manifest-local-extensions.test.ts` — extension loading + provenance + merge

All green.
