# Worker Kit Contributor Guide

This guide is for contributors building new Growthub Agent Worker Kits or expanding existing ones.

## The Rule

A new environment should be added as a self-contained kit folder, not as scattered one-off logic in the CLI.

## Recommended Workflow

1. Decide whether the new environment is:
   - a variant of an existing kit
   - a new capability family
2. Create a self-contained folder under `cli/assets/worker-kits/<kit-id>`.
3. Add `kit.json`.
4. Add one or more bundle manifests under `bundles/`.
5. Add the environment payload:
   - prompts
   - templates
   - examples
   - standards
   - output expectations
   - metadata docs
6. Register the kit in `cli/src/kits/catalog.ts`.
7. Validate the kit with `growthub kit validate <path>`.
8. Run repo checks such as `bash scripts/pr-ready.sh`.
9. Export the kit locally.
10. Point an agent `Working directory` at the exported folder and test it through a real local adapter.

## Kernel Packet (Required For Custom Workspaces)

For `family: studio` kits, follow the frozen kernel packet:

- [Custom Workspace Kernel Packet](./KERNEL_PACKET_CUSTOM_WORKSPACES.md)

Run the packet checks before opening or updating a PR:

```bash
bash scripts/check-custom-workspace-kernel.sh
```

## Two Good Build Paths

### Build On Top Of An Existing Kit

Use this when the environment pattern is already right and you mainly need to swap:

- role instructions
- templates
- examples
- standards
- output expectations

Example:

- start from `creative-strategist-v1`
- change the payload for a vertical-specific strategist environment

### Reuse Only Primitives

Use this when you want only parts of the current system, such as:

- brand kit formats
- templates
- output standards
- metadata conventions

Even then, the result should still be a complete standalone kit folder with its own manifest and bundle identity.

## Checklist

- self-contained kit folder exists
- `kit.json` exists and is complete
- bundle manifest exists and is complete
- payload files are present
- catalog registration exists
- `growthub kit validate <path>` passes
- real local adapter test passes through `Working directory`

## What Not To Do

- do not treat a new environment as “just another prompt file”
- do not scatter the environment across ad hoc CLI branches
- do not rely on hidden runtime assumptions without documenting them in the kit payload and metadata
- do not require new user-facing commands when the existing kit surface already fits

## Definition Of Done

A worker kit is ready when:

- the environment is self-contained
- the contract is explicit
- the payload is frozen and validated
- the exported folder runs correctly through a real local adapter

That is the standard for Growthub Agent Worker Kits.
