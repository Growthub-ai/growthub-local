---
name: growthub-t3code-harness
description: Run the T3 Code CLI agent harness — health, headless prompts, interactive session, and the generic Growthub profile primitive. Use when the user asks to run a T3 Code prompt, start a T3 session, check T3 health, or manage the T3 harness profile.
triggers:
  - t3 code
  - t3code
  - t3 harness
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Harness profile resolved via agent-harness/harness-profile primitive.
    - Health check passes before interactive session.
    - Prompt + session flows never leak harness credentials to stdout.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers: []
subSkills: []
mcpTools: []
---

# Growthub T3 Code Harness

Source of truth: `cli/src/commands/t3code.ts`, `cli/src/runtime/t3code/`, `cli/src/runtime/agent-harness/harness-profile.ts`.

Shipped in: commit `2e49ad5` (T3 Code CLI harness + generic Growthub profile primitive) and bumped to CLI v0.7.1.

## Mental model

T3 Code is a local agent harness registered inside Growthub's Agent Harness filter alongside Paperclip Local App, Open Agents, and Qwen Code. The harness exposes four capabilities via subcommands: `health`, `prompt`, `session`, and a generic `profile` primitive wired via `registerHarnessProfileCommands`.

Profile storage: `~/.paperclip/t3code/growthub-profile.json` (mode `0600`). Override `PAPERCLIP_HOME` to relocate.

## Command surface — `growthub t3code`

| Command | Purpose |
|---|---|
| `growthub t3code` | Default: interactive T3 Code hub (`runT3CodeHub`) |
| `growthub t3code health` | Check environment, binary readiness, and setup guidance |
| `growthub t3code prompt "<prompt>" [flags]` | Run a headless T3 Code prompt and print output |
| `growthub t3code session [flags]` | Launch an interactive T3 terminal session |
| `growthub t3code profile <sub>` | Generic Growthub profile primitive (read/write/rotate/etc.) |

### `prompt` flags

| Flag | Purpose |
|---|---|
| `--model <model>` | Model override |
| `--yolo` | Auto-approve all tool calls |
| `--timeout-ms <ms>` | Execution timeout |
| `--cwd <path>` | Working directory |

Exit code 124 on timeout. `stdout` / `stderr` forwarded.

### `session` flags

`--model <model>`, `--yolo`, `--cwd <path>`.

## Environment resolution

Use the first available entrypoint (`REPO` = repo root):

1. `growthub t3code …`
2. `node "$REPO/cli/dist/index.js" t3code …`
3. `bash "$REPO/scripts/demo-cli.sh" cli -- t3code …`

## Health check (always do this first)

```bash
growthub t3code health
```

Output shows:

- status (`ok`, `needs-setup`, `missing`)
- detected environment (binary path, env vars)
- guidance lines (ordered remediation steps)

If status is not `ok`, follow the guidance lines before running `prompt` or `session`.

## Headless prompt example

```bash
growthub t3code prompt "Summarize the diff in this repo under 100 words" \
  --model <model-id> \
  --timeout-ms 60000 \
  --cwd "$REPO"
```

Use `--yolo` only when you accept auto-approved tool execution — never for destructive ops on shared state.

## Interactive session

```bash
growthub t3code session --cwd "$REPO"
```

Opens a terminal session bound to the harness. Exit propagates the session's exit code.

## Profile primitive — `growthub t3code profile`

Wired via `registerHarnessProfileCommands(t3code, T3_HARNESS_ID, T3_HARNESS_LABEL)`. The same primitive is reusable across other harnesses (Paperclip, Open Agents, Qwen Code) — behavior and storage layout are identical.

Typical subcommands (consult `harness-profile.ts` for the authoritative list):

- `profile show` — read current profile
- `profile set <key> <value>` — write a scalar
- `profile import <path>` — import from JSON file
- `profile export [<path>]` — export to JSON file
- `profile rotate` — rotate secret material
- `profile clear` — remove the profile file

Profile file is `0600`. Never commit it.

## Non-negotiable rules

1. Run `health` before `prompt` or `session` — do not skip guidance steps.
2. Never pass secrets in prompt text; use the profile primitive for persistent credentials.
3. Do not invoke T3 Code outside its harness — always go through `growthub t3code` so telemetry, profile, and environment resolution stay consistent.
4. Respect `PAPERCLIP_HOME` overrides. Do not write profiles to the system `$HOME` if the env var is set.
5. Do not `--yolo` destructive operations. Reserve yolo for read-only or trivially reversible work.

## Success criteria

T3 Code work is complete when:

1. `health` reports `ok` (or the operator has acknowledged setup gaps).
2. `prompt` exits `0` or the session closes cleanly.
3. If a profile was modified, `profile show` reflects the change and file mode is `0600`.
4. Telemetry event `skill_completed` is emitted with safe properties only.

## Anti-patterns

- Do not parallelize multiple `session` launches against the same profile.
- Do not hand-edit the profile JSON — use the profile subcommands.
- Do not run T3 Code against `/` or another working directory that contains unrelated user data.
