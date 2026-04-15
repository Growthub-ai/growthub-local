#!/usr/bin/env node
// install-mcp.mjs — print the per-IDE Zernio MCP server config JSON
//
// This is a print-only helper. It does NOT run `pip install zernio-sdk[mcp]`
// for you, and it does NOT mutate any config file. It prints the exact
// copy-paste JSON blocks you need to wire Zernio's official MCP server into
// each MCP-compatible IDE.
//
// Cross-platform (macOS, Linux, Windows). Pure Node stdlib — no deps.
//
// Usage:
//   node setup/install-mcp.mjs                 # print all IDE configs
//   node setup/install-mcp.mjs claude-desktop  # one IDE only
//   node setup/install-mcp.mjs cursor
//   node setup/install-mcp.mjs claude-code
//   node setup/install-mcp.mjs generic

import { platform } from "node:os";
import { join } from "node:path";
import { homedir } from "node:os";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

const arg = (process.argv[2] ?? "all").toLowerCase();
const osPlatform = platform();

// ---- Config path hints (cross-platform) ----
function claudeDesktopConfigPath() {
  const home = homedir();
  if (osPlatform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (osPlatform === "win32") return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

function claudeCodeConfigPath() {
  return join(homedir(), ".claude", "mcp.json");
}

function cursorConfigPath() {
  return join(homedir(), ".cursor", "mcp.json");
}

// ---- MCP server definition ----
// Zernio's official MCP server ships inside the zernio-python SDK:
//   pip install zernio-sdk[mcp]
// The server entrypoint is the Python module. Auth is via ZERNIO_API_KEY env var.
const ZERNIO_MCP_BLOCK = {
  command: "python",
  args: ["-m", "zernio.mcp"],
  env: {
    ZERNIO_API_KEY: "${ZERNIO_API_KEY}",
  },
};

function header(label) {
  console.log("");
  console.log(`${BOLD}${BLUE}${label}${RESET}`);
  console.log("-".repeat(Math.max(24, label.length)));
}

function note(msg) {
  console.log(`${DIM}${msg}${RESET}`);
}

function codeBlock(obj) {
  console.log("```json");
  console.log(JSON.stringify(obj, null, 2));
  console.log("```");
}

function printPreamble() {
  console.log("");
  console.log(`${BOLD}Zernio MCP Server — per-IDE config${RESET}`);
  note(`host: ${osPlatform}  ·  pre-req: pip install zernio-sdk[mcp]  ·  env: ZERNIO_API_KEY`);
  console.log("");
  console.log(`${GREEN}1.${RESET} Install Zernio's MCP server (one-time):`);
  console.log(`   ${BOLD}pip install zernio-sdk[mcp]${RESET}`);
  console.log("");
  console.log(`${GREEN}2.${RESET} Ensure ZERNIO_API_KEY is set in your shell profile (or pass it via the IDE):`);
  if (osPlatform === "win32") {
    console.log(`   ${DIM}setx ZERNIO_API_KEY "sk_..."${RESET}                  ${DIM}# PowerShell, persistent${RESET}`);
  } else {
    console.log(`   ${DIM}echo 'export ZERNIO_API_KEY="sk_..."' >> ~/.zshrc${RESET}    ${DIM}# or ~/.bashrc${RESET}`);
  }
  console.log("");
  console.log(`${GREEN}3.${RESET} Paste one of the JSON blocks below into the matching IDE's MCP config.`);
  console.log("");
}

function printClaudeDesktop() {
  header("Claude Desktop");
  note(`Config file: ${claudeDesktopConfigPath()}`);
  console.log(`Add the ${BOLD}zernio${RESET} server under the top-level ${BOLD}mcpServers${RESET} object:`);
  console.log("");
  codeBlock({
    mcpServers: {
      zernio: ZERNIO_MCP_BLOCK,
    },
  });
  console.log(`${YELLOW}Restart Claude Desktop${RESET} after editing the config.`);
}

function printClaudeCode() {
  header("Claude Code");
  note(`Config file: ${claudeCodeConfigPath()}`);
  console.log(`Add to ${BOLD}.claude/mcp.json${RESET} (or use ${BOLD}claude mcp add${RESET}):`);
  console.log("");
  codeBlock({
    mcpServers: {
      zernio: ZERNIO_MCP_BLOCK,
    },
  });
  console.log(`Alternative one-liner:`);
  console.log(`  ${BOLD}claude mcp add zernio -- python -m zernio.mcp${RESET}`);
}

function printCursor() {
  header("Cursor");
  note(`Config file: ${cursorConfigPath()}`);
  console.log(`Add the ${BOLD}zernio${RESET} entry under the top-level ${BOLD}mcpServers${RESET} object:`);
  console.log("");
  codeBlock({
    mcpServers: {
      zernio: ZERNIO_MCP_BLOCK,
    },
  });
  console.log(`${YELLOW}Restart Cursor${RESET} after editing the config.`);
}

function printGeneric() {
  header("Generic MCP-compatible IDE");
  note("Use this shape for any IDE that speaks MCP (Codex-mcp, n8n MCP nodes, custom clients).");
  console.log("");
  codeBlock({
    mcpServers: {
      zernio: ZERNIO_MCP_BLOCK,
    },
  });
  console.log("Adjust the top-level key if your IDE uses a different name (e.g. `servers` vs `mcpServers`).");
}

function printFooter() {
  console.log("");
  header("What this enables");
  console.log("- The agent can call Zernio endpoints as typed MCP tools instead of raw HTTP.");
  console.log("- Works alongside this kit's Working Directory pattern — strictly additive.");
  console.log("- All writes still use Idempotency-Key = clientPostId for safe re-submission.");
  console.log("- See docs/local-adapters.md for the full matrix of supported IDEs.");
  console.log("");
  console.log(`${DIM}Zernio's MCP server lives in the zernio-python SDK:${RESET}`);
  console.log(`  ${DIM}https://github.com/zernio-dev/zernio-python${RESET}`);
  console.log("");
}

// ---- Dispatch ----
printPreamble();

switch (arg) {
  case "claude-desktop": printClaudeDesktop(); break;
  case "claude-code": printClaudeCode(); break;
  case "cursor": printCursor(); break;
  case "generic": printGeneric(); break;
  case "all":
  default:
    printClaudeDesktop();
    printClaudeCode();
    printCursor();
    printGeneric();
    break;
}

printFooter();
