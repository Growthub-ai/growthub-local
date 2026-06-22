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
- **New sub-export:** `@growthub/api-contract/resolver-registry` — an **additive
  contract**: type definitions plus runtime-safe vocabulary constants and one
  runtime guard (`isResolverRegistryIndex`). The package stays tree-shakeable
  (`sideEffects: false`). No existing export changed.
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
| Workflow scheduler/serverless persistence provisioning | **Out of scope.** 1.5.1 keeps main's existing serverless reference path intact and does not ship QStash/Supabase scheduler provisioning UI or routes. |

The only additions are: a machine-readable banner line on **generated** resolver
files, an additive `registry` field on `GET /api/workspace/resolvers`, two
generated do-not-edit artifacts in the resolvers dir, and one new dynamic
endpoint route. All are projections of the governed record.

## The contract surface

From `@growthub/api-contract/resolver-registry` (types + runtime-safe constants):

```ts
// Normalized governance taxonomy (shared with the resolver template registry).
// connectorKind is operator-editable text, so unknown values flow through.
type ResolverConnectorKind = "http" | "custom" | "tool" | "mcp" | "chrome" | "nango" | "none" | (string & {});
type ResolverProvenance    = "config-driven" | "static-file" | "helper-generated" | "passthrough" | "missing";
type ResolverTrust = "untested" | "tested" | "needs-resolver" | "missing-config"
                   | "registered" | "endpoint-live" | "reserved-future" | "collision-blocked";

interface ResolverRegistryEntry {
  recordRef:     { objectId: string; rowName: string; integrationId: string }; // the governed record
  integrationId: string;          // the human id on the row (source of truth)
  resolverId:    string;          // CANONICAL slug — file, registry key, endpoint all use this
  connectorKind: ResolverConnectorKind;
  provenance:    ResolverProvenance;
  templateId:    string;          // resolverTemplateId on the row (governance value)
  capabilities:  string[];        // listEntities | fetchRecords | runAction (governance value)
  executionLane: string;          // data-source | sandbox-local | sandbox-serverless
  filePath:      string | null;   // materialized resolver file, when present
  registered:    boolean;         // present in the registry (checked vs raw id AND slug)
  tested:        boolean;         // row's last test succeeded
  shape:         { arrayPath; idField; entityType; hasPagination } | null; // DERIVED facts only, never values
  score:         number;          // milestone activation score 0–100
  nextAction:    { stepId; id; label } | null;
  endpoint:      string | null;   // /api/resolvers/<resolverId> when registered
  trust:         ResolverTrust;   // single agent-readable trust label (derived)
  agentHints:    { callable; ready; endpoint; entityType; blockedReason; nextAction }; // model-context
  evidence:      { tested; hasShape; recordPath; idField; registered; endpointLive; provenance }; // why-trusted
}

interface ResolverRegistryIndex {
  kind: "growthub-resolver-registry-index-v1";
  version: 1;
  generatedAt: string;
  entries: ResolverRegistryEntry[];
  summary: { total; registered; tested; needsResolver; exposed; collisions };
  collisions: Array<{ resolverId: string; records: string[] }>; // distinct ids → same slug (hard error)
}

// Additive response of GET /api/workspace/resolvers (legacy fields preserved).
// Derivation failure is NEVER hidden — registry is null with explicit status.
interface UnifiedResolverRegistryResponse {
  files: string[]; registeredIds: string[]; resolvers: object[]; canUpload: boolean;
  registry: ResolverRegistryIndex | null;
  registryStatus: "ok" | "degraded";
  registryError: { reason: string; message: string } | null;
  artifactWritten: boolean;        // writable-runtime write-through outcome
  artifactReason: string | null;
}
```

### Identity, collisions, and degradation (hardening)

- **Canonical identity.** The governed record keeps its human `integrationId`;
  the resolver file, registry key, and endpoint all use `resolverId =
  slugify(integrationId)`. `registered` is checked against **both** the raw id
  and the slug, so a resolver registered under either form (generated files use
  the slug; Nango uses the raw id) is never a blind spot.
- **Collisions are hard errors.** Two governed ids that normalize to the same
  `resolverId` are reported in `collisions` and **fail the drift guard** — the
  system never silently picks one.
- **No silent failure.** Derivation failure → `registry: null` +
  `registryStatus: "degraded"` + `registryError` (and a governance receipt). A
  writable runtime that fails to persist artifacts reports `artifactWritten:
  false` with a reason and emits a receipt; read-only runtimes are live-only by
  design.
