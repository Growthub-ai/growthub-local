# Growthub Agent Worker Kit Standard

## Purpose

Growthub Agent Worker Kits are frozen, machine-readable exports of a worker directory that can be materialized locally by the Growthub CLI.

## Required Files

Every kit must provide:

- `kit.json` as the canonical manifest
- `bundles/<bundle-id>.json` for each frozen downloadable bundle
- a worker entrypoint path
- an agent contract path
- a brand template path
- a declared list of frozen asset paths
- an output standard that defines the required exported paths

## `kit.json` Contract

`kit.json` locks:

- kit identity and version
- entrypoint and worker ids
- agent contract path
- brand template path
- frozen asset paths
- output standard
- bundle list

## Bundle Contract

Each bundle manifest locks:

- bundle identity and version
- worker identity
- brief type
- required frozen assets
- optional presets array, even when empty
- export folder and zip naming

## Export Boundary

- exported zips and expanded folders are generated locally at runtime
- generated artifacts are not committed to the repo
- kits are exported for existing Working Directory path support
- bundle manifests must exclude confidential assets from the public payload
