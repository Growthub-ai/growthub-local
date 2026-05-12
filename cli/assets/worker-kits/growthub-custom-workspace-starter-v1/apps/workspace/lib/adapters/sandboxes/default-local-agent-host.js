/**
 * Default sandbox adapter — local-agent-host (Paperclip thin local adapter).
 *
 * Routes a sandbox-environment row through whichever local agent host CLI the
 * user has on PATH on their machine — Claude Code, Codex, Cursor, Gemini,
 * OpenCode, Pi, Qwen, Hermes, OpenClaw Gateway. The host slugs mirror the
 * canonical `AGENT_ADAPTER_TYPES` enum in `packages/shared/src/constants.ts`,
 * so a sandbox configured here is portable to the upstream Paperclip server
 * adapter registry without translation.
 *
 * The standalone `growthub-custom-workspace-starter-v1` ships without any
 * @paperclipai/adapter-* workspace package import (it's a portable Next.js
 * app that runs on a fresh user machine). Instead this adapter spawns the
 * host CLI binary directly with the user's command. Cross-platform: works on
 * macOS, Windows, and Linux as long as the host CLI is installed.
 *
 * The adapter is intentionally thin:
 *   - it does NOT manage the host's auth state, model selection, or context window
 *   - it does NOT mutate any host config file
 *   - it does NOT route through the upstream Paperclip server (use the
 *     hosted bridge for that)
 *   - it ONLY captures stdout/stderr/exit code and returns a standard RunResult
 *
 * The catalog below maps each canonical host slug to the binary the operator
 * is expected to have on PATH. Forks extend this by dropping a sibling file
 * under `lib/adapters/sandboxes/adapters/` that calls
 * `registerSandboxAdapter()` with their own dispatch logic — this default
 * adapter does not need to know about every possible host.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { registerSandboxAdapter } from "./sandbox-adapter-registry.js";

const MAX_OUTPUT_BYTES = 1024 * 256;

/**
 * Canonical Paperclip host catalog — slugs mirror `AGENT_ADAPTER_TYPES`.
 *
 * Each entry declares the binary the operator must have on PATH and how to
 * invoke it for one-shot prompt execution. `argv` returns the argv array the
 * adapter should pass; `inputMode` chooses whether the user's command is sent
 * via stdin or as a positional argument. `installHint` is surfaced verbatim
 * when the binary is not found, so operators get an actionable error.
 */
const HOST_CATALOG = {
  claude_local: {
    label: "Claude Code (local)",
    binary: "claude",
    argv: () => ["-p", "--output-format", "text"],
    inputMode: "stdin",
    installHint: "Install Claude Code: npm i -g @anthropic-ai/claude-code"
  },
  codex_local: {
    label: "Codex CLI (local)",
    binary: "codex",
    argv: () => ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "-"],
    inputMode: "stdin",
    installHint: "Install Codex CLI: npm i -g @openai/codex"
  },
  cursor: {
    label: "Cursor Agent (local)",
    binary: "cursor-agent",
    argv: () => ["--print"],
    inputMode: "stdin",
    installHint: "Install Cursor Agent CLI: curl https://cursor.com/install -fsS | bash"
  },
  gemini_local: {
    label: "Gemini CLI (local)",
    binary: "gemini",
    argv: () => ["-p", "-"],
    inputMode: "stdin",
    installHint: "Install Gemini CLI: npm i -g @google/gemini-cli"
  },
  opencode_local: {
    label: "OpenCode (local)",
    binary: "opencode",
    argv: () => ["run", "--quiet"],
    inputMode: "stdin",
    installHint: "Install OpenCode: npm i -g opencode-ai"
  },
  pi_local: {
    label: "Pi (local)",
    binary: "pi",
    argv: () => ["run", "--stdin"],
    inputMode: "stdin",
    installHint: "Install Pi CLI: refer to your Paperclip Pi distribution"
  },
  qwen_local: {
    label: "Qwen Code (local)",
    binary: "qwen",
    argv: () => ["-p"],
    inputMode: "stdin",
    installHint: "Install Qwen Code CLI: refer to your Qwen distribution"
  },
  hermes_local: {
    label: "Hermes Paperclip (local)",
    binary: "hermes",
    argv: () => ["run", "--stdin"],
    inputMode: "stdin",
    installHint: "Install Hermes Paperclip adapter: npm i -g hermes-paperclip-adapter"
  },
  openclaw_gateway: {
    label: "OpenClaw Gateway (local)",
    binary: "openclaw",
    argv: () => ["gateway", "exec", "--stdin"],
    inputMode: "stdin",
    installHint: "Install OpenClaw Gateway: refer to your Paperclip distribution"
  }
};

