/**
 * Pure eligibility predicates for the Sandbox Local Agent Auth Onboarding
 * V1 panel. Extracted so it can be imported by both the React client
 * component (`.jsx`) and the Node-side unit tests (`.js` — no JSX runtime,
 * no DOM).
 *
 * The auth panel is host-agnostic: any sandbox row with
 * `adapter: "local-agent-host"`, `runLocality !== "serverless"`, and an
 * `agentHost` that is registered in the host auth catalog renders the
 * panel. Per-host capabilities (login / logout buttons) flow from the
 * catalog — this file only decides whether to render at all.
 *
 * No node-specific imports, no React. Safe to ship in any runtime.
 */

import { KNOWN_HOST_AUTH_SLUGS } from "./sandbox-agent-host-catalog.js";

const LOCAL_AGENT_HOST_ADAPTER = "local-agent-host";
// Legacy export kept for code that hard-codes the Claude slug elsewhere.
const CLAUDE_LOCAL_HOST = "claude_local";

/**
 * @returns {boolean} true when the row should surface the agent auth panel.
 */
function isSandboxLocalAgentHost(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const adapter = String(row.adapter || "").trim();
  const agentHost = String(row.agentHost || "").trim();
  const runLocality = String(row.runLocality || "").trim().toLowerCase();
  if (adapter !== LOCAL_AGENT_HOST_ADAPTER) return false;
  if (!KNOWN_HOST_AUTH_SLUGS.includes(agentHost)) return false;
  if (runLocality === "serverless") return false;
  return true;
}

/**
 * Backwards-compatible alias — Claude-specific predicate. Kept for any
 * import that still references the original name; new code should use
 * `isSandboxLocalAgentHost` so it works for every local-agent-host slug.
 */
function isSandboxClaudeLocal(row) {
  return isSandboxLocalAgentHost(row) && String(row?.agentHost || "").trim() === CLAUDE_LOCAL_HOST;
}

export {
  CLAUDE_LOCAL_HOST,
  LOCAL_AGENT_HOST_ADAPTER,
  isSandboxClaudeLocal,
  isSandboxLocalAgentHost
};
