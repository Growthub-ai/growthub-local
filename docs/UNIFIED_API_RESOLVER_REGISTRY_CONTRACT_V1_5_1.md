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

## Verification coverage matrix

| Product/agent guarantee | Proven by |
| --- | --- |
| No-code journey (no blank form; detected summary; one action) | `unit-resolver-registry.test.mjs` → "GOLDEN PATH" |
| API Registry record → workflow canvas (canonical graph, draft, dup-safe) | `unit-api-registry-workflow-canvas.test.mjs` (CI-enforced) |
| Cockpit constructor = governed apply payload | "constructor-integration" |
| Agent-operability (trust + hints per state) | "agent-operability" |
| Full connector taxonomy honored (not Nango-only) | "structured governance values" (×2), "webhook is http" |
| Identity canonicalization + collisions | "identity — …" (×2), drift "collisions" |
| Drift guard enforces its claim | "drift — …" (8 cases) |
| Safe provenance header (no truncation/corruption) | "parseResolverFileHeader — full recordRef …" |
| Secret/PII safety | "registry is secret-safe AND PII-safe", GOLDEN PATH step 5 |
| Honest Nango readiness | "constructor — nango readiness is honest" |
| Reserved kinds truthful, recoverable | "constructor — reserved kinds …" |
| Real exported-workspace server path + endpoint + drift | `scripts/e2e-resolver-registry-probe.mjs` (14/14) — **manual/local QA** (`npm run e2e:resolver-registry`), NOT in the fast CI gate |
| Edited cockpit UI compiles | E2E step 8b (manual/local QA) |
| Activation trace secret-safety | "activationTrace — derivable activation slice …" |

**Enforcement split (no overclaim):**
- **CI-enforced** (`.github/workflows/ci.yml` verify): `check-resolver-registry.mjs` (drift guard) + `node --test scripts/unit-resolver-registry.test.mjs` (full resolver unit suite incl. golden path, agent-operability, taxonomy, collisions, secret-safety, activationTrace).
- **Manual / local QA** (not in the fast CI gate): `npm run e2e:resolver-registry` — does `npm install` + `next dev`, so it is run locally / on demand, not on every push.

## Deferred follow-ups (explicitly NOT claimed as covered)

These are tracked as post-merge work, not represented as done:

1. **Route-harness tests** for HTTP-route behaviors that need a booted route
   (only the *pure* pieces are unit-tested today; the live paths are exercised by
   the manual E2E + reused, already-tested governance helpers):
   - `GET /api/workspace/resolvers` derivation failure → `registryStatus:
     "degraded"` (not silent null) + receipt;
   - writable-runtime artifact write failure → `artifactWritten: false` + reason
     + receipt;
   - scoped resolver endpoint 404 does NOT leak registered ids; unscoped 404 may
     include discovery hints; fetch errors redacted.
2. **Full cross-surface `activationTrace`.** Today `activationTrace` carries the
   derivable slice (recordRef, testedAt, resolverId, filePath, endpoint, shape,
   constructorState, nextAction). The runtime-only facts — `artifactWritten`
   (resolvers route), endpoint test result (endpoint route), drift status (guard)
   — are surfaced by those surfaces; stitching them into one persisted trace is a
   follow-up.
3. **Browser-level (Playwright) drawer-click** coverage. The constructor
   derivation is proven at the unit level ("constructor-integration") and the
   edited `/data-model` client component is compile-checked in the E2E; a real
   click-through is deferred (no reliable browser driver in CI).

## API Registry official record activation journey

The API Registry record is the **source of truth**; it is the entry point into
the same governed workflow system, not a separate "resolver studio". One record
projects into three governed expressions:

- **Resolver endpoint** — the data-plane projection (`/api/resolvers/<resolverId>`).
- **Data Source** — the persistence / row-consumption projection.
- **Workflow canvas** — the operational projection: the canonical orchestration
  graph **Input → API Registry → Transform → Result** (`api-registry-call`
  carries `registryId`/method/endpoint/authRef; `transform-filter` carries the
  detected `rootPath` + field previews; `tool-result` writes status/lastResponse
  /source-record history).

The user-visible arc is one journey: **API Registry record → Test API →
Understand response → Activate governed rows → Use in a workflow → Persist/route
the result.** The drawer and the workflow canvas share the same node language
(API Registry / Transform / Result, Configuration / Test / Advanced) and the same
`dm-*` / `dm-cockpit-*` / `dm-orchestration-config*` CSS — no new visual language.

Governance is preserved end to end: creating a workflow from a record produces a
**draft, untested** sandbox row (never auto-live); publish stays server-authoritative;
the row stores `authRef` names only; duplicate workflows are blocked
(`findSandboxRowsForRegistry`) with an **Open workflow** action; and the canvas
surfaces a compact backing note (API untested/failed, or transform `rootPath`
drifted from the detected shape) that links back to the record.

Coverage: `scripts/unit-api-registry-workflow-canvas.test.mjs` (CI-enforced) —
detected shape → canonical graph, draft/untested row, duplicate prevention,
journey open-vs-create, no secret/PII serialization.
