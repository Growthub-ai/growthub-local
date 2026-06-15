/**
 * CEO Agent Teams — the atomic, reusable team-configuration layer for the /ceo
 * surface (CEO_PRIMITIVE_COCKPIT_ROADMAP_V1).
 *
 * Distinction this module encodes:
 *   - FLEET (runtime/oversight) = existing `swarm-workflows` rows, readiness,
 *     run state, failures, receipts, Background Tasks. UNCHANGED by this module.
 *   - AGENT TEAMS (atomic configuration) = reusable blueprints describing the
 *     orchestrator, sub-agent roles, skills, processes, workflow
 *     responsibilities, and outcome criteria of a swarm.
 *
 * This is a PURE module — no React, no fetch, no fs, no writes, no localStorage.
 * It introduces NO new runtime, executor, API route, PATCH allowlist field, or
 * object type: Agent Teams live in a governed Data Model object of the EXISTING
 * `custom` objectType, created through the EXISTING `dataModel.object.create`
 * helper/apply lane, and they only ever *inform* a `/swarm` proposal — the
 * server still builds the `agent-swarm-v1` graph, the run still lands in
 * `swarm-workflows`, and execution still happens through `sandbox-run`.
 *
 * An Agent Team record never executes anything.
 */

export const AGENT_SWARM_TEAMS_OBJECT_ID = "agent-swarm-teams";
export const AGENT_SWARM_TEAMS_LABEL = "Agent Swarm Teams";

// Visible row columns. "Name" is the capital-N identity column (Data Model grid
// convention). Array-shaped fields are stored as readable strings so we never
// fight the row-value contract (no typed arrays in rows).
export const AGENT_SWARM_TEAMS_COLUMNS = [
  "Name",
  "status",
  "teamPurpose",
  "orchestratorRole",
  "orchestratorPrompt",
  "subAgentRoles",
  "skills",
  "processes",
  "workflowResponsibilities",
  "outcomeCriteria",
  "defaultRunLocality",
  "defaultAdapter",
  "linkedSwarmWorkflowName",
  "governanceNotes",
  "createdAt",
  "updatedAt",
];

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

// One clearly-labeled blueprint row so a freshly-created table shows the shape
// (and is honestly an example, not live state).
function blueprintRow() {
  return {
    Name: "Example — Research & Synthesis Team",
    status: "blueprint",
    teamPurpose: "Reusable blueprint: research a topic and synthesize a cited brief.",
    orchestratorRole: "Research Lead",
    orchestratorPrompt: "Decompose the objective into independent research subtasks for the team.",
    subAgentRoles: "Researcher; Analyst; Synthesizer",
    skills: "web-research; summarization; critique",
    processes: "gather → analyze → synthesize",
    workflowResponsibilities: "Researcher gathers facts; Analyst stress-tests; Synthesizer writes the brief",
    outcomeCriteria: "A cited brief with risks and a clear recommendation",
    defaultRunLocality: "local",
    defaultAdapter: "local-intelligence",
    linkedSwarmWorkflowName: "",
    governanceNotes: "Blueprint only — launch through /swarm; the run lands in swarm-workflows and emits receipts.",
    createdAt: "",
    updatedAt: "",
  };
}

/** The governed Agent Teams object definition (existing `custom` objectType). */
export function buildAgentSwarmTeamsObject({ includeBlueprint = true } = {}) {
  return {
    id: AGENT_SWARM_TEAMS_OBJECT_ID,
    label: AGENT_SWARM_TEAMS_LABEL,
    objectType: "custom",
    columns: AGENT_SWARM_TEAMS_COLUMNS.slice(),
    rows: includeBlueprint ? [blueprintRow()] : [],
    binding: { mode: "manual", source: AGENT_SWARM_TEAMS_LABEL },
  };
}

/**
 * A governed proposal that CREATES the Agent Teams table through the EXISTING
 * `dataModel.object.create` helper/apply lane. No new proposal type, no new
 * objectType — objectType stays `custom`.
 */
export function buildCreateAgentTeamsProposal() {
  return {
    type: "dataModel.object.create",
    affectedField: "dataModel",
    payload: { object: buildAgentSwarmTeamsObject({ includeBlueprint: true }) },
    rationale: "Create the governed Agent Swarm Teams table — reusable swarm blueprints (config, not runtime).",
  };
}

export function findAgentTeamsObject(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.find((o) => o?.id === AGENT_SWARM_TEAMS_OBJECT_ID) || null;
}

export function findAgentTeams(workspaceConfig) {
  const object = findAgentTeamsObject(workspaceConfig);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows
    .filter((row) => row && clean(row.Name))
    .map((row) => ({
      name: clean(row.Name),
      status: clean(row.status) || "blueprint",
      teamPurpose: clean(row.teamPurpose),
      orchestratorRole: clean(row.orchestratorRole),
      orchestratorPrompt: clean(row.orchestratorPrompt),
      subAgentRoles: clean(row.subAgentRoles),
      skills: clean(row.skills),
      outcomeCriteria: clean(row.outcomeCriteria),
      defaultAdapter: clean(row.defaultAdapter),
      linkedSwarmWorkflowName: clean(row.linkedSwarmWorkflowName),
    }));
}

/**
 * Project the Agent Teams configuration layer for the cockpit. Pure.
 *   { present, count, teams[], canCreate }
 */
export function deriveAgentTeamsState({ workspaceConfig } = {}) {
  const object = findAgentTeamsObject(workspaceConfig);
  const teams = findAgentTeams(workspaceConfig);
  return {
    objectId: AGENT_SWARM_TEAMS_OBJECT_ID,
    present: Boolean(object),
    count: teams.length,
    teams,
    // The table is created through the governed create lane when absent.
    canCreate: !object,
  };
}

function joinAgents(subAgentRoles) {
  return clean(subAgentRoles)
    .split(/[;,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Build the /swarm composer seed text from an Agent Team blueprint. This is
 * PROPOSE-ONLY seed copy: it prefills the helper composer so the user proposes
 * a governed swarm "from this blueprint". The model + server still produce the
 * proposal and build the agent-swarm-v1 graph; nothing here executes.
 */
export function buildSwarmIntentFromTeam(team) {
  if (!team) return "Propose a governed agent swarm:";
  const agents = joinAgents(team.subAgentRoles);
  const parts = [
    `Propose a governed agent swarm from the Agent Team blueprint "${team.name}".`,
    team.teamPurpose ? `Objective: ${team.teamPurpose}` : "",
    team.orchestratorRole || team.orchestratorPrompt
      ? `Orchestrator${team.orchestratorRole ? ` (${team.orchestratorRole})` : ""}: ${team.orchestratorPrompt || "plan the work for the team"}.`
      : "",
    agents.length ? `Sub-agents: ${agents.join(", ")}.` : "",
    team.outcomeCriteria ? `Outcome criteria: ${team.outcomeCriteria}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function summarizeTeam(team) {
  const agents = joinAgents(team?.subAgentRoles).length;
  return [
    team?.orchestratorRole ? `orchestrator: ${team.orchestratorRole}` : null,
    agents ? `${agents} sub-agent${agents === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
}

export default deriveAgentTeamsState;
