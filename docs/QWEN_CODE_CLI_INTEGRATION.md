# Qwen Code CLI Integration

Architecture and integration guide for the Qwen Code CLI agent harness adapter in Growthub Local.

## What is Qwen Code

[Qwen Code](https://github.com/QwenLM/qwen-code) is an open-source terminal AI coding agent published as `@qwen-code/qwen-code` on npm. It provides an interactive terminal UI backed by LLM-driven tool use and agentic workflows, similar to Claude Code or Gemini CLI.

Key capabilities:

- Interactive terminal UI (React/Ink based)
- Headless mode (`qwen -p "prompt"`) for scripting and CI
- Built-in tools: shell, read, write, edit, grep, glob, web fetch, sub-agents
- MCP server support for tool extensibility
- Multi-provider auth: DashScope, OpenAI, Anthropic, Google
- Permission system with deny/ask/allow tiers
- Docker/Podman sandbox support

## Integration strategy

The Growthub integration is **fully self-contained** with zero npm dependency on `@qwen-code/*`. Communication is through process spawn of the `qwen` binary.

```
Growthub CLI
  ├── Discovery Hub → "Qwen Code CLI" menu option
  │     ├── Setup & Health     (binary detection, env check)
  │     ├── Headless Prompt    (qwen -p "prompt")
  │     ├── Interactive Session (qwen with inherited stdio)
  │     └── Configure          (model, approval mode, binary path)
  │
  ├── CLI Commands
  │     ├── growthub qwen-code health
  │     ├── growthub qwen-code prompt "..."
  │     └── growthub qwen-code session [--yolo]
  │
  └── Server Adapter (qwen_local)
        ├── execute()          (headless prompt via child process)
        └── testEnvironment()  (binary + API key checks)
```

## File layout

### CLI runtime module

```
cli/src/runtime/qwen-code/
  ├── contract.ts    — QwenCodeConfig, environment status, execution result types
  ├── provider.ts    — Process spawn: headless prompt, interactive session, version detection
  ├── health.ts      — Environment detection, health assessment, setup guidance
  └── index.ts       — Barrel exports, config persistence (read/write)
```

### CLI command surface

```
cli/src/commands/qwen-code.ts
  ├── runQwenCodeHub()              — Interactive sub-hub (discovery menu)
  ├── runConfigureFlow()            — Model/mode/binary configuration
  └── registerQwenCodeCommands()    — Commander registration
```

### CLI adapter (heartbeat stream formatting)

```
cli/src/adapters/qwen/
  ├── format-event.ts   — stdout line formatter for heartbeat stream display
  └── index.ts          — CLIAdapterModule registration (type: qwen_local)
```

### Server adapter (agent execution)

```
server/src/adapters/qwen/
  ├── execute.ts    — Headless prompt execution via runChildProcess()
  ├── test.ts       — Environment test (binary, cwd, API key checks)
  └── index.ts      — ServerAdapterModule (type: qwen_local)
```

### Shared type registration

```
packages/shared/src/constants.ts
  └── AGENT_ADAPTER_TYPES — includes "qwen_local"
```

## Configuration

Config is persisted at `$PAPERCLIP_HOME/qwen-code/config.json`:

```json
{
  "binaryPath": "qwen",
  "defaultModel": "qwen3-coder",
  "cwd": "/path/to/project",
  "approvalMode": "default",
  "maxSessionTurns": 0,
  "timeoutMs": 120000,
  "env": {}
}
```

### Approval modes

| Mode | Behavior |
|---|---|
| `default` | Write tools need approval |
| `auto-edit` | File edits auto-approved, other writes need approval |
| `yolo` | Everything auto-approved |

### Environment variables

Qwen Code supports multiple provider backends. Set one of:

- `DASHSCOPE_API_KEY` — DashScope / Qwen native
- `OPENAI_API_KEY` — OpenAI-compatible endpoints
- `ANTHROPIC_API_KEY` — Anthropic
- `GOOGLE_API_KEY` — Google GenAI

## Server adapter configuration

When creating an agent with `adapterType: "qwen_local"`, the `adapterConfig` accepts:

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `prompt` | string | yes | — | Task prompt |
| `model` | string | no | `qwen3-coder` | Model identifier |
| `cwd` | string | no | `process.cwd()` | Working directory |
| `approvalMode` | string | no | `default` | Permission mode |
| `binaryPath` | string | no | `qwen` | Path to binary |
| `timeoutSec` | number | no | `120` | Execution timeout |
| `graceSec` | number | no | `15` | SIGTERM grace window |
| `env` | object | no | `{}` | Extra env vars |

## Prerequisites

- Node.js >= 20.0.0
- Qwen Code CLI installed globally: `npm install -g @qwen-code/qwen-code@latest`
- At least one provider API key configured

## Validation

```bash
# Health check
growthub qwen-code health

# Preview via demo-cli
zsh scripts/demo-cli.sh interactive  →  select "Qwen Code CLI Preview"
zsh scripts/demo-cli.sh cli discover →  select "Qwen Code CLI"

# Direct headless test
growthub qwen-code prompt "What files are in the current directory?"
```
