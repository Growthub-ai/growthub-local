# Frozen Snapshot — 2026-04-27

Retrospective source-of-truth snapshot of the past week of merged feature work
on `main`, the live npm surface, and the compounding roadmap.

This document defers to `README.md`, `cli/src/index.ts`, `cli/src/commands/`,
and `scripts/runtime-control.sh` per `AGENTS.md` "Source Of Truth Order". When
a future change makes any line here wrong, replace the line — do not stack a
correction on top.

---

## Frozen Versions (read from disk on this snapshot)

| Package | Version | Source of truth |
|---|---|---|
| `@growthub/cli` | `0.9.1` | `cli/package.json` |
| `@growthub/create-growthub-local` | `0.5.1` | `packages/create-growthub-local/package.json` |
| `@growthub/api-contract` | `1.3.0-alpha.1` | `packages/api-contract/package.json` |

The installer `@growthub/cli` pin matches `0.9.1`. CI `smoke` enforces this
alignment; do not cite versions from prose elsewhere.

---

## The Core Product Object

The governed agent workspace is the unit of value. Every other surface
(CLI, SDK, kits, bridge, harnesses, hosted authority) exists to create,
operate, customize, sync, or attest one of them.

A governed workspace carries canonical state in:

```text
<forkPath>/.growthub-fork/
├── fork.json       # identity
├── policy.json     # operator contract
├── trace.jsonl     # append-only history
├── project.md      # session memory (primitive #3)
└── authority.json  # signed attestation when hosted authority is attached
```

And ships the six architectural primitives declared by
`@growthub/api-contract/skills::SkillManifest`:

1. `SKILL.md` — discovery entry
2. Root `AGENTS.md` pointer (with `CLAUDE.md` + `.cursorrules` as plain-text
   pointer stubs)
3. `.growthub-fork/project.md` — session memory, seeded from
   `templates/project.md` at init/import
4. `selfEval.criteria[]` + `maxRetries` — bounded generate → apply →
   evaluate → record loop, every attempt written to `project.md` and
   `trace.jsonl`
5. Nested `skills/<slug>/SKILL.md` — sub-skill lanes for parallel sub-agents
6. `helpers/<verb>.{sh,mjs,py}` — safe-shell tool layer

