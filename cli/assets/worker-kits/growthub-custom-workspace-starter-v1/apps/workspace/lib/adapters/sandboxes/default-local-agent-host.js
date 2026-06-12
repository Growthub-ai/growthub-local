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
const TELEMETRY_MARKER = "GROWTHUB_AGENT_TELEMETRY:";

/**
 * Browser provisioning — agnostic, deterministic, one per host.
 *
 * When the governed sandbox row has `browserAccess` on, every host receives a
 * working browser through the mechanism its CLI actually understands. The
 * lanes are:
 *
 *   native-argv         the host CLI has first-party browser flags; argv(request)
 *                       appends them (no file provisioning needed).
 *   mcp-config-flag     the host CLI accepts a one-shot MCP config flag; the
 *                       adapter writes a Playwright MCP browser-server config
 *                       into the sealed workdir and argv(request) points at it.
 *   project-mcp-config  the host CLI auto-loads project-scoped MCP config from
 *                       cwd; the adapter writes the host's config file into the
 *                       workdir before spawn (the child runs with cwd=workdir).
 *   mcp-convention      universal fallback — the adapter writes the standard
 *                       `.mcp.json` into the workdir for hosts without a
 *                       verified native lane.
 *
 * The browser server itself is host-agnostic: Playwright MCP via npx, no API
 * key, works on macOS / Windows / Linux. On top of whichever lane applies,
 * EVERY host also receives GROWTHUB_SANDBOX_BROWSER_ACCESS=1 plus the network
 * allow list, so browser tooling configured inside the host honors the row's
 * saved setting even when the lane is only the convention file.
 */
const BROWSER_MCP_SERVER = { command: "npx", args: ["-y", "@playwright/mcp@latest"] };
const BROWSER_MCP_CONFIG = { mcpServers: { browser: BROWSER_MCP_SERVER } };
const BROWSER_MCP_CONFIG_FILENAME = "growthub-browser-mcp.json";
const BROWSER_FALLBACK_PROVISION = Object.freeze({
  lane: "mcp-convention",
  files: [{ path: ".mcp.json", json: BROWSER_MCP_CONFIG }]
});

/**
 * Canonical Paperclip host catalog — slugs mirror `AGENT_ADAPTER_TYPES`.
 *
 * Each entry declares the binary the operator must have on PATH and how to
 * invoke it for one-shot prompt execution. `argv(request)` receives the sealed
 * RunRequest and returns the argv array the adapter should pass — hosts with
 * native capability flags (network sandbox mode, browser access) derive them
 * deterministically from the governed row's saved settings. `inputMode`
 * chooses whether the user's command is sent via stdin or as a positional
 * argument. `installHint` is surfaced verbatim when the binary is not found,
 * so operators get an actionable error. `browser` declares the host's
 * provisioning lane (see above); hosts without one fall back to the `.mcp.json`
 * convention so no host is ever silently browser-less.
 */
const HOST_CATALOG = {
  claude_local: {
    label: "Claude Code (local)",
    binary: "claude",
    argv: (request = {}) => {
      const args = ["-p", "--output-format", "text"];
      if (request.browserAccess) {
        args.push("--mcp-config", BROWSER_MCP_CONFIG_FILENAME, "--allowedTools", "mcp__browser__*");
      }
      return args;
    },
    browser: {
      lane: "mcp-config-flag",
      files: [{ path: BROWSER_MCP_CONFIG_FILENAME, json: BROWSER_MCP_CONFIG }]
    },
    inputMode: "stdin",
    installHint: "Install Claude Code: npm i -g @anthropic-ai/claude-code"
  },
  codex_local: {
    label: "Codex CLI (local)",
    binary: "codex",
    argv: (request = {}) => {
      const netOn = Boolean(request.networkAllow);
      const browserOn = Boolean(request.browserAccess);
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        netOn ? "workspace-write" : "read-only",
      ];
      if (browserOn) {
        args.push("--enable", "browser_use", "--enable", "in_app_browser");
      }
      args.push("-");
      return args;
    },
    browser: { lane: "native-argv", files: [] },
    inputMode: "stdin",
    installHint: "Install Codex CLI: npm i -g @openai/codex"
  },
  cursor: {
    label: "Cursor Agent (local)",
    binary: "cursor-agent",
    argv: () => ["--print"],
    browser: {
      lane: "project-mcp-config",
      files: [{ path: ".cursor/mcp.json", json: BROWSER_MCP_CONFIG }]
    },
    inputMode: "stdin",
    installHint: "Install Cursor Agent CLI: curl https://cursor.com/install -fsS | bash"
  },
  gemini_local: {
    label: "Gemini CLI (local)",
    binary: "gemini",
    argv: () => ["-p", "-"],
    browser: {
      lane: "project-mcp-config",
      files: [{ path: ".gemini/settings.json", json: BROWSER_MCP_CONFIG }]
    },
    inputMode: "stdin",
    installHint: "Install Gemini CLI: npm i -g @google/gemini-cli"
  },
  opencode_local: {
    label: "OpenCode (local)",
    binary: "opencode",
    argv: () => ["run", "--quiet"],
    browser: {
      lane: "project-mcp-config",
      files: [{
        path: "opencode.json",
        json: {
          $schema: "https://opencode.ai/config.json",
          mcp: { browser: { type: "local", command: [BROWSER_MCP_SERVER.command, ...BROWSER_MCP_SERVER.args], enabled: true } }
        }
      }]
    },
    inputMode: "stdin",
    installHint: "Install OpenCode: npm i -g opencode-ai"
  },
  pi_local: {
    label: "Pi (local)",
    binary: "pi",
    argv: () => ["run", "--stdin"],
    browser: BROWSER_FALLBACK_PROVISION,
    inputMode: "stdin",
    installHint: "Install Pi CLI: refer to your Paperclip Pi distribution"
  },
  qwen_local: {
    label: "Qwen Code (local)",
    binary: "qwen",
    argv: () => ["-p"],
    browser: {
      lane: "project-mcp-config",
      files: [{ path: ".qwen/settings.json", json: BROWSER_MCP_CONFIG }]
    },
    inputMode: "stdin",
    installHint: "Install Qwen Code CLI: refer to your Qwen distribution"
  },
  hermes_local: {
    label: "Hermes Paperclip (local)",
    binary: "hermes",
    argv: () => ["run", "--stdin"],
    browser: BROWSER_FALLBACK_PROVISION,
    inputMode: "stdin",
    installHint: "Install Hermes Paperclip adapter: npm i -g hermes-paperclip-adapter"
  },
  openclaw_gateway: {
    label: "OpenClaw Gateway (local)",
    binary: "openclaw",
    argv: () => ["gateway", "exec", "--stdin"],
    browser: BROWSER_FALLBACK_PROVISION,
    inputMode: "stdin",
    installHint: "Install OpenClaw Gateway: refer to your Paperclip distribution"
  }
};

