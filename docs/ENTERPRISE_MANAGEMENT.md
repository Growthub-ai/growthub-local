# Enterprise Management Surface

The enterprise management surface is command-first, not UI-first. Every
screen that an enterprise buyer wants to see is also available as a
scriptable CLI command so the same signals drive both the Environment
Management lane and external automation.

## Command map

| Command                       | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| `growthub environment`        | Interactive three-tab view: Local · Hosted · Bridge    |
| `growthub environment snapshot --json` | Machine-readable snapshot for dashboards      |
| `growthub capability refresh` | Re-pull hosted manifest + report drift                 |
| `growthub capability diff`    | Drift severity without touching interactive menus      |
| `growthub capability register <file>` | Install a local extension under the active fork  |
| `growthub authority show`     | Envelope + verification + policy attestation           |
| `growthub authority verify`   | CI-safe verification exit code                         |
| `growthub authority issuers`  | List paired trust-root issuers                         |
| `growthub policy show`        | Full fork policy + v1 projection                        |
| `growthub policy check <slug>`| Exit non-zero when a capability is denied              |
| `growthub policy providers`   | Allowed providers + rate limits                        |
| `growthub org show`           | Identity + entitlements + gated kits                   |
| `growthub org entitlements`   | Entitlement list (for scripts)                         |
| `growthub org gated`          | Gated kit list (for scripts)                           |

## Environment Management lane

The `🧭 Environment Management` option inside `growthub discover` opens
a three-tab picker:

- **Local** — registered forks, policy / authority presence,
  local-extension counts, active cwd fork. Jumps into `fleetView`.
- **Hosted** — profile, entitlements, gated kits, registry meta.
  Refreshes the capability manifest in place.
- **Bridge** — session token + cache freshness + drift severity.
  Jumps into the service statuspage.

## Policy v1 projection

The v1 policy fields documented in `@growthub/api-contract/metrics`
(`allowedCapabilities`, `allowedProviders`, `dataResidency`,
`perProviderRateLimits`) are read from the existing
`<forkPath>/.growthub-fork/policy.json` file via a
`policy.metadata.*` namespace. This lets operators add v1 fields without
breaking the existing `KitForkPolicy` interface.

## Authority envelope

The authority envelope (ed25519, `subject.kitId / forkId / policyHash`,
`grants.capabilities[]`, `expiresAt`, `nonce`) is already signed and
verified by `cli/src/kits/fork-authority.ts`. The new `growthub authority`
commands expose that machinery as a plain CLI surface — no new protocol.

## Agent-friendly outputs

Every command accepts `--json` and prints machine-readable output for
agents. The `environment snapshot --json` payload in particular is the
atomic datum agents should fetch before making decisions about what the
local + hosted state is today.
