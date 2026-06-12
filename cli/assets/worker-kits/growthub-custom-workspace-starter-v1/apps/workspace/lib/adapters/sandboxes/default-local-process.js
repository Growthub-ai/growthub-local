/**
 * Default sandbox adapter — local-process.
 *
 * Thin agnostic execution surface. For each invocation:
 *   1. The sandbox-run route mints a fresh /tmp/growthub-sandbox-<runId>/ workdir
 *      and resolves env refs server-side (browser never sees secrets).
 *   2. This adapter writes the user-supplied command to a runtime-specific
 *      entry file inside the workdir, then spawns the appropriate interpreter
 *      with strict timeout + captured stdio.
 *   3. After the child exits (or is killed for timeout), the route cleans the
 *      workdir and persists a versioned record into
 *      `growthub.source-records.json` keyed by sandbox sourceId.
 *
 * The adapter intentionally does NOT:
 *   - read or write outside the supplied workdir
 *   - persist state across runs
 *   - expand env refs (the route already resolved them)
 *   - log secret values, even on stderr (only stream the child's own stderr)
 *   - enforce OS-level network isolation (the operator runtime owns that;
 *     this adapter simply forwards `networkAllow` + `allowList` into
 *     adapterMeta and into a `GROWTHUB_SANDBOX_NET_ALLOW`/`_ALLOWLIST` env
 *     pair the user's script can consult.)
 *
 * Forks that need a hardened isolation primitive (firejail, gVisor, Docker,
 * Fly Machines, e2b, modal.com, etc.) ship a sibling adapter file under
 * `lib/adapters/sandboxes/adapters/` and call `registerSandboxAdapter()`.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { registerSandboxAdapter } from "./sandbox-adapter-registry.js";

const ENTRY_FILE_BY_RUNTIME = {
  python: "entry.py",
  node: "entry.js",
  bash: "entry.sh"
};

const INTERPRETER_BY_RUNTIME = {
  python: { command: "python3", argv: (entry) => [entry] },
  node: { command: "node", argv: (entry) => [entry] },
  bash: { command: "bash", argv: (entry) => [entry] }
};

const MAX_OUTPUT_BYTES = 1024 * 256; // 256 KiB per stream — enough for diagnostics, prevents runaway capture

function clampStream(buffer) {
  if (buffer.length <= MAX_OUTPUT_BYTES) return buffer.toString("utf8");
  const head = buffer.slice(0, MAX_OUTPUT_BYTES);
  return `${head.toString("utf8")}\n…\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]`;
}

async function run(request) {
  const runtime = request?.runtime;
  const interpreter = INTERPRETER_BY_RUNTIME[runtime];
  const entryName = ENTRY_FILE_BY_RUNTIME[runtime];
  if (!interpreter || !entryName) {
    return {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `unsupported runtime: ${String(runtime)}`,
      adapterMeta: { adapter: "local-process" }
    };
  }

  const workdir = request.workdir;
  if (typeof workdir !== "string" || !workdir) {
    return {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "workdir is required",
      adapterMeta: { adapter: "local-process" }
    };
  }

  const entryPath = path.join(workdir, entryName);
  const command = typeof request.command === "string" ? request.command : "";

  try {
    await fs.writeFile(entryPath, command, "utf8");
    if (runtime === "bash") {
      await fs.chmod(entryPath, 0o700);
    }
  } catch (error) {
    return {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `failed to write entry file: ${error.message || "unknown"}`,
      adapterMeta: { adapter: "local-process" }
    };
  }

  const env = {
    PATH: process.env.PATH || "",
    HOME: workdir,
    TMPDIR: workdir,
    GROWTHUB_SANDBOX: "1",
    GROWTHUB_SANDBOX_RUN_ID: request.runId || "",
    GROWTHUB_SANDBOX_NET_ALLOW: request.networkAllow ? "1" : "0",
    GROWTHUB_SANDBOX_NET_ALLOWLIST: Array.isArray(request.allowList) ? request.allowList.join(",") : "",
    GROWTHUB_SANDBOX_BROWSER_ACCESS: request.browserAccess ? "1" : "0",
    ...(request.env || {})
  };

  const timeoutMs = Number.isFinite(request.timeoutMs) && request.timeoutMs > 0 ? request.timeoutMs : 60000;
  const startedAt = Date.now();

  return await new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let resolved = false;

    const child = spawn(interpreter.command, interpreter.argv(entryPath), {
      cwd: workdir,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

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
      resolve({
        ok: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdout: clampStream(stdout),
        stderr: clampStream(stderr),
        error: error.code === "ENOENT"
          ? `interpreter not found: ${interpreter.command} (install ${runtime} runtime on the host)`
          : error.message || "spawn failed",
        adapterMeta: { adapter: "local-process", runtime, timedOut: false }
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
          adapter: "local-process",
          runtime,
          interpreter: interpreter.command,
          timedOut,
          signal: signal || null,
          networkAllow: Boolean(request.networkAllow),
          allowList: Array.isArray(request.allowList) ? request.allowList : [],
          browserAccess: Boolean(request.browserAccess)
        }
      });
    });
  });
}

registerSandboxAdapter({
  id: "local-process",
  label: "Local process (default)",
  description: "Spawns python3/node/bash inside an isolated /tmp/growthub-sandbox-* workdir with timeout + captured stdio. Operator runtime is responsible for OS-level network isolation; allow list is published to the script via GROWTHUB_SANDBOX_NET_ALLOW(LIST).",
  locality: "local",
  supportedRuntimes: ["python", "node", "bash"],
  run
});
