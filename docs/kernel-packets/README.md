# Kernel Packets

This folder is the isolated source of truth for kernel packet versioning and sync.

Use it as the canonical lane for:

- packet contracts
- packet procedure updates
- packet validation command surfaces
- packet lifecycle/version notes

## Packet Registry

| Packet | Current Version | Path |
| --- | --- | --- |
| Custom Workspace Kernel Packet | `v1` | `./KERNEL_PACKET_CUSTOM_WORKSPACES.md` |
| Agent Harness Kernel Packet | `v1` | `./KERNEL_PACKET_AGENT_HARNESS.md` |

## Versioning Rules

Use semantic packet versions:

- `v1` — initial frozen packet
- `v1.x` — additive clarifications, checks, or guidance without breaking procedure shape
- `v2` — breaking changes to packet invariants, mandatory procedure steps, or definition-of-done

When bumping packet version:

1. update the packet doc with a `Version` section
2. update the Packet Registry table above
3. update any docs/scripts that reference renamed steps or commands
4. run packet validation scripts and `bash scripts/pr-ready.sh`

## Sync Contract

When packet docs change, keep these surfaces in sync in the same PR:

- packet validation scripts in `scripts/`
- command docs in `README.md` and relevant contributor docs
- any contract checks that point at packet file paths

This prevents drift between packet docs and executable checks.