- **Drift guard enforces its claim.** `scripts/check-resolver-registry.mjs`
  (via the shared pure `diffResolverArtifacts`) fails on: orphan generated
  files, identity collisions, any saved-index drift (entry content + summary),
  and any endpoint-manifest mismatch (stale or missing endpoint, wrong path,
  connectorKind, or recordRef).

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

## Product contract: no-code API activation (engineering invariants)

These are not marketing lines — they are invariants the tests and CI enforce:

1. **The operator never fills `rootPath`/`idField`/`entityType` from scratch when
   a tested response exists.** The constructor derives them (`detected` summary +
   confidence); the review panel shows what was understood before any write.
2. **The system explains what it detected before applying** — record count,
   record path, id field, entity type, pagination, confidence band, and the
   endpoint that will be exposed.
3. **Generated artifacts are projections** of the governed record; the
   `api-registry` row is the single source of truth.
4. **The registry is the agent-readable truth surface.** Every entry carries a
   single `trust` label, a terse `agentHints` block, and a secret-safe `evidence`
   trail — an agent chooses its next move from state alone.
5. **Every connector kind is governed**, not just Nango. The taxonomy
   (`http | custom | tool | mcp | chrome | nango`) is honored; reserved kinds
   (`mcp | chrome | tool`) advertise themselves truthfully with a next action and
   are never rendered as broken `http` rows. A registered reserved-kind resolver
   is `endpoint-live` like any other (reserved is about auto-construction only).
6. **Failure states carry repair actions** — `blockedReason` + `nextAction` for
   collisions, missing-config, needs-resolver, reserved-future, degraded.
7. **Endpoint trust is evidence-backed** (`endpoint-live` requires registered +
   endpoint + tested).
8. **No secrets or raw payload values** appear in the registry, the review-panel
   chrome, or generated artifacts (env-ref names only, by design).
9. **CI fails on drift, identity collisions, and stale artifacts.**

## End-to-end release story

The feature is complete when the same governed API record is visible across the
human cockpit, the resolver registry, the generated artifacts, the dynamic
endpoint, and the workflow canvas:

1. **Record.** A row in the `api-registry` object owns `integrationId`, endpoint
   config, auth reference, last test response, response profile, and resolver
   linkage.
2. **Construct.** The cockpit uses the tested response profile to construct the
   resolver proposal. Users review detected fields; they do not author resolver
   code or fill blank root/id/entity fields from scratch.
3. **Register.** The governed apply lane writes the resolver projection and
   updates only the governed record links allowed by the workspace mutation
   policy.
4. **Expose.** The registry index and endpoint manifest correlate the row,
   resolver file, in-memory registration, and `/api/resolvers/<integrationId>`
   route.
5. **Use.** The workflow canvas can draft an API Registry call node from that
   record, preserving the user's mental model from API setup to workflow use.

This is the 1.5.1 scope. Scheduler provisioning, provider authentication flows,
and durable serverless scheduling are separate post-1.5.1 work and must not be
represented as shipped by this contract.

## Verification coverage matrix

| Product/agent guarantee | Proven by |
| --- | --- |
| No-code journey (no blank form; detected summary; one action) | `unit-resolver-registry.test.mjs` → "GOLDEN PATH" |
| Cockpit constructor = governed apply payload | "constructor-integration" |
| Agent-operability (trust + hints per state) | "agent-operability" |
| Full connector taxonomy honored (not Nango-only) | "structured governance values" (×2), "webhook is http" |
| Identity canonicalization + collisions | "identity — …" (×2), drift "collisions" |
| Drift guard enforces its claim | "drift — …" (8 cases) |
| Safe provenance header (no truncation/corruption) | "parseResolverFileHeader — full recordRef …" |
| Secret/PII safety | "registry is secret-safe AND PII-safe", GOLDEN PATH step 5 |
| Honest Nango readiness | "constructor — nango readiness is honest" |
| Reserved kinds truthful, recoverable | "constructor — reserved kinds …" |
| Real exported-workspace server path + endpoint + drift | `scripts/e2e-resolver-registry-probe.mjs` (14/14) plus temp-workspace runtime proof captured in the release snapshot |
| Edited cockpit UI compiles | E2E step 8b |
| Activation trace secret-safety | "activationTrace — derivable activation slice …" |

**CI-enforced release gate** (`.github/workflows/ci.yml` verify):
`check-resolver-registry.mjs` (drift guard) plus
`node --test scripts/unit-resolver-registry.test.mjs` (full resolver unit suite:
golden path, agent-operability, taxonomy, collisions, secret-safety, and
activationTrace). The release snapshot records the completed temp-workspace
browser/API proof for the end-to-end user path.
