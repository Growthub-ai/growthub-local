/**
 * Helper slash-command registry (SWARM_RUN_CONTRACT_V1, Phase 6).
 *
 * Pure module — no React, no fetch, no config writes. The HelperSidecar
 * composer consumes this registry to render the "/" menu; unit tests assert
 * its governance invariants.
 *
 * Governance rules encoded here:
 *   - read-only commands (mutates: false) may switch the sidecar view or
 *     seed a prompt — they never create proposals or patch config.
 *   - mutating commands (mutates: true) only ever SEED a helper proposal
 *     request (intent + prompt template). The proposal still travels the
 *     full governed chain: helper query → review → helper/apply → receipt.
 *   - no command executes sandbox-run directly and no command patches
 *     workspace config directly.
 */

export const HELPER_COMMANDS = [
  {
    name: "/goal",
    label: "Goal",
    scope: "chat",
    mutates: false,
    promptTemplate: "Set a verifiable goal for this helper session:"
  },
  {
    name: "/loop",
    label: "Loop",
    scope: "workspace",
    mutates: true,
    promptTemplate: "Propose a governed loop:"
  },
  {
    name: "/workflows",
    label: "Workflows",
    scope: "workspace",
    mutates: false,
    view: "swarm-list"
  },
  {
    name: "/swarm",
    label: "Swarm",
    scope: "swarm",
    mutates: true,
    intent: "swarm",
    promptTemplate: "Propose a governed agent swarm:"
  },
  {
    name: "/register-api",
    label: "Register API",
    scope: "workspace",
    mutates: true,
    intent: "register_api"
  },
  {
    name: "/create-object",
    label: "Create object",
    scope: "workspace",
    mutates: true,
    intent: "create_object"
  }
];

/**
 * Fuzzy-filter the registry against what the user typed after "/".
 * Matches subsequences against the command name and label so "/wf" hits
 * "/workflows" and "swm" hits "/swarm". Empty query returns everything.
 */
export function matchHelperCommands(query, commands = HELPER_COMMANDS) {
  const text = String(query || "").trim().toLowerCase().replace(/^\//, "");
  if (!text) return commands.slice();
  const isSubsequence = (needle, haystack) => {
    let i = 0;
    for (const ch of haystack) {
      if (ch === needle[i]) i += 1;
      if (i >= needle.length) return true;
    }
    return needle.length === 0;
  };
  return commands.filter((cmd) => {
    const name = cmd.name.toLowerCase().replace(/^\//, "");
    const label = cmd.label.toLowerCase();
    return name.includes(text) || label.includes(text)
      || isSubsequence(text, name) || isSubsequence(text, label);
  });
}

/**
 * Parse a composer value into a slash-menu state. The menu only engages
 * when "/" is the FIRST character of the prompt — a slash mid-sentence
 * (URLs, paths) never hijacks typing.
 */
export function parseSlashInput(value) {
  const text = String(value || "");
  if (!text.startsWith("/")) return { active: false, query: "", matches: [] };
  // Once whitespace follows the command token the user is writing the
  // body — keep the menu closed.
  const token = text.slice(1);
  if (/\s/.test(token)) return { active: false, query: "", matches: [] };
  return { active: true, query: token, matches: matchHelperCommands(token) };
}
