# AWaC + Local Intelligence — Frozen Source of Truth V2
**Growthub Local | May 14, 2026 | @growthub/cli@0.10.0**

> **Canonical Reference Document — V2**
> This document supersedes `awac-source-of-truth-v1.md` and all prior partial descriptions.
> Version truth lives in `cli/package.json`, `packages/create-growthub-local/package.json`, `packages/api-contract/package.json`.
> All claims are traceable to: production screenshots (May 13–14 2026), `github.com/Growthub-ai/growthub-local`, `npmjs.com/@growthub/cli`, and the customer architecture guide embedded in this session.
> Per `docs/ARTIFACT_VERSIONS.md`: never cite semver from memory — always read from package manifests.

---

## Table of Contents

1. [Version Record](#1-version-record)
2. [What Changed from V1](#2-what-changed-from-v1)
3. [The New Reality — Governed Operational Database + Execution Cockpit](#3-the-new-reality)
4. [Governed Workspace Topology V2](#4-governed-workspace-topology-v2)
5. [The Seven Governed Primitives (updated)](#5-the-seven-governed-primitives)
6. [Local Intelligence — The Sixth Pillar](#6-local-intelligence)
7. [The Data Model UI — Production Screenshot Analysis](#7-the-data-model-ui)
8. [The Reference Options API](#8-the-reference-options-api)
9. [Sandbox Locality — Two-Lane Execution](#9-sandbox-locality)
10. [The Connector Template Library](#10-the-connector-template-library)
11. [The Two-Plane Architecture](#11-the-two-plane-architecture)
12. [CMS SDK — `local-intelligence` Adapter Kind](#12-cms-sdk-adapter-kind)
13. [Security & Governance Invariants (V2 confirmed)](#13-security-and-governance-invariants)
14. [Version Alignment Rule](#14-version-alignment-rule)
15. [Failure Modes Reference](#15-failure-modes-reference)
16. [What V2 Explicitly Does NOT Claim](#16-what-v2-does-not-claim)
17. [Glossary](#17-glossary)
18. [Documents to Read Next](#18-documents-to-read-next)

---

## 1. Version Record

| Package | Version | Source of Truth |
|---|---|---|
| `@growthub/cli` | `0.10.0` | `cli/package.json` + npm registry |
| `@growthub/create-growthub-local` | `0.6.0` | `packages/create-growthub-local/package.json` |
| `@growthub/api-contract` | `1.3.0-alpha.2` | `packages/api-contract/package.json` |

**Version alignment rule (CI-enforced):** The installer pin in `@growthub/create-growthub-local` must exactly match the `@growthub/cli` semver. If they diverge, CI fails. This is not a convention — it is a checked invariant per `ARTIFACT_VERSIONS.md` and `RELEASE_DIST_REBUILD_WORKFLOW.md`.

**Prior npm snapshot (libraries.io, last crawl):** `@growthub/create-growthub-local@0.4.1` / `@growthub/cli@0.9.10`. This document records the upgrade from that baseline to `0.10.0` / `0.6.0`.

---

## 2. What Changed from V1

V1 (awac-source-of-truth-v1.md, May 12 2026, `@growthub/cli@0.9.18`) established the frozen AWaC substrate. V2 is the first **major capability** release on top of that substrate.

| Dimension | V1 State | V2 State |
|---|---|---|
| **CLI version** | `0.9.18` | `0.10.0` |
| **Installer** | `0.5.18` | `0.6.0` |
| **Local Intelligence** | Not shipped as named feature | Shipped — full suite (planner, normalizer, recommender, summarizer) + governed tool intents |
| **Reference options** | `registryId` FK existed for api-registry only | `POST /api/workspace/reference-options` ships for all object types |
| **Sandbox locality** | `local` / `serverless` enum existed | Defaults for legacy rows formalized; locality docs complete |
| **Connector templates** | Drop-zone pattern documented | Template library shipped under `lib/adapters/integrations/templates/` |
| **`AdapterKind` in SDK** | No `local-intelligence` variant | `local-intelligence` added to `@growthub/api-contract` |
| **E2E probe scripts** | Manual curl only | Bundled HTTP probes: `scripts/awac-workspace-api-probe.mjs`, `scripts/awac-golden-path-probe.mjs` (GET → reference-options → sandbox-run + receipt assertions), `scripts/e2e-workspace-sandbox-api-probe.mjs`; distillation export: `scripts/export-distillation-jsonl.mjs` |
| **Data Model UI** | Object type rows in drawer | Full table UI: object switcher, view tabs, Add Field panel, column header menu (Filter/Sort/Move/Hide), section-based record drawer with field reorder controls |
| **Sandbox record drawer** | Five sections documented | Live: model dropdown, concrete model id, chat completions URL, resolver mode, runtime, environment & network, prompt & limits — all visible in screenshots |

---

## 3. The New Reality

> "This is no longer 'a workspace builder with some table UI.' Growthub Local has crossed into a governed operational database + execution cockpit."

This is the accurate description of the production surface as of `@growthub/cli@0.10.0`.

### What the screenshots confirm (May 13–14, 2026)

**Screenshot 1 — Object switcher + table view (IMG_2146):**
- Left panel: `Sandbox Environments` active (22 fields · 3 records). Objects listed: Sandbox Environments, Scaled Object 1–5. Views: Execution essentials, Model Debug, Ops Focus.
- Right panel: Table view with columns `version`, `runLocality`, `schedulerRegistryId`. The `schedulerRegistryId` column renders as `Select reference...` dropdown — confirming `reference-options` API is live in production.
- `+ Add view` input at bottom of left panel — view creation is a first-class UX primitive.

**Screenshot 2 — Add Field panel (IMG_2148):**
- Inline panel: Field name input + type grid: Text, Number, Date, URL, Select, Boolean.
- This is the V2 field creation surface — the simplified fast-add modal before the full `AddFieldModal` flow.

**Screenshot 3 — Column header context menu (IMG_2149):**
- Menu on `LastUpdated` column: Filter, Sort ascending, Sort descending, Move left, Move right, Hide.
- Confirms column-level operations are live.

**Screenshot 4 — Record drawer with field management (IMG_2143):**
- Record `Row 9` open. Sections: Identity (collapsed), Details (open — Status: Archived, Owner: Owner 9, LastUpdated: 2026-05-13, Notes: Scale smoke test), Fields (open — Name/Status/Owner/LastUpdated/Notes each with Hide/Up/Down controls).
- Section-level collapse is live. Per-field Hide/Up/Down controls are live. This confirms the full record drawer implementation from the implementation module.

**Screenshot 5 — Sandbox environment record drawer — full execution cockpit (IMG_2147):**
- Record: `super-admin-local-model-qa`. Status badge: `● connected`. Button: `▶ Run sandbox`.
- Fields visible:
  - Intelligence type dropdown: `Local intelligence (OpenAI-compatible)`
  - Concrete model id: `gemma3:4b`
  - Hint: "Open-ended tag aligned with CLI Local Intelligence. Falls back to NATIVE_INTELLIGENCE_LOCAL_MODEL or OLLAMA_MODEL."
  - Chat completions URL: `http://127.0.0.1:11434/v1/chat/completions`
  - Resolver mode: `ollama (OLLAMA_BASE_URL + /v1/chat/completions)`
  - Runtime: `node`
  - Section: `Environment & Network` — Env key references, network allow-list mode toggle, allow list field.
  - Section: `Prompt & Limits` — Instructions textarea (full system prompt visible), Command / prompt field.
- This confirms Local Intelligence is fully wired into the sandbox object model. The sandbox record drawer IS the execution cockpit for local model orchestration.

---

## 4. Governed Workspace Topology V2

The directory structure from V1 is preserved. Additive changes:

```
<workspace>/
├── growthub.config.json                      # unchanged V1 contract
├── apps/workspace/
│   ├── app/api/workspace/
│   │   ├── route.js                          # unchanged PATCH allowlist
│   │   ├── reference-options/route.js        # NEW — server-derived picker values
│   │   ├── sandbox-adapters/route.js         # V1 — unchanged
│   │   ├── sandbox-run/route.js              # V1 — unchanged
│   │   ├── test-source/route.js              # V1 — unchanged
│   │   └── refresh-sources/route.js          # V1 — unchanged
│   ├── lib/
│   │   ├── workspace-schema.js               # extended — new field types, section schema
│   │   ├── workspace-config.js               # unchanged
│   │   └── adapters/
│   │       ├── integrations/
│   │       │   ├── source-resolver-registry.js  # V1 — unchanged
│   │       │   ├── resolvers/                   # V1 drop-zone
│   │       │   └── templates/                   # NEW — connector template library
│   │       │       ├── custom-http.js
│   │       │       ├── webhook.js
│   │       │       ├── mcp-tool.js
│   │       │       ├── chrome-bridge.js
│   │       │       └── generic/crm|commerce|spreadsheet|pm.js
│   │       └── sandboxes/
│   │           ├── sandbox-adapter-registry.js  # V1 — unchanged
│   │           ├── adapters/                    # V1 drop-zone — extended
│   │           │   ├── default-local-agent-host.js
│   │           │   ├── default-local-process.js
│   │           │   └── [new drop-ins here]
│   │           └── local-intelligence/          # NEW
│   │               ├── planner.js
│   │               ├── normalizer.js
│   │               ├── recommender.js
│   │               └── summarizer.js
├── .growthub-fork/                           # V1 — unchanged authority
├── SKILL.md                                  # V1 — unchanged
├── AGENTS.md                                 # V1 — unchanged
└── docs/
    ├── GOVERNED_WORKSPACE_TOPOLOGY_V1.md     # V1 reference
    ├── WORKSPACE_CONFIG_CONTRACT_V1.md       # V1 reference
    ├── SKILLS_MCP_DISCOVERY.md               # reference
    ├── ADAPTER_CONTRACTS_V1.md               # NEW
    ├── NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md  # NEW
    └── RELEASE_DIST_REBUILD_WORKFLOW.md      # NEW
```

**File authority table additions (V2):**

| Path | What it is | Who writes it |
|---|---|---|
| `app/api/workspace/reference-options/route.js` | Server-derived picker values for ref fields | Operator inside fork |
| `lib/adapters/integrations/templates/` | Connector template library — starting patterns | Operator inside fork; forked from kit |
| `lib/adapters/sandboxes/local-intelligence/` | Local Intelligence flow modules | Operator inside fork |
| `docs/ADAPTER_CONTRACTS_V1.md` | Adapter contract specialization surface | Operator inside fork |
| `docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` | Full Local Intelligence internal reference | Operator inside fork |

---

## 5. The Seven Governed Primitives (updated)

V1 documented six governed `objectType` values. V2 confirms the same six remain canonical. No new objectTypes were added in this release — the extensions are in fields, sections, and the reference-options API.

| `objectType` | Governs | Widget source | Credential rule | V2 additions |
|---|---|---|---|---|
| `custom` | Manual business records | Yes | None | Full field type support: select, multiSelect, ref, multiRef, lookup; section grouping |
| `people` | Contact records | Yes | None | Same as custom |
| `api-registry` | API connection capability | Never | `authRef` slug | No change |
| `data-source` | Validated business data | Yes | `authRef` slug | No change |
| `sandbox-environment` | Execution plane | Never | `envRefs` slugs | **Major:** Local Intelligence fields (intelligenceType, modelId, chatCompletionsUrl, resolverMode), `● connected` status badge, `▶ Run sandbox` button |
| *(resolver-backed)* | Dynamic source records | Yes | Server-side | No change |

**The `sandbox-environment` objectType in V2 is the execution cockpit for local model orchestration.** The record drawer now carries: intelligence type selector, concrete model ID, chat completions URL, resolver mode, runtime, environment & network (env refs, network allow-list), and full prompt & limits section. This is the single surface where an operator configures, connects, and runs a local LLM agent task.

---

## 6. Local Intelligence

### What it is
An assistive CLI layer that reasons over real contracts and workflows using a local OpenAI-compatible model stack. It does NOT replace hosted execution. It is explicitly additive and degrades gracefully when the model is unavailable.

### Provider model
- Targets any OpenAI-compatible chat-completions surface
- Default local target: Ollama at `http://127.0.0.1:11434/v1/chat/completions` (confirmed in screenshot IMG_2147)
- Resolver modes: `ollama (OLLAMA_BASE_URL + /v1/chat/completions)` confirmed as production resolver mode
- Concrete model ID field: open-ended tag (e.g., `gemma3:4b`) — not locked to a model family
- Fallback chain: explicit config → `NATIVE_INTELLIGENCE_LOCAL_MODEL` env → `OLLAMA_MODEL` env → safe default

### The four flow modules
| Module | Purpose |
|---|---|
| **Planner** | Maps natural intent to plausible workflow paths given available primitives |
| **Normalizer** | Coerces raw binding payloads toward valid shapes for downstream systems |
| **Recommender** | Suggests reuse vs new artifacts — reduces CMS clutter |
| **Summarizer** | Condenses readiness/risk state for humans; feeds `project.md` |

These run as a suite from `growthub discover → Local Intelligence` lane. Thread persistence makes them useful across days, not single sessions.

### Governed tool intents (CISO contract)
Local Intelligence produces **validated tool intents** inside a JSON envelope. The model proposes; policy validates; deterministic executor dispatches. The model NEVER directly executes tools. This is the hard invariant:

```
model proposes intent
  → policy validates shape + permissions
  → deterministic executor dispatches (or rejects)
  → normalized result returned
```

Execution authority remains deterministic. This is not configurable — it is the product guarantee.

### What Local Intelligence does NOT do
- Does not replace model training pipelines
- Does not become the sole gate for production execution approvals (unless wired externally by operator)
- Does not require hosted Bridge credentials for local adapter mode
- Does not silently rewrite `.growthub-fork/project.md` — it advises drafts; humans approve

### Degradation behavior
- If local runtime is cold or unavailable: hosted workflows and local workspace editing continue unaffected
- Retry path exists for cold-start warmup
- Feature is assistive, not a hard dependency on any execution path

---

## 7. The Data Model UI — Production Screenshot Analysis

The production UI (confirmed May 13 2026, IMG_2146, IMG_2143, IMG_2148, IMG_2149) establishes these as shipped, not planned:

### Object switcher panel (left rail)
- Tabs: All | Objects | Views
- Object list with icon per type, lock icon for standard (protected) objects, `⋯` overflow menu
- Views list with icon, `⋯` menu per view
- `New view name` input + `+ Add view` button at bottom
- Active object shows record count and field count: "22 fields · 3 records"

### Table view (right)
- Column headers: field label + type icon + `⋯` menu
- Column menu: Filter, Sort ascending, Sort descending, Move left, Move right, Hide
- Reference columns: render as `Select reference...` dropdown — not free-text
- Add record button in toolbar
- Export CSV / Import CSV buttons in toolbar

### Add Field panel
- Field name input
- Type grid (2×3): Text, Number, Date, URL, Select, Boolean
- Cancel / Create buttons
- This is the fast-add panel; extended type picker (ref, multiRef, composite) is in full AddFieldModal

### Record drawer
- Header: `RECORD` label + record label (e.g., `Row 9`) + edit icon + close
- Section: `Identity` (collapsible, shows `>`)
- Section: `Details` (collapsible, shows `v`) — field rows: label above input, full-width input
- Section: `Fields` — field management mode with Hide/Up/Down controls per field
- Save changes / Cancel buttons at bottom

### Sandbox record drawer (execution cockpit)
- Header: record slug name + close
- Status badge: `● connected` (green dot)
- Action button: `▶ Run sandbox`
- Intelligence type dropdown (e.g., `Local intelligence (OpenAI-compatible)`)
- Concrete model id input (e.g., `gemma3:4b`)
- Hint text showing env var fallback chain
- Chat completions URL input (e.g., `http://127.0.0.1:11434/v1/chat/completions`)
- Resolver mode dropdown (e.g., `ollama (OLLAMA_BASE_URL + /v1/chat/completions)`)
- Runtime dropdown (e.g., `node`)
- `Environment & Network` section (collapsible): env key references note, network allow-list toggle, allow list input
- `Prompt & Limits` section (collapsible): Instructions textarea (full system prompt), Command / prompt input

---

## 8. The Reference Options API

### Endpoint
`POST /api/workspace/reference-options`

### What it does
Returns normalized option lists for reference fields — `{ value, label, ... }[]` — derived from rows already present in `dataModel.objects[]`. The server resolves relation metadata (target object type, which field is the value, which field is the label, optional status filters) without exposing secrets to the browser.

### Why it exists
Before this endpoint, reference fields (e.g., `schedulerRegistryId` on a sandbox row pointing to an api-registry row) required operators to hand-type opaque IDs. The screenshot (IMG_2146) confirms the `schedulerRegistryId` column renders as `Select reference...` — a server-backed picker, not a text field.

### Request shape
```json
{
  "targetObjectType": "api-registry",
  "targetObjectId": "obj_apireg_01",
  "valueField": "id",
  "labelField": "name",
  "statusFilter": null
}
```

### Response shape
```json
{
  "options": [
    { "value": "row_001", "label": "HubSpot Webhook", "status": null },
    { "value": "row_002", "label": "Ollama Local Scheduler", "status": null }
  ]
}
```

### Security invariant preserved
The browser receives `value` (row ID) and `label` (display name). It never receives `authRef` values, raw credentials, or env var contents. Server resolves those at execution time, not at picker-population time.

### PATCH allowlist compatibility
This is a `POST` route — it does not interact with the `PATCH /api/workspace` allowlist. It is additive, read-path only.

---

## 9. Sandbox Locality — Two-Lane Execution

### The `runLocality` field (confirmed shipped V1, stable in V2)

| Value | What happens | Credential path |
|---|---|---|
| `local` | Adapter under `lib/adapters/sandboxes/` spawns on the Next.js host | `envRefs` slugs resolved from server env |
| `serverless` | HTTPS POST to URL from `schedulerRegistryId → api-registry` row | Same `envRefs` pattern; auth via `authRef` on the api-registry row |

### V2 addition: legacy row defaults
Rows created before explicit `runLocality` was introduced now receive a safe default at read time. No forced migration. No demo breakage from upgrading the CLI.

### The normalized envelope — `growthub-sandbox-run-v1`
Every execution (local or serverless) produces a uniform receipt appended to `growthub.source-records.json`:

```
{
  runId, version, adapter, agentHost, runtime,
  exitCode, durationMs, stdout, stderr,
  envRefsResolved, envRefsMissing,
  networkAllow, allowList,
  // V2 additions:
  intelligenceType, modelId, resolverMode, chatCompletionsUrl
}
```

Uniform receipts mean: SREs can compare local vs serverless runs without bespoke log parsers. Account teams can attach the same artifact to tickets. Engineering can reproduce with envelopes, not screenshots.

### Sandbox is NOT a widget source
Sandbox rows are excluded from View widget binding. This is an intentional architectural constraint. Execution telemetry flows through `source-records.json` and the `SandboxRunPanel`, not chart widgets.

---

## 10. The Connector Template Library

### Location
`lib/adapters/integrations/templates/`

### Shipped templates (V2)

| Template | Protocol | Use case |
|---|---|---|
| `custom-http.js` | REST | Generic HTTP endpoint connector |
| `webhook.js` | HTTP POST | Inbound/outbound webhook pattern |
| `mcp-tool.js` | MCP | Model Context Protocol tool invocation |
| `chrome-bridge.js` | Chrome DevTools / browser automation | Browser-based data extraction |
| `generic/crm.js` | REST/GraphQL | CRM vertical starter |
| `generic/commerce.js` | REST | Commerce/Shopify vertical starter |
| `generic/spreadsheet.js` | REST | Google Sheets / Airtable API starter |
| `generic/project-management.js` | REST | Linear/Asana/Notion vertical starter |

### Template invariant
Templates are inspectable files — they diff like normal code, ride PR review culture, and contain no hidden codegen. Operators fork them into `lib/adapters/integrations/resolvers/` and adapt. The architecture forbids hidden magic.

### Normalized output contract (each template must return)
```javascript
{
  _contract: "v1",
  success: boolean,
  data: any,       // widget-bindable normalized array or object
  error: null | { code, message },
  meta: { resolvedAt, sourceId, registryId }
}
```

---

## 11. The Two-Plane Architecture

```
+------------------------------------------------+
|              WORKSPACE PLANE                   |
|  growthub.config.json                          |
|  apps/workspace (Next.js)                      |
|  PATCH /api/workspace (allowlist enforced)     |
|  POST /api/workspace/reference-options (new)   |
|  POST /api/workspace/sandbox-run               |
|  POST /api/workspace/refresh-sources           |
|  POST /api/workspace/test-source               |
|  lib/adapters/ (execution adapters)            |
|  growthub.source-records.json (sidecar)        |
+------------------------------------------------+
                    |
                    | optional, additive
                    v
+------------------------------------------------+
|              CLI PLANE                         |
|  growthub discover (hub)                       |
|  Local Intelligence suite (V2)                 |
|  Worker kit export                             |
|  Fork registration                             |
|  Hosted auth flows                             |
|  growthub open-agents / qwen-code              |
|  growthub bridge agents bind                   |
+------------------------------------------------+
                    |
                    | optional, additive
                    v
+------------------------------------------------+
|         HOSTED AUTHORITY (Bridge)              |
|  Identity, integrations, hosted agents         |
|  CMS pipeline execution                        |
|  Bridge-backed widget bindings                 |
+------------------------------------------------+
```

### The thin boundary — contracts and envelopes
- Sandbox runs normalize to `growthub-sandbox-run-v1` payloads
- Reference options normalize to `{ value, label }[]`
- Local Intelligence consumes workflow summaries and binding shapes from contracts, not scraped HTML
- Tool intents are proposals subject to policy validation before any dispatch

---

## 12. CMS SDK Adapter Kind

`@growthub/api-contract@1.3.0-alpha.2` now includes `local-intelligence` under `AdapterKind`.

**What this enables:**
- Kits declare in one vocabulary that a surface uses local reasoning with OpenAI-compatible transport
- Domain code consumes normalized shapes without sniffing vendor strings
- Internal linters and human architecture reviews share a single enum for this boundary
- Codegen from `@growthub/api-contract` produces consistent types for local intelligence surfaces

**What this does NOT change:**
- Existing adapter families remain valid (no silent renames)
- `AGENT_ADAPTER_TYPES` for Paperclip host slugs is a separate constant — not merged with `AdapterKind`
- `gemini_local` pending alignment to `packages/shared/src/constants.ts#AGENT_ADAPTER_TYPES` (follow-up PR still open from V1)

---

## 13. Security & Governance Invariants (V2 confirmed)

These were hard rules in V1. V2 confirms they survived the release without compromise:

1. **Browser never executes hosted workflows, never holds Bridge tokens.** Unchanged.
2. **PATCH allowlist** (`dashboards | widgetTypes | canvas | dataModel`) is frozen. V2 added `POST /api/workspace/reference-options` as a separate read-path route — it does NOT modify the PATCH allowlist.
3. **Credentials are `authRef` or `envRefs` slugs only.** The sandbox drawer (IMG_2147) shows `envRefs` as "Add keys under Settings → APIs & Webhooks" — never inline values.
4. **Trace and policy are append-only, write-through-CLI.** Unchanged.
5. **Filesystem persistence is opt-in.** Unchanged.
6. **Local Intelligence tool intents are proposals only.** Model proposes → policy validates → executor dispatches. The model NEVER directly executes.
7. **Sandbox is not a widget source.** Confirmed — sandbox rows excluded from View widget binding in V2 as in V1.

**Invariant detection rule:** If a feature appears to break any of the above, treat it as a bug, not a "new flexible mode."

---

## 14. Version Alignment Rule

Per `ARTIFACT_VERSIONS.md` and `RELEASE_DIST_REBUILD_WORKFLOW.md`:

1. Never cite semver from memory. Always read from:
   - `cli/package.json` → `version`
   - `packages/create-growthub-local/package.json` → `version`
   - `packages/api-contract/package.json` → `version`

2. The installer pin (`@growthub/create-growthub-local`) must exactly match `@growthub/cli` semver. CI fails if they diverge.

3. `cli/dist/index.js` is a single-file esbuild bundle (established S03 of V1 release). Every npm publish must ship a rebuilt dist. Version bump without dist rebuild = broken release.

4. The README quickstart path is a **contract**, not documentation. If the exporter materializes at a different path than the README specifies, it is a bug (as was fixed in S04 of V1).

---

## 15. Failure Modes Reference

| Failure | Root cause | Resolution |
|---|---|---|
| "Reference options empty" | No target rows yet, or relation metadata doesn't match object types | Seed rows or adjust relation descriptor — data completeness issue, not auth failure |
| "Local Intelligence slow first call" | Model cold start | Retry path exists; distinguish warm-up from hard errors; teach operators |
| "Sandbox works locally but not serverless" | Registry endpoint, authRef, or network egress | Compare stdout/stderr patterns — same envelope, different gate; check `schedulerRegistryId` row |
| "Model executed my workflow" | Expectation mismatch | Reset: Local Intelligence advises; hosted execution paths remain explicit. This separation is the product guarantee. |
| "PATCH returns 400 unknown fields" | Operator attempted to write outside allowlist | Only `dashboards|widgetTypes|canvas|dataModel` accepted. Use `POST /api/workspace/settings` for branding, or edit config directly in fork. |
| "Dist missing imports" | Version bump without dist rebuild | Rebuild `cli/dist/index.js` with esbuild before publish (S03 lesson from V1) |

---

## 16. What V2 Explicitly Does NOT Claim

To protect operator credibility:

- Local Intelligence does NOT replace hosted CMS execution
- Not every local model is equally good at JSON envelopes — operator model selection matters
- Serverless sandbox does not remove the need for operational monitoring
- Templates accelerate construction, not compliance sign-off
- `@growthub/api-contract@1.3.0-alpha.2` is still alpha — the `1.3.0` stable promotion has not shipped
- `gemini_local` is in `KNOWN_SANDBOX_AGENT_HOSTS` in the starter but NOT yet aligned in monorepo `AGENT_ADAPTER_TYPES` — follow-up PR pending

---

## 17. Glossary

| Term | Definition |
|---|---|
| **AWaC** | Agent Workspace as Code — workspace folder as owned, portable, governed artifact |
| **Governed object** | Row in `dataModel.objects[]` validated by workspace schema |
| **PATCH allowlist** | Only `dashboards | widgetTypes | canvas | dataModel` can be mutated via HTTP PATCH |
| **`growthub-sandbox-run-v1`** | Normalized request/receipt envelope for sandbox execution across all adapters |
| **Locality** | Whether sandbox spawn happens on-host (`local`) or via outbound scheduler POST (`serverless`) |
| **Reference options** | Server-derived `{ value, label }[]` picker values for relation fields between governed rows |
| **Tool intent** | Proposed tool call payload subject to validation/policy — not implicit execution |
| **Adapter kind** | High-level SDK label for a provider family — now includes `local-intelligence` |
| **Source records** | `growthub.source-records.json` — normalized outputs from integration resolvers and sandbox runs |
| **Bridge** | Optional hosted authority for auth, agents, execution — orthogonal to local pilots |
| **Local Intelligence** | CLI-plane reasoning suite (planner, normalizer, recommender, summarizer) using local OpenAI-compatible model |
| **Resolver mode** | How the local intelligence adapter constructs its HTTP request (e.g., `ollama (OLLAMA_BASE_URL + /v1/chat/completions)`) |
| **Connector template** | Starting-point resolver `.js` file in `lib/adapters/integrations/templates/` — inspectable, forkable, diff-friendly |
| **Four-part governed pattern** | Registry singleton → drop-zone loader → API route → sidecar persistence — every primitive follows this |
| **Execution cockpit** | The sandbox record drawer in V2 — the single surface for configuring and running local model agent tasks |

---

## 18. Documents to Read Next

| Document | Purpose |
|---|---|
| `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md` | File-by-file topology and authority boundary |
| `docs/WORKSPACE_CONFIG_CONTRACT_V1.md` | `growthub.config.json` full schema and PATCH allowlist |
| `docs/SKILLS_MCP_DISCOVERY.md` | Skills + MCP protocol detail |
| `docs/ADAPTER_CONTRACTS_V1.md` | Adapter contract specialization surface (V2) |
| `docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md` | Full Local Intelligence internal reference (V2) |
| `docs/RELEASE_DIST_REBUILD_WORKFLOW.md` | Release + dist discipline (V2) |
| `docs/ARTIFACT_VERSIONS.md` | Semver discipline — always read versions from here |
| `AGENTS.md` | Single agent contract pointer — audit surface for all AI contributors |
| `.growthub-fork/project.md` | Session memory — where humans resume across handoffs |

---

*AWaC + Local Intelligence Frozen Source of Truth V2*
*Growthub Local — May 14, 2026*
*CLI: `@growthub/cli@0.10.0` | Installer: `@growthub/create-growthub-local@0.6.0` | SDK: `@growthub/api-contract@1.3.0-alpha.2`*
*Evidence: production screenshots (May 13–14 2026), customer architecture guide (session artifact), libraries.io npm snapshot, github.com/Growthub-ai/growthub-local*
*All semver claims: read from package manifests per `ARTIFACT_VERSIONS.md` — never from prose memory*
