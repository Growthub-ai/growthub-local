/**
 * Pure eligibility predicates for the Sandbox Claude Local Auth Onboarding
 * V1 panel. Extracted from `SandboxAgentAuthPanel.jsx` so it can be imported
 * by both the React client component (`.jsx`) and the Node-side unit tests
 * (`.js` — no JSX runtime, no DOM).
 *
 * No node-specific imports, no React. Safe to ship in any runtime.
 */

const CLAUDE_LOCAL_ADAPTER = "local-agent-host";
const CLAUDE_LOCAL_HOST = "claude_local";

/**
 * @returns {boolean} true when the row should surface the Claude auth panel.
 */
function isSandboxClaudeLocal(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const adapter = String(row.adapter || "").trim();
  const agentHost = String(row.agentHost || "").trim();
  const runLocality = String(row.runLocality || "").trim().toLowerCase();
  if (adapter !== CLAUDE_LOCAL_ADAPTER) return false;
  if (agentHost !== CLAUDE_LOCAL_HOST) return false;
  if (runLocality === "serverless") return false;
  return true;
}

export { CLAUDE_LOCAL_ADAPTER, CLAUDE_LOCAL_HOST, isSandboxClaudeLocal };
