# Growthub Local Architecture

This is the canonical architecture overview for `growthub-local`.

It is intentionally aligned to `README.md` and avoids historical or branch-specific narratives.

---

## Core Intent

Growthub Local turns a **repo, skill, starter, or kit** into a governed local environment that can be customized safely, synchronized safely, and optionally connected to hosted authority.

Canonical journey:

```text
source (repo/skill/starter/kit)
  -> local workspace
  -> governed fork state
  -> customization
  -> safe sync lifecycle
  -> optional hosted authority
```

---

## System Split

The architecture is split into two cooperating layers:

1. **Local execution layer** (CLI + local runtime)
   - environment creation
   - kit/template/workflow operations
   - fork state, policy, trace
   - local harness execution

2. **Hosted authority layer** (optional)
   - account identity
   - connection authority
   - capability/activation gates
   - hosted workflow/integration bridges

The local layer must remain useful without hosted connection.

---

## Main Surfaces

## 1) CLI (`@growthub/cli`)

Primary command surfaces:

- `growthub`
- `growthub discover`
- `growthub kit`
- `growthub template`
- `growthub workflow`
- `growthub pipeline assemble`
- `growthub starter import-repo`
- `growthub starter import-skill`
- `growthub open-agents`
- `growthub qwen-code`
- `growthub auth login|whoami|logout`

## 2) Guided installer (`@growthub/create-growthub-local`)

Primary install path:

```bash
npm create growthub-local@latest
```

Profiles create initial workspace variants and pin to the matching CLI version.

## 3) Local runtime (`server` + `ui`)

Canonical local runtime control:

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

---

## Portable Unit: Governed Fork

A governed workspace carries canonical state in:

```text
<forkPath>/.growthub-fork/
├── fork.json
├── policy.json
├── trace.jsonl
└── authority.json   # optional
```

Semantics:

- `fork.json`: identity
- `policy.json`: operator contract
- `trace.jsonl`: append-only lifecycle history
- `authority.json`: hosted-attached authority attestation (when present)

This in-artifact state is canonical. Supporting indexes are secondary.

---

## Source Ingestion Paths

Growthub Local supports four first-run source types:

1. **GitHub repo import**
2. **skills.sh skill import**
3. **custom workspace starter**
4. **worker kit download**

All are normalized into governed local environments, not raw one-off scaffolds.

---

## Fork Sync Model

Fork lifecycle must preserve customization while enabling upstream updates.

Required properties:

- drift detection
- safe change preview
- additive update application
- protected path preservation
- append-only trace logging

The architecture promise is:

**customization without decay**

---

## Worker Kit Model

Worker Kits are portable execution environments (not just prompts).

A kit typically packages:

- runnable structure
- templates and examples
- setup/validation surfaces
- agent contract metadata
- environment assumptions

The CLI kit surface manages discovery, inspect, validation, and download.

---

## Workflow Model

Workflow orchestration supports:

- saved workflows
- templates
- dynamic pipelines

Use workflow/pipeline lanes for typed orchestration over capability graphs. Use repo/skill/starter/kit lanes for fast environment creation.

---

## Harness Model

Harness integrations are first-class CLI lanes, including:

- Open Agents
- Qwen Code CLI
- additional harnesses as they reach shipped status

Harness credentials are handled through local secure flows and guided setup surfaces.

---

## Authority Attachment

Hosted connection is additive.

Users can create and operate local value first, then attach identity/authority when they need:

- hosted workflow access
- integration bridge flows
- higher-trust capability activation

The architecture must not force hosted dependency for baseline local value.

---

## Documentation Contract

To avoid split truths:

- `README.md` is the canonical top-level product narrative.
- This file (`ARCHITECTURE.md`) is the canonical architecture narrative.
- `AGENTS.md` and `CLAUDE.md` define agent workflow behavior.
- `CONTRIBUTING.md` defines contribution pipeline and guardrails.

If any doc conflicts with these, update or remove the conflicting section.

---

## Related Technical Docs

- `docs/WORKER_KITS.md`
- `docs/CLI_WORKFLOWS_DISCOVERY_V1.md`
- `docs/GROWTHUB_AUTH_BRIDGE.md`
- `docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md`
- `docs/QWEN_CODE_CLI_INTEGRATION.md`
- `docs/kernel-packets/README.md`
