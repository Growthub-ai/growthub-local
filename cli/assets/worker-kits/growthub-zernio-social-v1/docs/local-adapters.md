# Local Adapters — IDE Matrix

This kit is **IDE-agnostic by design**. The agent entrypoint (`workers/zernio-social-operator/CLAUDE.md`) is plain Markdown, the runtime calls Zernio's hosted REST API via Node's built-in `fetch()`, and no module inside the kit depends on any particular IDE's SDK.

That means you can drive the operator from any local coding agent that supports either:

1. A **Working Directory** config field (the canonical growthub-local primitive — see `docs/WORKER_KITS.md` at the repo root for details), or
2. An **MCP server** config (for IDEs that speak the Model Context Protocol)

---

## Why no "new adapter" for this kit

- **Zernio is hosted SaaS.** There is no self-hostable Zernio component, so a local adapter on the Zernio side would just wrap `fetch()`.
- The `@paperclipai/adapter-*` packages registered in `server/src/adapters/registry.ts` implement the `ServerAdapterModule` interface — they are **agent executors** (Claude / Codex / Cursor / Gemini / OpenCode / Pi / Hermes), not downstream REST API wrappers. Adding Zernio to that registry would be a category error.
- Zernio itself ships an official **MCP server** (bundled inside the `zernio-python` SDK: `pip install zernio-sdk[mcp]`) and a **Claude Code skill** (`npx clawhub@latest install zernio-api`). Both are complementary, not required.

The result: this kit runs as-is under every local IDE listed below.

---

## Adapter Matrix

| IDE / Adapter | Integration path | How to set up |
|---|---|---|
| **Claude Code** (CLI) | Working Directory + slash-command conventions | Point `--working-dir` at the exported kit folder; open the session and talk to `zernio-social-operator`. |
| **Claude Desktop** | MCP server | Add Zernio's MCP server block (see `setup/install-mcp.mjs` for the JSON) to `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows). |
| **Codex** (OpenAI) | Working Directory | Point Codex at the exported kit folder. The operator law in `CLAUDE.md` works identically under Codex's reading model. |
| **Cursor** | Working Directory + optional MCP | Open the exported folder as the Cursor workspace. Optionally add Zernio's MCP server to Cursor's MCP config (`~/.cursor/mcp.json`). |
| **Gemini CLI** | Working Directory | Point Gemini at the exported kit folder. |
| **OpenCode** | Working Directory | Point OpenCode at the exported kit folder. |
| **Qwen Code CLI** | Working Directory | Point Qwen at the exported kit folder. |
| **Open Agents** | Working Directory + durable runs | Wire the kit folder as the agent's workspace; `/zernio` flows map to Open Agents' prompt-session model. |
| **Any MCP-compatible IDE** | MCP server | Use `setup/install-mcp.mjs` to print the Zernio MCP server config JSON; drop it into your IDE's MCP config file. |

---

## The Three Integration Layers (in order of simplicity)

### Layer 1 — Working Directory only (always works, zero extra install)

```
growthub kit download growthub-zernio-social-v1
# ⇒ ~/paperclip/kits/exports/growthub-agent-worker-kit-zernio-social-v1/

# Mac / Linux
open ~/paperclip/kits/exports/growthub-agent-worker-kit-zernio-social-v1
# Windows PowerShell
start $HOME\paperclip\kits\exports\growthub-agent-worker-kit-zernio-social-v1
```

Then:

1. Open your IDE (Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen)
2. Point the Working Directory at that folder
3. Tell the operator: *"Plan a 30-day Instagram + LinkedIn campaign for [brand]"*

That's it. The 10-step workflow in `workers/zernio-social-operator/CLAUDE.md` runs regardless of which IDE is reading it.

### Layer 2 — Zernio's official MCP server (opt-in, one-time install)

When your IDE supports MCP (Claude Desktop, Cursor, any MCP-compatible client), plug in Zernio's own MCP server so the agent can call Zernio endpoints directly as tool calls instead of curl.

```bash
# Python runtime needed
pip install zernio-sdk[mcp]

# Print the per-IDE MCP config JSON:
node setup/install-mcp.mjs
```

The installer prints copy-paste blocks for:

- Claude Desktop (`claude_desktop_config.json`)
- Claude Code (`~/.claude/mcp.json`)
- Cursor (`~/.cursor/mcp.json`)
- Generic `servers.mcp` JSON (other MCP-compatible IDEs)

Then the agent's Zernio API calls can go through MCP tool invocations in addition to — or instead of — raw HTTP fetch. Either path produces the same manifest-submission result.

### Layer 3 — Zernio's Claude Code skill (Claude Code only, optional)

For Claude Code users who want Zernio's API surface taught as a first-class Claude skill:

```bash
npx clawhub@latest install zernio-api
```

This installs Zernio's official Claude Code skill (docs + examples) alongside this kit. The skill teaches Claude the API shape; this kit provides the operator law, templates, and output contract. They complement each other.

---

## Which layer should you use?

| If you want... | Use |
|---|---|
| Simplest possible setup; agent-only mode included | Layer 1 (Working Directory) |
| Typed tool calls from the agent to Zernio | Layer 1 + Layer 2 (MCP) |
| First-class Zernio knowledge baked into Claude Code | Layer 1 + Layer 3 (Claude Code skill) |
| Growthub Agentic Social Media Platform UI shell | See `docs/growthub-agentic-social-platform-ui-shell.md` |

All four paths work from the same kit folder. You can layer them — they are strictly additive.

---

## What the kit does NOT do

- Does **not** ship any Zernio SDK (Node, Python, Go, Ruby, Java, PHP, .NET, Rust). The agent uses raw REST via `fetch()` so nothing is installed transitively.
- Does **not** register a new entry in `server/src/adapters/registry.ts` or `cli/src/adapters/registry.ts`. Those registries implement the `ServerAdapterModule` / `CLIAdapterModule` contracts for agent executors; Zernio is a REST API, not an executor.
- Does **not** fork the externally-maintained `@paperclipai/adapter-claude-local` / `adapter-codex-local` / `adapter-cursor-local` / `adapter-gemini-local` / `adapter-opencode-local` / `adapter-pi-local` / `hermes-paperclip-adapter` packages. They remain untouched.
- Does **not** add a new entry to the `Agent Harness` discovery menu. This kit is a Worker Kit, not a harness.

This keeps the diff surface minimal and the kit strictly reusable across every local IDE already supported by growthub-local.

---

## See also

- `../QUICKSTART.md` — one-command setup + per-OS notes
- `../setup/setup.mjs` — cross-platform bootstrap
- `../setup/install-mcp.mjs` — per-IDE MCP config printer
- `./zernio-api-integration.md` — Zernio REST contract
- `./growthub-agentic-social-platform-ui-shell.md` — exported-workspace UI shell guide
