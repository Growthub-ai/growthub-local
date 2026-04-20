# PostHog Observability — Growthub Local activation funnel

> Thin observability for the Growthub Local CLI and installer.
> Only funnel events. No heavy analytics. No product bloat.

This doc is the single source of truth for:

- the event taxonomy the CLI emits
- the data contract (what is sent, what is never sent)
- the super admin's step-by-step PostHog link procedure
- opt-out controls for operators

It sits underneath the canonical product model described in
[`README.md`](../README.md):

```
repo / skill / starter / kit
  -> governed local workspace
  -> safe customization
  -> safe sync
  -> optional hosted authority
```

---

## What PostHog answers

### Acquisition
- `cli_installed`   (installer side)
- `cli_first_run`   (CLI side, first invocation per machine)
- `discover_opened`

### Activation — first-value paths
- `starter_import_repo_started` / `starter_import_repo_completed`
- `starter_import_skill_started` / `starter_import_skill_completed`
- `workspace_starter_created`
- `kit_download_completed`

### Expansion — governance and depth
- `fork_registered`
- `fork_sync_preview_started`
- `fork_sync_heal_applied`
- `growthub_auth_connected`
- `hosted_activation_clicked`   (fired when the in-terminal nudge renders)

### Friction
- `first_run_failed`
- `import_failed`
- `auth_required_encountered`
- `awaiting_confirmation_reached`
- `setup_health_failed`

Email / lead capture is **not** in this taxonomy. Email capture is
owned by the hosted Growthub app and happens after `growthub auth login`
completes. Inside the CLI, the only lead-side behavior is a
non-intrusive activation nudge printed at natural completion
milestones (kit exported, source imported, workspace scaffolded) that
points to the first-month $1 path.

---

## Data contract — what is sent, what is never sent

### Only these values leave the machine

- event name
- coarse path metadata (surface, source kind, import mode, kit family,
  remote sync mode, drift severity, heal action count)
- outcome (`success` | `failure` | `cancelled` | `skipped`)
- duration in milliseconds
- anonymous machine/session id (random UUID, minted lazily, stored at
  `<GROWTHUB_HOME>/telemetry/anon-id.json` with `0600` permissions —
  the home directory defaults to `~/.paperclip` on disk, which is the
  Growthub Local CLI's canonical local-state root and can be overridden
  via the `PAPERCLIP_HOME` env var)
- CLI version, Node major, OS label (`macos` | `windows` | `linux`)
- hosted user id + org id **only after** the operator has explicitly
  run `growthub auth login`

### What is never sent

- source code
- prompt contents
- secrets or API keys
- repo contents
- local file contents
- artifact payloads
- environment variables
- private URLs
- authority envelope contents

This is enforced in code by a whitelist sanitizer
(`cli/src/runtime/telemetry/capture.ts`) that drops any property key
that is not in the `ALLOWED_PROPERTY_KEYS` set defined in
[`cli/src/runtime/telemetry/events.ts`](../cli/src/runtime/telemetry/events.ts).
Adding a new property key requires a code change and a code review.

---

## Super admin: link your PostHog project

The CLI and installer read the project key from environment
variables. Telemetry is **OFF by default** until the super admin sets
a key. Nothing else has to change.

### 1. Create or open a PostHog project

- US cloud: <https://us.posthog.com/>
- EU cloud: <https://eu.posthog.com/>
- Self-hosted: the URL of your deployment

### 2. Copy the **Project API key**

In PostHog: `Project Settings` → `Project API Key`.

Use the project/ingest key, not the personal API key. The project key
can only write events — it cannot read data back out — so it is safe
to ship in a release channel or environment.

### 3. Choose the ingest host

| Cloud        | `GROWTHUB_POSTHOG_HOST`            |
| ------------ | ---------------------------------- |
| US           | `https://us.i.posthog.com` (default) |
| EU           | `https://eu.i.posthog.com`         |
| Self-hosted  | `https://posthog.your-domain.tld`  |

### 4. Set the environment variables

Bind the key once in the release environment (CI, release workflow,
or your own shell profile for local dogfooding):

```bash
export GROWTHUB_POSTHOG_PROJECT_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Optional — only needed if you are not on US cloud.
export GROWTHUB_POSTHOG_HOST=https://eu.i.posthog.com
```

That is the entire wiring step. The CLI and installer pick it up on
the next invocation.

### 5. Verify end-to-end

Run a disposable install, then check the PostHog **Events** view:

```bash
GROWTHUB_POSTHOG_PROJECT_KEY=phc_xxx \
  npm create growthub-local@latest -- --profile workspace --out /tmp/verify-posthog
```

You should see, in order:
`cli_installed` → `cli_first_run` → `discover_opened` (if the user
browses) → `workspace_starter_created` → `hosted_activation_clicked`
(from the end-of-flow nudge).

### 6. Build the funnel in PostHog

A minimal v1 funnel is enough:

1. `cli_installed` or `cli_first_run`
2. `discover_opened`
3. any of:
   - `starter_import_repo_completed`
   - `starter_import_skill_completed`
   - `workspace_starter_created`
   - `kit_download_completed`
4. `fork_registered`
5. `growthub_auth_connected`

Filter by `funnel_stage` to break the view by acquisition, activation,
expansion, retention, or friction.

---

## Operator opt-out

Operators can turn telemetry off at any time. Any of these will
disable capture:

```bash
export GROWTHUB_TELEMETRY_DISABLED=1
# or the cross-tool convention
export DO_NOT_TRACK=1
```

Operators can also rotate their anon id by deleting the file at
`<GROWTHUB_HOME>/telemetry/anon-id.json` (defaults to
`~/.paperclip/telemetry/anon-id.json`). The file is only ever
referenced locally — there is no server-side binding to rotate.

---

## Release channel wiring

When shipping `@growthub/cli` and `@growthub/create-growthub-local`,
bind `GROWTHUB_POSTHOG_PROJECT_KEY` in the environment where users run
the package, not in the package itself. In practice this means:

- For first-party dogfooding: set it in the release engineer's shell
  profile.
- For hosted CI that runs the CLI: set it in the job environment.
- For end-user distribution: do **not** bake the key into the npm
  artifact — Growthub's activation funnel is measured from the
  first-party distribution channel, not from arbitrary forks.

This keeps the thin observability layer safe, defensible, and
rotatable without ever shipping a new CLI version.

---

## Code map

| Concern                  | File                                                        |
| ------------------------ | ----------------------------------------------------------- |
| Event taxonomy           | `cli/src/runtime/telemetry/events.ts`                       |
| Capture client           | `cli/src/runtime/telemetry/capture.ts`                      |
| Config + opt-out         | `cli/src/runtime/telemetry/config.ts`                       |
| Anon id store            | `cli/src/runtime/telemetry/anon-id.ts`                      |
| First-run marker         | `cli/src/runtime/telemetry/first-run.ts`                    |
| In-terminal activation nudge | `cli/src/commands/activation-bridge.ts`                 |
| Installer-side event     | `packages/create-growthub-local/bin/create-growthub-local.mjs` |

All event call sites live at the CLI command boundary (starter init,
source import, kit download, auth login, fork register, fork heal,
doctor), not inside core library modules.
