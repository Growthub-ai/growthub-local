#!/usr/bin/env node
// verify-env.mjs — Verify the Free Claude Code Proxy environment is ready.
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";
import net from "node:net";

const FORK_PATH =
  process.env.FREE_CLAUDE_CODE_HOME || resolve(homedir(), "free-claude-code");
const PROXY_PORT = Number(process.env.FREE_CLAUDE_CODE_PROXY_PORT || 8082);

let passed = 0;
let failed = 0;

function check(label, pass, detail) {
  if (pass) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function portFree(port) {
  return new Promise((res) => {
    const server = net.createServer();
    server.once("error", () => res(false));
    server.once("listening", () => {
      server.close(() => res(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function hasProviderConfig(envText) {
  const keys = [
    "NVIDIA_NIM_API_KEY",
    "OPENROUTER_API_KEY",
    "DEEPSEEK_API_KEY",
    "LM_STUDIO_BASE_URL",
    "LLAMACPP_BASE_URL",
  ];
  for (const key of keys) {
    const match = envText.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
    if (match && match[1].trim() && !match[1].trim().startsWith("#")) {
      return key;
    }
  }
  return null;
}

async function main() {
  console.log("\nFree Claude Code Proxy — Environment Check");
  console.log("─".repeat(52));

  // 1. Fork present
  check(`Fork exists at ${FORK_PATH}`, existsSync(FORK_PATH), "Run: bash setup/clone-fork.sh");

  // 2. Fork structure
  for (const item of ["server.py", "pyproject.toml", "uv.lock"]) {
    check(`Fork has ${item}`, existsSync(resolve(FORK_PATH, item)), "Re-clone or pull upstream");
  }

  // 3. Python 3.14+
  try {
    const out = execSync("python3 --version", { stdio: ["ignore", "pipe", "pipe"] }).toString();
    const m = out.match(/(\d+)\.(\d+)/);
    if (m) {
      const major = parseInt(m[1], 10);
      const minor = parseInt(m[2], 10);
      const ok = major > 3 || (major === 3 && minor >= 14);
      check(`Python 3.14+ (current: ${m[1]}.${m[2]})`, ok, "Install from https://www.python.org/downloads/");
    } else {
      check("Python version parse", false, "Unable to parse `python3 --version`");
    }
  } catch {
    check("python3 available", false, "Install Python 3.14+");
  }

  // 4. uv available
  try {
    const out = execSync("uv --version", { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
    check(`uv available (${out})`, true);
  } catch {
    check("uv available", false, "Install with: pip install uv");
  }

  // 5. uv.lock installed (.venv present)
  check(
    "Fork dependencies installed (.venv present)",
    existsSync(resolve(FORK_PATH, ".venv")),
    `Run: cd ${FORK_PATH} && uv sync`,
  );

  // 6. .env present
  const envPath = resolve(FORK_PATH, ".env");
  const envPresent = existsSync(envPath);
  check(".env present in fork", envPresent, `Run: cp ${FORK_PATH}/.env.example ${envPath}`);

  // 7. At least one provider configured
  if (envPresent) {
    const envText = readFileSync(envPath, "utf8");
    const provider = hasProviderConfig(envText);
    check(
      `At least one provider configured${provider ? ` (${provider})` : ""}`,
      !!provider,
      "Set one of NVIDIA_NIM_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, LM_STUDIO_BASE_URL, LLAMACPP_BASE_URL",
    );
  }

  // 8. Port free
  const free = await portFree(PROXY_PORT);
  check(`Port ${PROXY_PORT} is free`, free, "Another process is bound — stop it or pick a different port");

  // 9. Git available (used by clone-fork.sh)
  try {
    execSync("git --version", { stdio: "ignore" });
    check("git available", true);
  } catch {
    check("git available", false, "Install git: https://git-scm.com/");
  }

  console.log("─".repeat(52));
  console.log(`  ${passed} passed · ${failed} failed`);

  if (failed > 0) {
    console.log("\n  Fix the items above, then re-run this script.\n");
    process.exit(1);
  } else {
    console.log("\n  Environment is ready. Start the proxy with /fcc-up or:");
    console.log(`    cd ${FORK_PATH} && uv run uvicorn server:app --host 127.0.0.1 --port ${PROXY_PORT}\n`);
  }
}

main().catch((err) => {
  console.error("verify-env failed:", err);
  process.exit(1);
});