Reference body:
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/docs/governed-workspace-primitives.md`
ships into every exported workspace.

---

## What Shipped This Week (chronological, merged to `main`)

| Date | PR | Commit | Surface |
|---|---|---|---|
| 2026-04-21 | #113 | `1b002b0` | Validate PostHog telemetry metadata + type-checking integration |
| 2026-04-22 | #117 | `9147fe3` | **CMS SDK v1 — public `@growthub/api-contract` package (Phase 1)** |
| 2026-04-22 | #121 | `5e21b7c` | **Phase B — hosted CMS manifest is canonical capability source** |
| 2026-04-23 | #124 | `ad15835` | `growthub-video-use-studio-v1` custom-workspace kit |
| 2026-04-23 | #126 | `fcc7bc5` | **`growthub skills` MCP discovery + worker-kit v1.2 six-primitive baseline** (v0.8.0) |
| 2026-04-23 | #127 | `db4b40a` | `growthub-agency-portal-starter-v1` — first **App Kit (schemaVersion 2)** |
| 2026-04-24 | —    | `7eb832d` | `growthub-creative-video-pipeline-v1` — first **Pipeline Kit** |
| 2026-04-25 | #134 | `87dabe5` | **Pipeline kit primitives v1 + SDK v1.3 promotion + Worker Kit v1+v2 union** |
| 2026-04-26 | #135 | `eefb82d` | **`growthub bridge` brand resources + discovery sync** (v0.9.1) |

---

## Breakthrough Milestones

### 1. The SDK Became Real and Public

`@growthub/api-contract` graduated from internal types to a published npm
package and then through three additive minors in five days. It now exposes
fifteen subpath modules: `capabilities`, `execution`, `providers`, `profile`,
`events`, `manifests`, `schemas`, `skills`, `worker-kits`, `pipeline-kits`,
`workspaces`, `adapters`, `pipeline-trace`, `health`, `bridge`. Each carries a
`*_VERSION = 1` sentinel so consumers can confirm the contract surface.

The SDK describes what must be true, not how it is done. It mirrors CLI truth
1:1 with zero references to provider SDKs, model identifiers, or kit-specific
implementation.

### 2. Worker Kit Became the Universal Foundation

`WorkerKitManifest` is now a discriminated union (`V1 | V2`) — both
first-class siblings:

- **v1** = baseline portable agent environment (the original kit primitive).
- **v2** = same primitive extended to package full applications inside the
  governed workspace (`kit.type:"ui"`, `executionMode: install|mount|run`,
  optional `ui` metadata, `compatibility.requiredCapabilities`, provenance).

Pipeline Kits, App Kits, and Workspace Kits are orthogonal optional
specializations layered on top of the same foundation.

The catalog now holds **15 kits** spanning the new taxonomy:
creative-strategist, agency-portal-starter, ai-website-cloner,
creative-video-pipeline, custom-workspace-starter, email-marketing, geo-seo,
hyperframes-studio, marketing-skills, open-higgsfield-studio,
open-montage-studio, postiz-social, twenty-crm, video-use-studio,
zernio-social.

### 3. Hosted CMS Manifest Is the Canonical Capability Source

Phase B flipped capability refresh/projection/configure precedence over to
the hosted `CapabilityManifestEnvelope` from `/api/cms/capabilities`. Hosted
manifest is primary; local cache is secondary; legacy derivation is
emergency cold-start only. Contract version mismatch or malformed bodies use
stale cache or fail — never silent derivation.

New runtime modules: `cms-manifest-client`, `cms-manifest-cache`,
`cms-manifest-diff` (8-category drift report), `cms-manifest-projection`.

### 4. The Bridge Is a First-Class Surface

`growthub bridge` exposes authenticated access to hosted business systems —
brand kits, brand assets, knowledge bases, MCP accounts — typed by the new
`@growthub/api-contract/bridge` subpath. Brand kits/assets are wired to
`/api/brand-settings` via session-derived auth.

This completes the production stack the README documents:

```text
governed workspace -> bridge -> CMS pipeline -> captured artifacts
```

### 5. Six-Primitive Baseline Across All Kits

Every one of the 15 kits, plus every governed fork, now ships the six
primitives. The `--qa` flag on `scripts/export-worker-kit.mjs` asserts the
shape — a kit missing any primitive cannot ship.

### 6. Discovery Lane Renamed to "Create Governed Workspace"

The discovery hub now leads with the governed-workspace metaphor across
the menu tree, the `npm create` installer, and the verifier
(`scripts/check-fork-sync.mjs`). The metaphor and the code agree.

---

## Emergent Capabilities Available Now

Source ingestion (`growthub starter import-repo`, `import-skill`, kit
download, custom workspace starter) — four normalized paths into the same
governed-fork model.

Self-healing fork sync — drift detection, change preview, additive update,
protected-path preservation, append-only trace.

Authority protocol — ed25519-signed envelopes via
`growthub kit fork authority` with offline verification, expiry, and
drift-aware gating.

Three first-class agent harnesses — Open Agents (`growthub open-agents`),
Qwen Code (`growthub qwen-code`), T3 Code (`growthub t3code`), all sharing
the harness auth primitive and profile binding.

Local intelligence — multi-provider intelligence flows, claude-mem memory
layer, Gemma local backend, marketing/deterministic context builders.

Marketing operator dispatch — `growthub-marketing-skills-v1` packs CRO,
SEO, content, email, launch, pricing, competitor, ASO frameworks behind one
intent dispatcher.

Headless pipeline execution — `growthub pipeline {assemble,validate,execute}`
typed by `ExecuteWorkflowInput` / `DynamicRegistryPipeline`, streaming
`ExecutionEvent` NDJSON.

Pipeline-kit, dependencies, and health inspectors — `growthub kit pipeline`,
`growthub kit dependencies`, `growthub kit health` consume the new SDK
contracts on real kits.

Hosted execution result capture — pipeline runs return structured results
plus storage paths so agents capture finished images/videos/slides/text and
download them through Growthub auth.

Skills + MCP discovery — `growthub skills {list,validate,session}` validates
every `SKILL.md` against `SkillManifest` and seeds session memory.

Telemetry with type-checking — PostHog metadata is validated at build time
so the analytics surface cannot drift from the typed contract.

---

## Compound Roadmap (no timelines, ranked by compounding leverage)

These items extend lines already shipped this week. None require new
foundational invention; each multiplies an existing primitive.

**Promote pipeline-kit primitives from alpha to stable.** SDK v1.3
explicitly stated promotion into `@growthub/api-contract` was gated on a
second pipeline-style kit adopting the v1 manifests. The reference kit
(`growthub-creative-video-pipeline-v1`) is in. A second adopter unlocks the
stable promotion path.

**Phase 3 + 4 of pipeline-primitive consumption inside the runtime.** Some
runtime readers (`pipeline-kits/`, `workspace-dependencies/`, `kit-health/`)
already exist — extend them through the rest of `cli/src/runtime/` so every
runtime module talks to SDK types instead of kit-local JSON.

**More App Kits (schemaVersion 2).** Agency-portal proved the pattern.
Extending v2 to twenty-crm, postiz, and other UI-bearing kits collapses the
gap between "operator environment" and "shipped application".

**Bridge surface expansion.** Brand kits/assets, knowledge, MCP accounts
shipped. Next compounding step: workflows, pipelines, triggers, integrations
through the same authenticated bridge contract — same auth model, same
typed envelope shape.

**Authority protocol depth.** Signed envelopes ship. Compounding follow-on:
revocation distribution, trust-issuer rotation, drift-aware gating tied to
fork-sync state.

**Self-healing fork sync × bridge.** Protected-path preservation already
exists in fork sync; next compound move is bridge-aware preservation so
hosted-derived assets (brand kits, knowledge) participate in the same
heal/preserve/append-only loop.

**Pipeline trace convention v1 wiring.** The five-event discriminated union
(`PipelineTraceEvent`) is in the SDK. Wiring kit-level trace emitters to the
discriminated shape lets every kit feed one cross-kit replay surface.

**Health primitive everywhere.** `KitHealthReport` exists; health endpoints
exist on the reference pipeline kit. Generalizing
`helpers/check-<kit>-health.sh` to every kit gives a single fleet-wide
readiness signal.

**Harness compounding.** Three harnesses share the auth primitive — the
next compound move is a harness-neutral profile/session contract so a kit
runs the same way under any harness without per-harness branches.

**Local intelligence parity.** Marketing context, deterministic context,
and memory exist. Compound win: same SDK shapes consumed by hosted CMS now
consumed by the local backend so a workflow runs identically online and
offline.

**Skills catalog graduation.** `SkillManifest` and `growthub skills`
validate today. The compounding move is making the catalog the routing
layer for harness invocation: discover → validate → invoke without leaving
the catalog.

---

## Reflection

The week's compounding pattern is visible if the merges are read as one
thread instead of nine PRs.

The catalysts were `#117` (publish the SDK at all) and `#126` (declare the
six primitives). Once those landed, the rest of the week followed
mechanically: Phase B made hosted manifests the source the SDK already
typed (`#121`); the new kits filled the catalog with implementations of the
six-primitive shape (`#124`, `#127`, `7eb832d`); `#134` promoted the
emergent shapes back into the SDK as v1.3 and unified the kit primitive into
v1+v2; `#135` exposed authenticated business systems through the same
contract surface. Each PR consumed the previous one and made the next
cheaper.

Three properties show this is structural, not incidental:

1. The CLI, the kits, the SDK, and the hosted manifest now use the same
   shapes. There is one type for a capability, one for a kit, one for a
   skill, one for a pipeline trace event. Drift requires breaking a sentinel.
2. The product object — the governed workspace — is the same artifact
   whether it came from a repo import, a skill import, a kit download, or a
   greenfield starter. Source ingestion converges to one primitive.
3. Hosted authority is additive. The local substrate is useful with no
   account; bridge, hosted manifest, and authority attestations layer on
   without becoming load-bearing for baseline value.

The risk surface is concentrated in two places: the SDK is still
`1.3.0-alpha.1`, and the bridge wires real hosted endpoints — both will
decide whether the next compounding wave is about hardening (cut a stable
SDK, lock the bridge contract) or expansion (more App Kits, more pipeline
kits, more bridge resources). Neither path requires a foundational shift.

The frozen position on 2026-04-27 is: **the governed agent workspace is the
product, the CLI is its executor, the SDK is its contract, and the bridge
is its authenticated path into real systems.** Everything in this snapshot
follows from those four sentences.
