# Worker Kit Architecture

Growthub Agent Worker Kits package specialized agent workflows as reusable local execution environments.

## Core Principle

A worker kit is a bundled environment that combines:

- role instructions and prompts
- templates and reusable working materials
- examples and calibration references
- output standards and required artifact structure
- runtime assumptions about how the agent works locally

The stable unit is the environment package.

## The Five Layers

### 1. Contract Layer

This is the machine-readable boundary:

- `kit.json`
- bundle manifests
- versioning
- kit IDs and bundle IDs
- public payload boundary

### 2. Cognitive Layer

This is how the agent thinks inside the environment:

- prompts
- role instructions
- examples
- heuristics
- constraints

### 3. Production Layer

This is how work gets shaped:

- templates
- standards
- schemas
- required output paths
- folder conventions

### 4. Runtime Layer

This is the local execution substrate:

- files on disk
- editor assumptions
- browser/tool assumptions
- adapter compatibility

### 5. Activation Layer

This is how the environment is used today:

1. export the kit locally
2. resolve the expanded folder
3. point the agent `Working directory` at that folder
4. run the local adapter inside it

## Why This Matters

Worker kits package the execution context together instead of leaving it spread across prompts, files, and undocumented runtime assumptions.

That gives contributors a reusable unit for:

- repeatable agent performance
- controlled public payload boundaries
- deterministic validation
- cleaner validation boundaries

## Environment Classes

The current packaging model is compatible with:

- creative strategy environments
- email marketing environments
- browser-heavy GTM environments
- research and sourcing environments
- motion or Remotion-style production environments

The work left for each of these is primarily freezing, packaging, validation, and bundling.

## Runtime Reality

Kits can depend on:

- local files
- folderized outputs
- editor workflows
- browser-assisted execution
- custom adapter capabilities already present in the runtime

The environment package is the specialization. The adapter executes it locally.
