/**
 * Command registry — one typed registry feeding both command surfaces
 * (slash menu + Cmd-K palette). Entries declare name, args hint, scope,
 * and how they resolve:
 *
 *   resolve: "read"      — direct GET, no authority needed
 *   resolve: "proposal"  — resolves to a governed swarm-run proposal that
 *                          still passes the propose → approve path
 *   resolve: "navigate"  — pure client-side navigation
 *
 * Saved workflows are appended dynamically as `/<name>` proposal commands.
 */

import { listSavedWorkflows } from "./saved-workflows.js";

const STATIC_COMMANDS = [
  {
    name: "swarm",
    argsHint: "<workflow-name> [description]",
    scope: "swarm",
    resolve: "proposal",
    description: "Propose a swarm run from a saved workflow"
  },
  {
    name: "workflows",
    argsHint: "",
    scope: "swarm",
    resolve: "read",
    description: "List swarm runs and saved workflows"
  },
  {
    name: "goal",
    argsHint: "<condition>",
    scope: "swarm",
    resolve: "proposal",
    description: "Attach a verifiable goal condition to the next swarm run"
  },
  {
    name: "loop",
    argsHint: "<workflow-name> [interval]",
    scope: "swarm",
    resolve: "proposal",
    description: "Run a saved workflow on a self-paced recurring loop"
  },
  {
    name: "build-dashboard",
    argsHint: "<brief>",
    scope: "workspace",
    resolve: "proposal",
    description: "Workspace helper: draft a dashboard proposal"
  },
  {
    name: "create-object",
    argsHint: "<brief>",
    scope: "workspace",
    resolve: "proposal",
    description: "Workspace helper: draft a custom object proposal"
  },
  {
    name: "register-api",
    argsHint: "<brief>",
    scope: "workspace",
    resolve: "proposal",
    description: "Workspace helper: draft an API registry row proposal"
  },
  {
    name: "data-model",
    argsHint: "",
    scope: "chat",
    resolve: "navigate",
    description: "Open the data model cockpit",
    href: "/data-model"
  },
  {
    name: "workspace-lens",
    argsHint: "",
    scope: "chat",
    resolve: "navigate",
    description: "Open the workspace lens",
    href: "/workspace-lens"
  }
];

async function listCommands() {
  const commands = STATIC_COMMANDS.map((command) => ({ ...command }));
  try {
    const workflows = await listSavedWorkflows();
    for (const workflow of workflows) {
      if (commands.some((command) => command.name === workflow.name)) continue;
      commands.push({
        name: workflow.name,
        argsHint: "[description]",
        scope: "swarm",
        resolve: "proposal",
        description: workflow.description || `Saved workflow: ${workflow.label}`,
        workflow: { kind: workflow.kind, name: workflow.name }
      });
    }
  } catch {
    // Saved workflows are an enhancement; the static registry always works.
  }
  return commands;
}

function filterCommands(commands, query) {
  const q = String(query || "").trim().toLowerCase().replace(/^\//, "");
  if (!q) return commands;
  return commands
    .map((command) => {
      const name = command.name.toLowerCase();
      let score = -1;
      if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (command.description.toLowerCase().includes(q)) score = 3;
      return { command, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.command);
}

export { listCommands, filterCommands, STATIC_COMMANDS };
