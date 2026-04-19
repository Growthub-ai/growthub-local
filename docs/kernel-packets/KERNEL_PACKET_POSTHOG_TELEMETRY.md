# PostHog Telemetry Kernel Packet

Version: `v1` (`@growthub/cli@0.8.0`)

This packet freezes the contract, invariants, and operator guidance for the PostHog telemetry subsystem — the cross-cutting observability layer that captures CLI command lifecycle events and discovery hub navigation across every Growthub Local installation that opts in.

## Why This Packet Exists

Growthub Local ships to many operators with heterogeneous usage patterns. Without instrumentation there is no signal on which commands are exercised most, which discovery hub paths are followed, and which capability axes are most valued by enterprise customers. This packet establishes the minimal, privacy-respecting telemetry contract that makes that signal available without compromising operator trust.

## Subsystem Layout

```
cli/src/telemetry/
  posthog.ts     # initTelemetry, track, shutdown — PostHog client wrapper
  index.ts       # public re-export surface
```

The subsystem is wired into `cli/src/index.ts` at the bootstrap boundary:
- `initTelemetry(cliVersion)` — called immediately after `surfaceRuntime` is resolved
- `process.once("beforeExit", ...)` — triggers `shutdown()` for best-effort flush
- `program.hook("preAction", ...)` — emits `cli_command_started`
- `program.hook("postAction", ...)` — emits `cli_command_completed`
- `runDiscoveryHub()` — emits `discovery_hub_nav`, `discovery_hub_settings_nav`, `discovery_hub_cancelled`

## Activation Contract

Telemetry is **off by default**. It activates only when:

| Condition | Env var |
|---|---|
| API key present | `GROWTHUB_POSTHOG_KEY=<key>` |
| Disabled override absent | `GROWTHUB_TELEMETRY_DISABLED` must NOT be `1` or `true` |

If `GROWTHUB_POSTHOG_KEY` is not set, zero network calls are made. The module is a strict no-op.

## Machine Identity

Each installation resolves a stable `distinctId` used for all events:

1. If `PAPERCLIP_INSTANCE_ID` is set in the environment, that value is used.
2. Otherwise, a UUID is read from `~/.growthub/machine-id` (created on first activation, `chmod 600`).
3. If the file cannot be read or written, an ephemeral per-process UUID is used (non-persistent).

No PII is stored or transmitted. The machine-id is a random UUID with no link to user identity.

## Event Schema

All events include these base properties automatically:

| Property | Value |
|---|---|
| `cli_version` | resolved from `package.json` at runtime |
| `platform` | `process.platform` (e.g. `darwin`, `linux`) |
| `node_version` | `process.version` |

### Emitted events

| Event | Trigger | Additional properties |
|---|---|---|
| `cli_command_started` | Every subcommand — `preAction` hook | `command` (full name), `surface` (`dx` \| `gtm`) |
| `cli_command_completed` | Every subcommand — `postAction` hook | `command`, `duration_ms`, `surface` |
| `discovery_hub_nav` | Top-level discovery hub menu selection | `selection` (`kits` \| `templates` \| `workflows` \| `native-intelligence` \| `agent-harness` \| `settings` \| `help`) |
| `discovery_hub_settings_nav` | Settings submenu selection | `selection` (`hosted-auth` \| `github` \| `fork-sync` \| `service-status` \| `custom-workspace-starter` \| `fleet-ops`) |
| `discovery_hub_cancelled` | Ctrl+C in discovery hub | — |

## Error Handling Contract

Every call to `track()` is wrapped in a `try/catch`. A PostHog client failure **must never** propagate to the CLI user. The module is instrumentation-only; it must be invisible when it fails.

## Enterprise Tier Observability (Phase 2)

The Fork Authority Protocol (`cli/src/kits/fork-authority.ts`, v0.7.0) introduced ed25519-signed attestation envelopes as a first-class schema inside every `.growthub-fork/` packet.

The intended Phase 2 integration is:

1. On `auth login` success — the Growthub-hosted issuer attaches a tier authority envelope via `kit fork authority attest`, encoding which capability axes are granted for the operator's paid tier.
2. `hasAuthorityCapability()` gates paid features at runtime.
3. PostHog captures which capability gates pass (i.e., are actively exercised) vs. which are locked — telling the product team which capability axis is most valued and should become the anchor SKU.

This Phase 2 surface is **not implemented in this packet**. It requires changes to `auth login` and `fork-authority.ts` and will land in a separate PR targeting those surfaces.

## Invariants Enforced by `check-fork-sync.mjs` (Section 22)

- `cli/src/telemetry/posthog.ts` exists
- `cli/src/telemetry/index.ts` exists
- `posthog.ts` exports `initTelemetry`, `track`, `shutdown`
- `posthog.ts` references `GROWTHUB_TELEMETRY_DISABLED` and `GROWTHUB_POSTHOG_KEY`
- `index.ts` re-exports all three functions
- `cli/src/index.ts` imports `./telemetry/index.js`, calls `initTelemetry(`, references `telemetryShutdown`
- `cli/src/index.ts` contains `discovery_hub_nav`, `discovery_hub_settings_nav`, `discovery_hub_cancelled`
- `cli/src/index.ts` contains `cli_command_started`, `cli_command_completed`
- `docs/kernel-packets/README.md` references `PostHog Telemetry Kernel Packet` and `KERNEL_PACKET_POSTHOG_TELEMETRY.md`

## Dist Rebuild Note

This is a **Phase A source PR**. `cli/dist/index.js` is not rebuilt here. The super-admin must execute Phase B (full workspace esbuild rebuild) after this PR merges, per `docs/RELEASE_DIST_REBUILD_WORKFLOW.md`.
