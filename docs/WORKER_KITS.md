# Worker Kits

Worker Kits are portable, versioned local agent environments packaged for Growthub Local.

This document is aligned to the current `README.md` mental model:

`source -> governed environment -> customization -> safe sync -> optional hosted authority`

---

## What A Worker Kit Is

A Worker Kit is a full environment package, not just a prompt file.

Typical kit payload includes:

- environment contract metadata (`kit.json`)
- runnable folder structure
- templates and examples
- setup and validation surfaces
- frozen asset boundary declarations
- agent-facing instructions

---

## CLI Surface

Primary kit commands:

```bash
growthub kit
growthub kit list
growthub kit inspect <kit-id>
growthub kit download <kit-id>
growthub kit path <kit-id>
growthub kit validate <path>
```

Use `growthub kit` when you want to start from a prepackaged environment with explicit runtime assumptions.

---

## How Kits Fit The Platform

Worker Kits are one of four first-run source paths:

1. repo import
2. skill import
3. starter scaffold
4. kit download

All paths converge on the same governed workspace lifecycle.

---

## Packaging Contract

Contributor expectations:

1. Define the kit contract in `kit.json`.
2. Ensure every declared required path exists on disk.
3. Keep bundle manifests consistent with the kit contract.
4. Register and expose the kit through CLI catalog surfaces.
5. Validate locally before PR.

Core invariant:

If an asset is declared as required, it must physically exist.

---

## Runtime Model

Kits are designed for local adapter execution through a real working directory.

Operational flow:

1. Discover kit.
2. Inspect contract.
3. Download/materialize.
4. Point an agent runtime at the exported folder.
5. Execute inside the kit environment.

---

## Relationship To Other Docs

- Architecture baseline: `ARCHITECTURE.md`
- Contributor workflow: `CONTRIBUTING.md`
- Agent workflow contract: `AGENTS.md`, `CLAUDE.md`
- Kernel packet details: `docs/kernel-packets/README.md`
- Environment examples: `docs/WORKER_KIT_ENVIRONMENT_EXAMPLES.md`
- Contributor implementation details: `docs/WORKER_KIT_CONTRIBUTOR_GUIDE.md`
