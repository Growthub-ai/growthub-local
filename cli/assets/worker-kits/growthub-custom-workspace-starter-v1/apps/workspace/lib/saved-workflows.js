/**
 * Saved swarm workflows — named, reusable swarm-run scripts.
 *
 * Two sources, one list:
 *   - sandbox-environment rows holding agent-swarm-v1 graphs (governed
 *     workspace objects, discovered through nav-workflows — never copied)
 *   - named declarative plans persisted in the source-records sidecar under
 *     `swarm:saved-workflows` (the helper-receipt store, NOT the config)
 *
 * Every saved workflow surfaces in the command registry as `/<name>`.
 */

import { listAvailableWorkflows } from "./nav-workflows.js";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  readWorkspaceSourceRecords,
  writeWorkspaceSourceRecords
} from "./workspace-config.js";
import { SWARM_SAVED_WORKFLOWS_SOURCE_KEY, MAX_AGENTS_PER_RUN } from "./swarm-run-events.js";

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const MAX_SAVED = 50;

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.phases) || plan.phases.length === 0) {
    return "plan.phases must be a non-empty array";
  }
  let agentCount = 0;
  for (const phase of plan.phases) {
    if (!phase || typeof phase !== "object") return "every phase must be an object";
    if (!String(phase.label || "").trim()) return "every phase needs a label";
    const agents = Array.isArray(phase.agents) ? phase.agents : [];
    if (agents.length === 0) return `phase "${phase.label}" has no agents`;
    for (const agent of agents) {
      if (!String(agent?.label || "").trim()) return `phase "${phase.label}" has an agent without a label`;
      if (!String(agent?.prompt || "").trim()) return `agent "${agent?.label}" has no prompt`;
      agentCount += 1;
    }
  }
  if (agentCount > MAX_AGENTS_PER_RUN) {
    return `plan exceeds the per-run agent cap (${agentCount} > ${MAX_AGENTS_PER_RUN})`;
  }
  return null;
}

async function readSavedPlans() {
  try {
    const existing = await readWorkspaceSourceRecords(SWARM_SAVED_WORKFLOWS_SOURCE_KEY);
    return Array.isArray(existing?.records) ? existing.records : [];
  } catch {
    return [];
  }
}

async function listSavedWorkflows() {
  const workspaceConfig = (await readWorkspaceConfig()) || {};
  const graphWorkflows = listAvailableWorkflows(workspaceConfig).map((w) => ({
    kind: "graph",
    name: normalizeName(w.label) || w.rowId,
    label: w.label,
    description: `${w.objectLabel} · ${w.graphNodeCount} nodes`,
    workflowRef: { objectId: w.objectId, rowId: w.rowId },
    status: w.status
  }));
  const savedPlans = (await readSavedPlans()).map((record) => ({
    kind: "plan",
    name: record.name,
    label: record.label || record.name,
    description: record.description || "",
    plan: record.plan,
    savedAt: record.savedAt
  }));
  // Plans win on name collisions — they are the explicit save action.
  const byName = new Map();
  for (const w of graphWorkflows) byName.set(w.name, w);
  for (const w of savedPlans) byName.set(w.name, w);
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function saveWorkflowPlan({ name, label, description, plan }) {
  const normalized = normalizeName(name);
  if (!NAME_RE.test(normalized)) {
    return { ok: false, error: "name must be 2-64 chars: lowercase letters, digits, hyphens" };
  }
  const planError = validatePlan(plan);
  if (planError) return { ok: false, error: planError };
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return { ok: false, error: persistence.reason || "workspace persistence is read-only" };
  }
  const prior = await readSavedPlans();
  const next = [
    ...prior.filter((record) => record.name !== normalized),
    {
      name: normalized,
      label: String(label || name).trim(),
      description: String(description || "").trim(),
      plan,
      savedAt: new Date().toISOString()
    }
  ].slice(-MAX_SAVED);
  await writeWorkspaceSourceRecords(SWARM_SAVED_WORKFLOWS_SOURCE_KEY, next, {
    integrationId: SWARM_SAVED_WORKFLOWS_SOURCE_KEY
  });
  return { ok: true, name: normalized };
}

async function findSavedWorkflow(name) {
  const normalized = normalizeName(name);
  const all = await listSavedWorkflows();
  return all.find((w) => w.name === normalized) || null;
}

export { listSavedWorkflows, saveWorkflowPlan, findSavedWorkflow, validatePlan, normalizeName };