const SUPPORTED_HOSTS = Object.keys(HOST_CATALOG);

function clampStream(buffer) {
  if (buffer.length <= MAX_OUTPUT_BYTES) return buffer.toString("utf8");
  const head = buffer.slice(0, MAX_OUTPUT_BYTES);
  return `${head.toString("utf8")}\n…\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]`;
}

async function run(request) {
  const hostSlug = typeof request.agentHost === "string" ? request.agentHost.trim() : "";
  const host = HOST_CATALOG[hostSlug];
  if (!host) {
    return {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `agentHost is required for local-agent-host adapter; pick one of ${SUPPORTED_HOSTS.join(", ")}`,
      adapterMeta: { adapter: "local-agent-host" }
    };
  }

  const command = typeof request.command === "string" ? request.command : "";
  const workdir = request.workdir;
  if (typeof workdir !== "string" || !workdir) {
    return {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "workdir is required",
      adapterMeta: { adapter: "local-agent-host", agentHost: hostSlug }
    };
  }

  const promptPath = path.join(workdir, "prompt.txt");
  try {
    await fs.writeFile(promptPath, command, "utf8");
  } catch {
    // Best-effort audit copy of the prompt — execution still continues
  }

  const env = {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || workdir,
    TMPDIR: workdir,
    GROWTHUB_SANDBOX: "1",
    GROWTHUB_SANDBOX_RUN_ID: request.runId || "",
    GROWTHUB_SANDBOX_AGENT_HOST: hostSlug,
    GROWTHUB_SANDBOX_NET_ALLOW: request.networkAllow ? "1" : "0",
    GROWTHUB_SANDBOX_NET_ALLOWLIST: Array.isArray(request.allowList) ? request.allowList.join(",") : "",
    ...(request.env || {})
  };

  const timeoutMs = Number.isFinite(request.timeoutMs) && request.timeoutMs > 0 ? request.timeoutMs : 60000;
  const startedAt = Date.now();
  const argv = host.argv(command);

  return await new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let resolved = false;

    let child;
    try {
      child = spawn(host.binary, argv, {
        cwd: workdir,
        env,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (error) {
      resolve({
        ok: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: "",
        error: error?.message || `failed to spawn ${host.binary}`,
        adapterMeta: { adapter: "local-agent-host", agentHost: hostSlug, binary: host.binary, installHint: host.installHint }
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch {}
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr = Buffer.concat([stderr, chunk]);
    });

    child.on("error", (error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const notFound = error?.code === "ENOENT";
      resolve({
        ok: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdout: clampStream(stdout),
        stderr: clampStream(stderr),
        error: notFound
          ? `${host.binary} not found on PATH. ${host.installHint}`
          : (error?.message || "spawn failed"),
        adapterMeta: {
          adapter: "local-agent-host",
          agentHost: hostSlug,
          binary: host.binary,
          installHint: host.installHint,
          notFound
        }
      });
    });

    child.on("close", (exitCode, signal) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const ok = !timedOut && exitCode === 0;
      resolve({
        ok,
        exitCode: typeof exitCode === "number" ? exitCode : null,
        durationMs,
        stdout: clampStream(stdout),
        stderr: clampStream(stderr),
        error: timedOut
          ? `timed out after ${timeoutMs}ms`
          : (ok ? undefined : `exit ${exitCode ?? signal ?? "unknown"}`),
        adapterMeta: {
          adapter: "local-agent-host",
          agentHost: hostSlug,
          binary: host.binary,
          argv,
          inputMode: host.inputMode,
          timedOut,
          signal: signal || null
        }
      });
    });

    if (host.inputMode === "stdin") {
      try {
        child.stdin.write(command);
      } catch {
        // child may have already exited via spawn error — ignore
      }
      try { child.stdin.end(); } catch {}
    }
  });
}

registerSandboxAdapter({
  id: "local-agent-host",
  label: "Local agent host (Paperclip thin adapter)",
  description: "Spawns a local agent host CLI on the operator's machine — Claude Code, Codex, Cursor, Gemini, OpenCode, Pi, Qwen, Hermes, OpenClaw Gateway. Cross-platform (macOS / Windows / Linux). Slugs mirror Paperclip AGENT_ADAPTER_TYPES so the row is portable to the upstream server adapter registry.",
  locality: "local",
  supportedRuntimes: ["bash", "node", "python"],
  supportedHosts: SUPPORTED_HOSTS,
  hostCatalog: HOST_CATALOG,
  run
});

export { HOST_CATALOG, SUPPORTED_HOSTS };