/**
 * Provision browser capability into the sealed workdir for the selected host.
 * Pure file writes inside `workdir` only — never touches host-global config
 * (no ~/.claude, ~/.codex, ~/.gemini mutation), so the operator's own agent
 * setup is never modified. Returns audit metadata for adapterMeta.
 */
async function provisionBrowserAccess(host, request, workdir) {
  if (!request.browserAccess) return null;
  const spec = host.browser || BROWSER_FALLBACK_PROVISION;
  const provision = { lane: spec.lane, files: [], server: "playwright-mcp" };
  for (const file of spec.files || []) {
    const target = path.join(workdir, file.path);
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, JSON.stringify(file.json, null, 2), "utf8");
      provision.files.push(file.path);
    } catch (error) {
      provision.error = error?.message || `failed to write ${file.path}`;
    }
  }
  return provision;
}

const SUPPORTED_HOSTS = Object.keys(HOST_CATALOG);

function clampStream(buffer) {
  if (buffer.length <= MAX_OUTPUT_BYTES) return buffer.toString("utf8");
  const head = buffer.slice(0, MAX_OUTPUT_BYTES);
  return `${head.toString("utf8")}\n…\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]`;
}

function safeNonNegativeInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function pickFirstNumber(...values) {
  for (const value of values) {
    const n = safeNonNegativeInt(value);
    if (n != null) return n;
  }
  return null;
}

function sumNumbers(...values) {
  let total = 0;
  let seen = false;
  for (const value of values) {
    const n = safeNonNegativeInt(value);
    if (n == null) continue;
    total += n;
    seen = true;
  }
  return seen ? total : null;
}

function extractUsageFromObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { tokens: null, tools: null };
  const usage = (obj.usage && typeof obj.usage === "object" && !Array.isArray(obj.usage))
    ? obj.usage
    : (obj.token_usage && typeof obj.token_usage === "object" && !Array.isArray(obj.token_usage))
      ? obj.token_usage
      : (obj.metadata?.usage && typeof obj.metadata.usage === "object" && !Array.isArray(obj.metadata.usage))
        ? obj.metadata.usage
        : (obj.result?.usage && typeof obj.result.usage === "object" && !Array.isArray(obj.result.usage))
          ? obj.result.usage
          : null;
  const tokens = usage
    ? pickFirstNumber(
        usage.total_tokens,
        usage.totalTokens,
        usage.tokens,
        sumNumbers(usage.input_tokens, usage.output_tokens),
        sumNumbers(usage.prompt_tokens, usage.completion_tokens),
        sumNumbers(usage.inputTokens, usage.outputTokens),
      )
    : pickFirstNumber(obj.total_tokens, obj.totalTokens, obj.tokens);
  const toolArrays = [
    obj.tool_calls,
    obj.toolCalls,
    obj.toolInvocations,
    obj.message?.tool_calls,
    obj.choices?.[0]?.message?.tool_calls,
    obj.result?.tool_calls,
    obj.result?.toolCalls,
  ].filter(Array.isArray);
  const tools = pickFirstNumber(
    obj.tools,
    obj.tool_count,
    obj.toolCount,
    ...toolArrays.map((items) => items.length),
  );
  return { tokens, tools };
}

