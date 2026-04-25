# Worker Kit Contract — v1

This is the **foundation contract** every Growthub worker kit conforms
to. It is universal: studio kits, workflow kits, operator kits, and ops
kits all satisfy this shape regardless of family or specialization.

> **Schema v1 vs v2 in one line:** Both are variations of the same
> Worker Kit primitive. **Schema v1** = worker kit core primitive,
> baseline, localized, open-source agent environment. **Schema v2** =
> the same primitive extended to package full applications (UI, app
> kits) inside the governed workspace. See
> [§ Schema versions — v1 vs v2](#schema-versions--v1-vs-v2) below.

The source of truth is the SDK type
[`WorkerKitManifest`](../packages/api-contract/src/worker-kits.ts) in
`@growthub/api-contract/worker-kits`, validated by the CLI:

```bash
growthub kit list                              # all kits, grouped by family
growthub kit inspect  <kit-id-or-path> [--json]
growthub kit validate <path-to-kit>
growthub kit health   <kit-id-or-path> [--json]
```

Markdown explains the rule; the SDK + CLI enforce it.

---

## What a Worker Kit is

A Worker Kit is a **portable, versioned local agent environment**.
Every kit ships:

| Required | File / directory | Captured by |
|---|---|---|
| Kit identity | `kit.json` (schema v1 or v2) | `WorkerKitManifest` |
| Skill manifest | `SKILL.md` (frontmatter + body) | `SkillManifest` |
| Agent contract | `workers/<id>/CLAUDE.md` or equivalent | `WorkerKitManifest.agentContractPath` |
| Session-memory template | `templates/project.md` | governed-workspace primitive #3 |
| Self-eval template | `templates/self-eval.md` | governed-workspace primitive #4 |
| Frozen-asset list | `kit.json#frozenAssetPaths` | gated by `pnpm check:worker-kits` |
| Output topology | `kit.json#outputStandard.requiredPaths` | gated by `pnpm check:worker-kits` |
| Bundle sidecar | `bundles/<kit-id>.json` | `WorkerKitBundleManifest` |

That is the **universal** kit shape. Every kit on `main` matches it.

---

## Schema versions — v1 vs v2

**Both v1 and v2 are variations of the same Worker Kit schema.**
Neither is a successor to the other; they express the same primitive
at two different scopes:

| Schema | Scope | Purpose |
|---|---|---|
| **v1** | Worker Kit **core primitive** | Baseline. Localized, open-source agent environment — `kit.json` + `SKILL.md` + agent contract + frozen assets + bundle. The portable, deployable unit. |
| **v2** | Worker Kit **with full applications inside the governed workspace** | Extends the same primitive to package full app surfaces (`type: "ui"`) — Next.js apps, Vite studio shells, installable UI — alongside the agent contract, all under the same governed-workspace contract. |

A kit declares which variation it is via `schemaVersion`. Both are
first-class. v1 is not deprecated and not a "lite" mode; it is the
correct shape when the kit ships only an agent environment with no UI
surface. v2 is the correct shape when the kit ALSO ships a full
application that lives inside the governed workspace.

Every kit currently in `cli/assets/worker-kits/` declares
`"schemaVersion": 2` because every shipped kit either includes a UI
surface or opts into the v2 metadata blocks (family, executionMode,
compatibility, provenance). New external or third-party kits without a
UI surface MAY declare `schemaVersion: 1`.

| Field / capability | v1 | v2 |
|---|---|---|
| `kit.id`, `kit.version`, `kit.name`, `kit.description` | required | required |
| `kit.visibility`, `kit.sourceRepo` | optional | optional |
| `kit.type` (`worker / workflow / output / ui`) | — | required (v2 addition) |
| `kit.family` (`studio / workflow / operator / ops`) | — | optional (v2 addition) |
| `entrypoint`, `workerIds`, `agentContractPath`, `brandTemplatePath`, `frozenAssetPaths`, `outputStandard`, `bundles` | required | required |
| `executionMode` (`export / install / mount / run`) | — | required (v2 addition) |
| `activationModes[]` | — | required (v2 addition) |
| `compatibility` (`cliMinVersion`, `requiredCapabilities`) | — | required (v2 addition) |
| `install?` (`installable`, `scopeDefault`, `postInstallHint`) | — | optional (v2 addition) |
| `ui?` (`icon`, `color`, `category`, `tags`) | — | optional (v2 addition) |
| `provenance?` (`frozenAt`, `frozenBy`, `checksum`) | — | optional (v2 addition) |

### What v2 specifically expresses (that v1 does not)

v2 is **the same Worker Kit primitive, extended to express full
applications inside the governed workspace.** v1 is the core baseline
without that extension. The defining v2 additions are:

1. **`kit.type = "ui"`** — declares the kit as an *app kit*: a Vercel-
   deployable Next.js app, a Vite operator/studio shell, or any other
   UI surface that lives inside the governed workspace alongside the
   agent contract.
2. **`executionMode = "install" | "mount" | "run"`** — supports kits
   that cannot be expressed as a pure `export`. App kits typically
   `install` into a scope and `mount` their UI surface.
3. **`ui?` block** — explicit UI-surface registration (icon, color,
   category, tags) that the discovery hub and `growthub kit` picker
   render.
4. **`compatibility.requiredCapabilities[]`** — lets app kits declare
   the capabilities they depend on (e.g. hosted bridge, BYOK provider
   keys), which the CLI verifies before activation.

In short: **v1 is the worker kit as core primitive — baseline,
localized, open-source agent environment.** **v2 is the same primitive
extended to package full applications inside the governed workspace.**
Both are valid; the choice is driven by whether the kit ships a UI
surface, not by recency.

The on-disk app surfaces (e.g. `apps/<surface>/`, `studio/`) appear in
`kit.json#frozenAssetPaths` and `kit.json#outputStandard.requiredPaths`
just like any other path. The `kit.type: "ui"` declaration is what
tells the CLI and agents to treat them as first-class.

Type guards are provided:

```ts
import {
  isWorkerKitManifestV2,
  isAppKit,
} from "@growthub/api-contract/worker-kits";
```

---

## The six governed-workspace primitives

Every Worker Kit implements the same six primitives. They are why an
agent can be dropped into any kit and operate without bespoke
onboarding.

| # | Primitive | Lives at | SDK type |
|---|---|---|---|
| 1 | `SKILL.md` (entry + frontmatter) | kit root | `SkillManifest` |
| 2 | Agent contract pointer | `workers/<id>/CLAUDE.md` | `WorkerKitManifest.agentContractPath` |
| 3 | Session memory | `.growthub-fork/project.md` (seeded from `templates/project.md`) | `SkillSessionMemory` |
| 4 | Self-evaluation | `templates/self-eval.md` + `SkillSelfEval` frontmatter | `SkillSelfEval` |
| 5 | Sub-skills | `skills/<slug>/SKILL.md` | `SkillSubSkillRef` |
| 6 | Helpers | `helpers/*.sh` | `SkillHelperRef` |

Primitives 1–4 are **required**. Primitives 5–6 are **optional** —
small operator kits often don't need either.

---

## Optional, orthogonal specializations

A kit MAY adopt any combination of the following. Each is independent
of the others. None of them changes the underlying Worker Kit
contract.

| Specialization | When to adopt | Manifest | SDK module |
|---|---|---|---|
| **Multi-stage pipeline** | Kit coordinates ≥ 2 sequential stages with typed input/output artifacts. | `pipeline.manifest.json` | [`pipeline-kits`](../packages/api-contract/src/pipeline-kits.ts) |
| **External dependencies** | Kit delegates work to external repos / forks / system binaries. | `workspace.dependencies.json` | [`workspaces`](../packages/api-contract/src/workspaces.ts) |
| **Adapter contracts** | Kit has provider-variability (BYOK, hosted bridge, persistence layer choice, auth provider, payment provider, etc.) | `docs/adapter-contracts.md` (kit-local) | [`adapters`](../packages/api-contract/src/adapters.ts) |
| **App / studio surfaces** | Kit ships a Vercel-deployable app, a Vite operator shell, or both. | `apps/<surface>/`, `studio/` | (no SDK type required) |
| **Health helper** | Kit needs composable readiness checks beyond `setup/verify-env.mjs`. | `helpers/check-*-health.sh` | (kit-local; CLI's `growthub kit health` composes it) |
| **Pipeline trace events** | Kit emits stage-boundary trace events (only meaningful for multi-stage kits). | `.growthub-fork/trace.jsonl` writes | [`pipeline-trace`](../packages/api-contract/src/pipeline-trace.ts) |

These are **orthogonal**: any combination is valid. A workflow kit
may declare adapters without a pipeline manifest. A studio kit may
have an external dependency without being multi-stage. An ops kit may
ship a health helper without any of the others.

---

## Kit families across the catalog

The current `cli/assets/worker-kits/` catalog spans every family. The
table demonstrates which specializations each kit currently uses; gaps
are NOT defects — they are correct choices for the kit's scope.

| Kit | Family | Pipeline | Workspace deps | Adapters | App surface | Health helper |
|---|---|---|---|---|---|---|
| `creative-strategist-v1` | workflow | — | — | — | — | — |
| `growthub-agency-portal-starter-v1` | studio | — | — | ✓ (5 families) | ✓ Next.js | — |
| `growthub-ai-website-cloner-v1` | studio | — | — | — | — | — |
| `growthub-creative-video-pipeline-v1` | studio | ✓ | ✓ | ✓ (generative + handoff) | ✓ Next.js + Vite | ✓ |
| `growthub-custom-workspace-starter-v1` | studio | — | — | — | — | — |
| `growthub-email-marketing-v1` | operator | — | — | — | — | — |
| `growthub-geo-seo-v1` | studio | — | — | — | — | — |
| `growthub-hyperframes-studio-v1` | studio | — | — | — | — | — |
| `growthub-marketing-skills-v1` | operator | — | — | — | — | — |
| `growthub-open-higgsfield-studio-v1` | studio | — | — | — | — | — |
| `growthub-open-montage-studio-v1` | studio | — | — | — | — | — |
| `growthub-postiz-social-v1` | studio | — | — | — | — | — |
| `growthub-twenty-crm-v1` | studio | — | — | — | — | — |
| `growthub-video-use-studio-v1` | studio | — | — | — | — | — |
| `growthub-zernio-social-v1` | studio | — | — | — | — | — |

The agency-portal and creative-video-pipeline kits validate that
adapter contracts repeat across families: persistence + auth + payment
+ reporting + integration adapters in one, generative + external-repo
handoff adapters in the other. That repetition is what justified
promoting `AdapterContractRef` into the SDK.

---

## How agents should read a Worker Kit

Deterministic operating loop — no Markdown inference required:

1. Read `SKILL.md` (typed by `SkillManifest`).
2. Run `growthub kit health <kit-id-or-path> --json` (typed by `KitHealthReport`).
3. Run `growthub kit inspect <kit-id-or-path> --json` (typed by `WorkerKitManifest`).
4. **If** the kit declares `pipeline.manifest.json`: run
   `growthub kit pipeline inspect --json` (typed by `PipelineKitManifest`)
   and operate per the v1 stage contract.
5. **If** the kit declares `workspace.dependencies.json`: run
   `growthub kit dependencies inspect --json` (typed by
   `WorkspaceDependencyManifest`) to verify external repo locators.
6. Operate the kit — read sub-skills, run helpers, write outputs to
   `output/<client>/<project>/` per the kit's `outputStandard`.
7. Append to `.growthub-fork/{project.md, trace.jsonl}` at every
   material boundary.

Steps 4–5 are no-ops on kits that don't adopt those specializations.
That is the entire point of the orthogonal-companion design.

---

## Shared JSON envelope (single source of truth for agents)

Every contract-surface CLI command emits the **same** outer envelope
when invoked with `--json`. This is true regardless of whether the
kit is a v1 single-file Worker Kit or a v2 multi-application Worker
Kit with a full UI surface inside the governed workspace.

```jsonc
{
  // Discriminator for the command that produced this envelope.
  "kind": "pipeline-inspect" | "pipeline-list"
        | "dependencies-inspect" | "dependencies-list"
        | "kit-health",

  // Doc + SDK pointers — let agents resolve the canonical schema.
  "conventionSpec": "docs/<DOC>.md",
  "sdkType": "@growthub/api-contract/<module>#<TypeName>",
  "sdkVersion": 1,

  // Universal target envelope. ALWAYS present (except on -list outputs,
  // which list multiple targets). Same shape across every command.
  "target": {
    "input": "<what the user typed>",
    "kitRoot": "<absolute path>",
    "resolvedFrom": "path" | "kit-id-bundled"
                  | "kit-id-exported" | "fork-id",
    "kitId":         "<from kit.json#kit.id>" | null,
    "forkId":        "<fork id when resolved via fork registry>" | null,
    "schemaVersion": 1 | 2 | null,
    "family":        "studio" | "workflow" | "operator" | "ops" | null,
    "capabilityType": "worker" | "workflow" | "output" | "ui" | null,
    "isAppKit":      <boolean — true iff schemaVersion === 2 && capabilityType === "ui">,
    "kitVersion":    "<from kit.json#kit.version>" | null,
    "specializations": {
      "pipelineManifest":      <bool>,
      "workspaceDependencies": <bool>,
      "adapterContractsDoc":   <bool>,
      "kitLocalHealthHelper":  <bool>
    }
  },

  // Command-specific payload. Always under a single keyed sub-object,
  // never spread at the top level — so the envelope shape stays stable.
  "manifest" | "report" | "kits": { ... }
}
```

### Why this matters

- **No contradictions across kit complexity.** A v1 single-file
  Worker Kit and a v2 multi-application Worker Kit produce the same
  envelope shape. The difference shows up inside the envelope
  (`schemaVersion`, `capabilityType`, `isAppKit`,
  `specializations.*`), not in the envelope's structure.
- **No contradictions across commands.** `growthub kit pipeline
  inspect`, `growthub kit dependencies inspect`, and `growthub kit
  health` all surface the same `target` block; an agent that has
  read one knows what to expect from the others.
- **No ambiguity in version fields.** Each manifest's schema version
  is named after its source — `pipelineManifestVersion`,
  `workspaceManifestVersion`, `report.version` — never the bare
  `manifestVersion` (which would conflict across surfaces).
- **Kit identity is canonical.** `target.kitId` is always read from
  `kit.json#kit.id`. The kit-local manifests carry their own
  `kitId` field for self-sufficiency (`manifest.kitId` in the
  inspect outputs); when those disagree with the canonical
  `target.kitId`, the agent has both values and can choose how to
  reconcile.

---

## What this contract does NOT do

- It does **not** force every kit to adopt every specialization.
- It does **not** enforce contract violations at runtime in v1 — the
  CLI inspects and reports; it does not block downloads or executions.
  All v1 manifest envelopes carry `runtimeEnforcement: "none"`.
- It does **not** privilege any provider or adapter mode (hosted vs.
  BYOK are peers).
- It does **not** rename existing kit-local conventions
  (governed-workspace primitives, sub-skill paths, helper paths,
  trace.jsonl event names).

---

## Specialization docs

- [`PIPELINE_KIT_CONTRACT_V1.md`](./PIPELINE_KIT_CONTRACT_V1.md) — multi-stage specialization
- [`ADAPTER_CONTRACTS_V1.md`](./ADAPTER_CONTRACTS_V1.md) — provider-boundary specialization
- [`PIPELINE_TRACE_CONVENTION_V1.md`](./PIPELINE_TRACE_CONVENTION_V1.md) — additive trace events for multi-stage kits

## Cross-references

- [`AGENTS.md`](../AGENTS.md) — repository agent contract
- [`docs/WORKER_KIT_ARCHITECTURE.md`](./WORKER_KIT_ARCHITECTURE.md) — earlier architecture baseline (pre-v1 SDK)
- [`docs/WORKER_KIT_CONTRIBUTOR_GUIDE.md`](./WORKER_KIT_CONTRIBUTOR_GUIDE.md) — author a new kit
- [`scripts/check-worker-kits.mjs`](../scripts/check-worker-kits.mjs) — frozen-asset gate
- [`scripts/score-worker-kits.mjs`](../scripts/score-worker-kits.mjs) — report-only maturity scorecard
