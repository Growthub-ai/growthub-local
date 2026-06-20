# Unified API Resolver Registry — API Contract v1.5.1

The explicit, codified definition of the **1.5.1** enhancement to the frozen
`@growthub/api-contract` **1.5** surface. 1.5.1 is **additive and
non-destabilizing**: it does not change, deprecate, or re-shape any existing
governed object, the API Registry row, the PATCH allowlist, the
`registerSourceResolver` dispatch contract, or any 1.5 type. It *names and
correlates* what already exists so the no-code cockpit can construct resolvers
under the hood and agents can read one index instead of re-deriving the
workspace.

- **Package:** `@growthub/api-contract` — version `1.5.0` → `1.5.1` (additive).
- **New sub-export:** `@growthub/api-contract/resolver-registry` (type-only +
  frozen vocabulary). No existing export changed.
- **Sentinels stay `1`:** `API_CONTRACT_VERSION` and
  `WORKSPACE_RESOLVER_REGISTRY_CONTRACT_VERSION` are both `1` — additive changes
  never bump the literal.

## What 1.5.1 does NOT touch (the stability guarantee)

| Surface | Status in 1.5.1 |
| --- | --- |
| `api-registry` row shape (`dataModel.objects[].rows[]`) | **Unchanged.** The governed record stays the single source of truth. |
| PATCH allowlist (`dashboards`/`widgetTypes`/`canvas`/`dataModel`) | **Unchanged.** No new mutation field. |
| `registerSourceResolver` / `getSourceResolver` contract | **Unchanged.** Resolvers register and dispatch exactly as before. |
| Server-file resolver write lane (`affectedField: "server-file"`) | **Unchanged.** Still gated, confined, secret-safe. |
| Nango config-driven loader (`registerNangoResolversFromConfig`) | **Unchanged** — generalized *behind* a builder dispatch, not replaced. |
| Governed Application Control Plane V1 (app-scope, outcome receipts) | **Reused**, not modified — the new endpoint enforces the same gate. |

The only additions are: a machine-readable banner line on **generated** resolver
files, an additive `registry` field on `GET /api/workspace/resolvers`, two
generated do-not-edit artifacts in the resolvers dir, and one new dynamic
endpoint route. All are projections of the governed record.

## The contract surface (type-only)

From `@growthub/api-contract/resolver-registry`:

```ts
type ResolverConnectorKind = "custom-http" | "nango" | "mcp" | "webhook" | "chrome" | "none";
type ResolverProvenance    = "config-driven" | "static-file" | "helper-generated" | "passthrough" | "missing";

interface ResolverRegistryEntry {
  recordRef:     { objectId: string; rowName: string; integrationId: string }; // the governed record
  integrationId: string;
  connectorKind: ResolverConnectorKind;
  provenance:    ResolverProvenance;
  filePath:      string | null;   // materialized resolver file, when present
  registered:    boolean;         // present in the in-memory resolver registry
  tested:        boolean;         // row's last test succeeded
  shape:         { arrayPath; idField; entityType; hasPagination } | null; // from profileApiResponse
  score:         number;          // milestone activation score 0–100
  nextAction:    { stepId; id; label } | null;
  endpoint:      string | null;   // /api/resolvers/<integrationId> when registered
}

interface ResolverRegistryIndex {
  kind: "growthub-resolver-registry-index-v1";
  version: 1;
  generatedAt: string;
  entries: ResolverRegistryEntry[];
  summary: { total; registered; tested; needsResolver; exposed };
}

// Additive response of GET /api/workspace/resolvers (legacy fields preserved):
interface UnifiedResolverRegistryResponse {
  files: string[]; registeredIds: string[]; resolvers: object[]; canUpload: boolean;
  registry: ResolverRegistryIndex;
}
```

Frozen constants: `RESOLVER_CONNECTOR_KINDS`, `RESOLVER_PROVENANCE_VALUES`,
`RESOLVER_REGISTRY_INDEX_KIND`, `RESOLVER_ENDPOINT_MANIFEST_KIND`,
`RESOLVER_REGISTRY_DIR`, `RESOLVER_REGISTRY_INDEX_FILE`,
`RESOLVER_ENDPOINT_MANIFEST_FILE`, `RESOLVER_ENDPOINT_BASE` (`/api/resolvers`),
`RESOLVER_GENERATED_BANNER`. Guard: `isResolverRegistryIndex`.

## Runtime truth (where the contract is implemented)

| Concern | File |
| --- | --- |
| Pure correlation deriver | `apps/workspace/lib/unified-resolver-registry.js` (`deriveResolverRegistry`, `buildEndpointManifest`, `parseResolverFileHeader`) |
| Construct from intent + shape | `apps/workspace/lib/resolver-constructor.js` (`constructResolverProposal`, `getResolverBuilder`) |
| Server IO (file headers, gated artifacts) | `apps/workspace/lib/server-resolver-registry.js` |
| Generated-file provenance banner | `apps/workspace/lib/workspace-resolver-proposal.js` (`generateResolverCode`) |
| Read surface (additive `registry`) | `apps/workspace/app/api/workspace/resolvers/route.js` |
| Governed endpoint | `apps/workspace/app/api/resolvers/[integrationId]/route.js` |
| Drift guard (CI) | `scripts/check-resolver-registry.mjs` |
| Unit coverage | `scripts/unit-resolver-registry.test.mjs` |

## The invariant 1.5.1 codifies

**Generated resolver code, the index artifact, and the endpoint manifest are
projections of the governed `api-registry` record — never hand-edited.** They are
written and re-derived only through the two governed lanes:

1. the approval/patch API (helper `resolver.create` apply → `writeResolverProposalFile`,
   with the row's `resolverTemplateId` link via `PATCH /api/workspace`), and
2. the no-code browser cockpit.

Every generated file carries `// ${RESOLVER_GENERATED_BANNER}` and the CI drift
guard fails the build if a generated artifact diverges from a fresh
re-derivation — enforcing the invariant mechanically, the same way
`check-version-sync.mjs` enforces version policy.