function mergeTelemetry(base, next) {
  return {
    tokens: base.tokens ?? next.tokens ?? null,
    tools: base.tools ?? next.tools ?? null,
  };
}

function parseJsonMaybe(text) {
  const value = String(text || "").trim();
  if (!value || !/^[\[{]/.test(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractMarkedTelemetry(text) {
  let out = { tokens: null, tools: null };
  for (const line of String(text || "").split(/\r?\n/)) {
    const idx = line.indexOf(TELEMETRY_MARKER);
    if (idx === -1) continue;
    const json = line.slice(idx + TELEMETRY_MARKER.length).trim();
    const parsed = parseJsonMaybe(json);
    out = mergeTelemetry(out, extractUsageFromObject(parsed));
  }
  return out;
}

function extractJsonLineTelemetry(text) {
  let out = { tokens: null, tools: null };
  for (const line of String(text || "").split(/\r?\n/)) {
    const parsed = parseJsonMaybe(line);
    if (!parsed) continue;
    out = mergeTelemetry(out, extractUsageFromObject(parsed));
  }
  return out;
}

function extractStderrTextTelemetry(stderrText) {
  const text = String(stderrText || "");
  const total = text.match(/\b(?:total\s+tokens|tokens\s+used)\s*(?:[:=]|\r?\n)\s*([0-9][0-9,]*)/i);
  const input = text.match(/\b(?:input|prompt)\s+tokens\s*[:=]\s*([0-9][0-9,]*)/i);
  const output = text.match(/\b(?:output|completion)\s+tokens\s*[:=]\s*([0-9][0-9,]*)/i);
  const tools = text.match(/\b(?:tool\s+calls?|tools\s+used)\s*[:=]\s*([0-9][0-9,]*)/i);
  const tokens = pickFirstNumber(total?.[1]?.replace(/,/g, ""), sumNumbers(input?.[1]?.replace(/,/g, ""), output?.[1]?.replace(/,/g, "")));
  return {
    tokens,
    tools: pickFirstNumber(tools?.[1]?.replace(/,/g, ""), tokens != null ? 0 : null),
  };
}

function extractAgentHostTelemetry({ stdout, stderr }) {
  let out = { tokens: null, tools: null };
  const stdoutJson = parseJsonMaybe(stdout);
  if (stdoutJson && !Array.isArray(stdoutJson)) out = mergeTelemetry(out, extractUsageFromObject(stdoutJson));
  out = mergeTelemetry(out, extractMarkedTelemetry(stderr));
  out = mergeTelemetry(out, extractJsonLineTelemetry(stderr));
  out = mergeTelemetry(out, extractStderrTextTelemetry(stderr));
  return out;
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

  const browserProvision = await provisionBrowserAccess(host, request, workdir);

  const env = {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || workdir,
    TMPDIR: workdir,
    GROWTHUB_SANDBOX: "1",
    GROWTHUB_SANDBOX_RUN_ID: request.runId || "",
    GROWTHUB_SANDBOX_AGENT_HOST: hostSlug,
    GROWTHUB_SANDBOX_NET_ALLOW: request.networkAllow ? "1" : "0",
    GROWTHUB_SANDBOX_NET_ALLOWLIST: Array.isArray(request.allowList) ? request.allowList.join(",") : "",
    GROWTHUB_SANDBOX_BROWSER_ACCESS: request.browserAccess ? "1" : "0",
    ...(request.env || {})
  };

  const timeoutMs = Number.isFinite(request.timeoutMs) && request.timeoutMs > 0 ? request.timeoutMs : 60000;
  const startedAt = Date.now();
  const argv = host.argv(request);

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
      const stdoutText = clampStream(stdout);
      const stderrText = clampStream(stderr);
      const telemetry = extractAgentHostTelemetry({ stdout: stdoutText, stderr: stderrText });
      resolve({
        ok,
        exitCode: typeof exitCode === "number" ? exitCode : null,
        durationMs,
        stdout: stdoutText,
        stderr: stderrText,
        error: timedOut
          ? `timed out after ${timeoutMs}ms`
          : (ok ? undefined : `exit ${exitCode ?? signal ?? "unknown"}`),
        adapterMeta: {
          adapter: "local-agent-host",
          agentHost: hostSlug,
          binary: host.binary,
          argv,
          inputMode: host.inputMode,
          browserAccess: Boolean(request.browserAccess),
          browserProvision,
          timedOut,
          signal: signal || null,
          tokens: telemetry.tokens,
          tools: telemetry.tools,
          telemetrySource: telemetry.tokens != null || telemetry.tools != null ? "agent-host-reported" : "unreported"
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

export {
  BROWSER_MCP_CONFIG,
  BROWSER_MCP_CONFIG_FILENAME,
  HOST_CATALOG,
  SUPPORTED_HOSTS,
  extractAgentHostTelemetry,
  provisionBrowserAccess
};
