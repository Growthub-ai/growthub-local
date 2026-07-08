# Claude Code Plugin Marketplace V1 — the governed console as a first-party plugin

> **Canonical contract for the Claude Code plugin/marketplace surface**
> (`.claude-plugin/marketplace.json` + `claude-plugins/**`). The console
> *pattern* is owned by [`docs/GOVERNED_MCP_CONSOLE_V1.md`](./GOVERNED_MCP_CONSOLE_V1.md);
> this doc owns how that pattern ships as an installable Claude Code plugin.
> Runtime truth (`cli/src/commands/workspace-derivation-commands.ts`) wins
> over both on exact tool shapes.

## What shipped

One `/plugin marketplace add Growthub-ai/growthub-local` gives any Claude
Code user the **Growthub Governed Console** plugin: the existing
`growthub serve --mcp` server (14 tools) plus portable operator skills, a
read-only investigator agent, and a SessionStart orientation hook —
first-party packaging of the MCP console per current Claude Code plugin
standards ([plugins-reference](https://code.claude.com/docs/en/plugins-reference.md),
[plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces.md)).

```
.claude-plugin/marketplace.json                     # marketplace "growthub"
claude-plugins/
  growthub-governed-console/                        # plugin (v lockstep with @growthub/cli)
    .claude-plugin/plugin.json                      # manifest (metadata + component paths)
    .mcp.json                                       # governed-universe MCP server (npx, exact pin)
    skills/
      governed-console/SKILL.md                     # drive the 14 tools + the operating loop
      governed-workspace-mutation/SKILL.md          # portable mutation-boundary card
      workspace-causal-cli/SKILL.md                 # plan / patch / capture / readiness --json
      workspace-helper/SKILL.md                     # propose → review → apply lane
    agents/workspace-operator.md                    # read-only investigator agent
    hooks/hooks.json + scripts/session-context.sh   # SessionStart orientation (offline, silent outside a workspace)
    README.md
scripts/check-claude-plugin.mjs                     # structural + lockstep CI gate (wired into ci.yml)
```

## 1. Current State (what existed before this surface)

- **The MCP console** — `growthub serve --mcp`
  (`cli/src/commands/workspace-derivation-commands.ts`, `buildMcpTools()`):
  a zero-dep stdio JSON-RPC server exposing 12 Intelligence (read-only)
  tools, `preflight_patch` (Law dry-run), and `next_actions` (governed
  hand-off). Boundary-tested by `cli/src/__tests__/workspace-mcp-tools.test.ts`.
  It was reachable only by hand-wiring a local MCP config.
- **Skills** — `.claude/skills/*` load for agents working *in this repo*
  (project scope) and worker-kit `SKILL.md` cards ship *inside exported
  workspaces*; neither was installable by a Claude Code user operating a
  fork from their own machine.
- **No distribution surface** — no `.claude-plugin/`, no marketplace, no
  plugin-shaped packaging of any of the above.

## 2. Missing Extension

A first-party, versioned, installable packaging of the console: the plugin
manifest + marketplace index + portable skills that make
"operate a governed workspace from Claude Code" a one-command install
instead of a hand-assembled config.

## 3. Strategic Direction

The plugin is a **distribution shell around existing runtime truth — zero
new capability, zero new mutation path**:

- The MCP server is the published `@growthub/cli` binary, exact-pinned via
  `npx` — the plugin adds no server code, so the console cannot drift from
  the CLI release it ships with.
- Plugin skills restate the governed contracts and *defer* to the
  higher-authority in-workspace card
  (`skills/governed-workspace-mutation/SKILL.md` in every export) on exact
  shapes — pointer-over-copy, the same pattern as `CLAUDE.md → AGENTS.md`.
- The read + dry-run + hand-off boundary is preserved verbatim: the plugin
  ships **no** tool, hook, or agent that mutates a workspace.

## 4. Phased Implementation

| Phase | Scope | Status |
| --- | --- | --- |
| **P0 — Console plugin + marketplace** (this release) | Marketplace manifest, plugin manifest, `.mcp.json` (exact-pin, offline-first), 4 skills, 1 agent, SessionStart hook, `check-claude-plugin.mjs` CI gate, boundary/provenance registration | **Shipped** |
| **P1 — Live-mode ergonomics** | `userConfig.live_url` (prompted at enable time, substituted as `${user_config.live_url}`) so live mode needs no manual `.mcp.json` override; wrapper script that omits `--live` when unset | Proposed |
| **P2 — Fleet + kit lanes** | Additional marketplace entries: a worker-kit operator plugin (wrapping `growthub skills {list,validate}` + kit runbooks) and a fork-authority plugin; `plugins[]` is already an open array | Proposed |
| **P3 — Distribution hardening** | Release-channel entries (stable/latest git refs), `renames` migration map when plugins evolve, npm-source distribution if plugin cadence decouples from repo cadence | Proposed |
| **P4 — Protocol refresh** | Bump the server's MCP `protocolVersion` / capabilities as the spec advances — a **core-product** change (`cli/src/**`): Phase-A source edit + lockstep version bump + Phase-B dist rebuild lane, per `docs/AGENT_DIST_REBUILD_GUIDE.md` | Proposed |

Phases compound: P0 is complete and usable alone; P1–P4 are additive and
none may introduce a mutation tool.

## 5. Exact File Edits (P0, as landed)

New: `.claude-plugin/marketplace.json`; `claude-plugins/growthub-governed-console/**`
(manifest, `.mcp.json`, 4 skills, agent, hooks + script, README);
`scripts/check-claude-plugin.mjs`; this doc.
Edited: `scripts/check-monorepo-boundary.mjs` (+ `.claude-plugin`,
`claude-plugins` → scaffolding), `docs/MONOREPO_PROVENANCE_MAP_V1.md` §2
(same), `.github/workflows/ci.yml` (validator step), `AGENTS.md` +
`docs/SKILLS_MCP_DISCOVERY.md` (pointers).
**Untouched:** `cli/src/**`, `cli/dist/**`, `packages/**`, `server/**` — no
npm-shipped source changed, so no version bump (per `AGENTS.md`
§Version grounding).

## 6. Runtime Implications

None at execution-authority level. The plugin launches the already-published
CLI in its already-shipped read-only mode. `${CLAUDE_PROJECT_DIR}` is passed
as `--fork`, so the console reads the user's workspace artifact; live mode
remains an explicit opt-in. The SessionStart hook is offline, read-only
(file-existence test only), and silent outside a governed workspace.

## 7. Validation Requirements

- `node scripts/check-claude-plugin.mjs` — structural + **version lockstep**
  gate (plugin version == `.mcp.json` pin == `cli/package.json`), wired into
  `ci.yml` next to the other `check-*` gates. Release rule: **the lockstep
  bump is part of every CLI version bump** — same discipline as the
  `create-growthub-local` dependency pin.
- `claude plugin validate .` — official manifest validation (marketplace +
  plugin). Both passed at P0.
- Stdio smoke (run at P0): `initialize` → `tools/list` (14 tools) →
  `describe_workspace` (reads the starter kit workspace) → `preflight_patch`
  with a non-allowlisted key (correctly rejected with `allowlist.ok: false`,
  `mode: offline-approximation`).
- `node scripts/check-monorepo-boundary.mjs` — new top-level paths
  classified; no unclassified paths.
- **Real-install closed-loop QA** (run at P0 on Claude Code 2.1.204):
  `claude plugin marketplace add ./` → `claude plugin install
  growthub-governed-console@growthub` → `claude plugin details` shows the
  full component inventory (4 skills, 1 agent, 1 hook, 1 MCP server; ~745
  always-on tokens); the **published npm** server (`npx -y
  @growthub/cli@0.14.15 serve --mcp`) answered a 7-call battery against a
  standalone workspace (incl. `preflight_patch` rejecting the
  `workspaceSourceRecords` sidecar) with the config file hash unchanged
  (read-only proof); the installed hook emitted orientation inside a
  governed workspace, stayed silent (exit 0) outside one, and kept its
  executable bit through install; a headless `claude -p` session in that
  workspace received the hook context and successfully called
  `describe_workspace` through the plugin's MCP server.
- **Live-mode QA** (run at P0 against a booted export —
  `node scripts/export-seed-workspace.mjs`, `next dev` on :3777, published
  npm server with `--live`, one server process throughout):
  `describe_workspace` reported `source: live:http://127.0.0.1:3777`;
  `preflight_patch` on an exact `dataModel` rename body returned
  `mode: live-authoritative` with `authoritative.ok: true`; the agent then
  executed the governed hand-off itself (`PATCH /api/workspace` → HTTP 200);
  the **same server process** re-read the renamed object and an advanced
  `snapshotAt` (per-call rehydration — no restart, no stale snapshot); after
  killing the runtime the next read honestly reported
  `source: offline-fallback (http://127.0.0.1:3777 unreachable: fetch
  failed)`. The rename was restored through the same governed PATCH lane.
- **Negative/positive probe matrix** (run at P0; every probe left state
  intact, verified by re-read):
  - *Server negatives* — unknown tool → structured `-32603` error; missing /
    nonexistent `nodeId` → `{ error: "node not found" }`; malformed JSON-RPC
    line mid-stream → ignored, server keeps answering; `--fork` without a
    config → one honest error line, no crash loop.
  - *Boundary negatives (live runtime)* — unknown top-level key and
    full-config body → **400** + `allowed[]`; `secret` on a sandbox row →
    **422** + `violations[] = credential_field:…` with nothing persisted
    (positive control of the Law layer); preflight of an object removal →
    reported the exact removed node without writing.
  - *Scope finding* — the credential 422 is enforced only for the exact
    field set on **sandbox rows** (`workspace-patch-policy.js::CREDENTIAL_ROW_FIELDS`);
    a novel credential-ish field name on a non-sandbox object is accepted.
    The plugin's mutation card now states this scoping honestly; widening
    enforcement (or narrowing the `AGENTS.md` summary wording) is a
    workspace-kit decision outside this surface.
  - *Gate self-test* — `check-claude-plugin.mjs` fails (exit 1) on each
    seeded regression: version drift, non-executable hook script, skill
    frontmatter/slug mismatch, unpinned `npx @growthub/cli`; passes again on
    clean state.

## 8. Anti-Patterns (must not happen)

- **No mutation tool, ever** — a plugin component that writes workspace
  config or executes sandbox rows would be the forbidden third mutation
  path (`AGENTS.md` §Canonical workspace mutation boundary).
- **No unpinned server** — `npx @growthub/cli` without an exact version
  breaks the lockstep guarantee and lets the console drift from its skills.
- **No contract duplication** — plugin skills must keep deferring to the
  in-workspace mutation card and `docs/GOVERNED_MCP_CONSOLE_V1.md`; exact
  request/response shapes live there, not here.
- **No secrets surfaces** — tools expose `authStatus` only; `userConfig`
  (P1) may carry a local URL, never a credential.
- **No re-declaration of auto-discovered components** — standard-location
  files (`hooks/hooks.json`, `.mcp.json`, `skills/`, `agents/`) load
  automatically; listing them again in `plugin.json` fails the plugin load
  as a duplicate (observed on 2.1.204). Manifest component fields are for
  *non-standard* paths only.
- **No `metadata.pluginRoot` indirection** — install resolution on 2.1.204
  resolves entry `source` relative to the marketplace root regardless of
  `pluginRoot`; marketplace entries must carry the full relative path
  (`./claude-plugins/<plugin>`). Both regressions were caught by the
  real-install QA above, not by manifest validation — keep the closed loop
  in every release.
- **Do not confuse the three "plugin"/"marketplace" systems**: this Claude
  Code plugin surface (`claude-plugins/`), the in-workspace provider
  marketplace (`docs/MARKETPLACE_PROVIDER_PLAYBOOK_V1.md`), and the vendored
  Paperclip plugin runtime (`server/src/services/plugin-*`) are unrelated;
  never cross-wire them. Claude Desktop "connectors" are a fourth, separate
  ecosystem — packaging for it would be a new doc, not an extension of this
  one.
