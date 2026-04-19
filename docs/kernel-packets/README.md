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
| Hosted SaaS Kit Kernel Packet | `v1` | `./KERNEL_PACKET_HOSTED_SAAS_KIT.md` |
| Fork Sync Agent Kernel Packet | `v1` | `./KERNEL_PACKET_FORK_SYNC_AGENT.md` |
| Custom Workspace Starter Kit Kernel Packet | `v1` | `./KERNEL_PACKET_CUSTOM_WORKSPACE_STARTER.md` |
| Source Import Agent Kernel Packet | `v1` | `./KERNEL_PACKET_SOURCE_IMPORT_AGENT.md` |
| PostHog Telemetry Kernel Packet | `v1` | `./KERNEL_PACKET_POSTHOG_TELEMETRY.md` |

## Packet Relationships

The Hosted SaaS Kit Kernel Packet is a specialization of the Custom Workspace Kernel Packet. It inherits every invariant from the general worker-kit lifecycle and adds the narrow-case discipline for kits whose target is a hosted third-party REST API (no self-host, no SDK bundle, no new adapter registry entry). Reach for it when the provider is a hosted SaaS; reach for the Agent Harness packet when adding a local agent executor.

The Source Import Agent Kernel Packet is a specialization of the Custom Workspace Starter Kit Kernel Packet. It inherits every starter invariant (bundled kit catalog, fork registration, policy seeding, trace seeding) and adds the portable-source discipline for turning GitHub repositories or skills.sh skills into a materialized fork via the same pipeline. Reach for it when the workspace starts from an external payload; reach for the Starter packet directly when initializing a greenfield workspace.

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
