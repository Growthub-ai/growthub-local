#!/usr/bin/env node
/**
 * Unit coverage for the CEO Agent Teams configuration layer
 * (CEO_PRIMITIVE_COCKPIT_ROADMAP_V1).
 *
 * Proves Agent Teams are an atomic, governed CONFIGURATION layer — not a new
 * runtime/route/objectType:
 *   - the Agent Teams object uses the EXISTING `custom` objectType
 *   - the object validates through the existing validateWorkspaceConfig
 *   - creation reuses the EXISTING dataModel.object.create helper/apply lane
 *   - deriveAgentTeamsState reflects presence/count from config
 *   - the /swarm bridge is propose-only seed text (never executes)
 *
 * Run with:  node --test scripts/unit-ceo-agent-teams.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib"
);

const mod = await import(pathToFileURL(path.join(kitLib, "ceo-agent-teams.js")).href);
const schema = await import(pathToFileURL(path.join(kitLib, "workspace-schema.js")).href);
const {
  AGENT_SWARM_TEAMS_OBJECT_ID,
  AGENT_SWARM_TEAMS_COLUMNS,
  buildAgentSwarmTeamsObject,
  buildCreateAgentTeamsProposal,
  findAgentTeams,
  deriveAgentTeamsState,
  buildSwarmIntentFromTeam,
} = mod;
const { validateWorkspaceConfig } = schema;

test("the Agent Teams object uses the existing custom objectType (no new type)", () => {
  const obj = buildAgentSwarmTeamsObject();
  assert.equal(obj.id, AGENT_SWARM_TEAMS_OBJECT_ID);
  assert.equal(obj.objectType, "custom");
  assert.ok(obj.columns.includes("Name"), "Name identity column present");
  assert.ok(Array.isArray(obj.rows) && obj.rows.length >= 1, "ships a blueprint row");
});

test("the Agent Teams object validates through validateWorkspaceConfig", () => {
  const config = { dataModel: { objects: [buildAgentSwarmTeamsObject()] } };
  assert.doesNotThrow(() => validateWorkspaceConfig(config));
});

test("creation reuses the existing dataModel.object.create lane", () => {
  const proposal = buildCreateAgentTeamsProposal();
  assert.equal(proposal.type, "dataModel.object.create");
  assert.equal(proposal.affectedField, "dataModel");
  assert.equal(proposal.payload.object.objectType, "custom");
  assert.equal(proposal.payload.object.id, AGENT_SWARM_TEAMS_OBJECT_ID);
});

test("deriveAgentTeamsState reflects presence and count from config", () => {
  const absent = deriveAgentTeamsState({ workspaceConfig: { dataModel: { objects: [] } } });
  assert.equal(absent.present, false);
  assert.equal(absent.canCreate, true);
  assert.equal(absent.count, 0);

  const present = deriveAgentTeamsState({ workspaceConfig: { dataModel: { objects: [buildAgentSwarmTeamsObject()] } } });
  assert.equal(present.present, true);
  assert.equal(present.canCreate, false);
  assert.equal(present.count, 1);
  assert.equal(present.teams[0].name, "Example — Research & Synthesis Team");
});

test("findAgentTeams ignores nameless rows", () => {
  const config = {
    dataModel: {
      objects: [
        { id: AGENT_SWARM_TEAMS_OBJECT_ID, label: "Agent Swarm Teams", objectType: "custom", columns: AGENT_SWARM_TEAMS_COLUMNS, rows: [
          { Name: "Team A", subAgentRoles: "X; Y" },
          { Name: "", subAgentRoles: "ignored" },
          { subAgentRoles: "also ignored" },
        ] },
      ],
    },
  };
  const teams = findAgentTeams(config);
  assert.equal(teams.length, 1);
  assert.equal(teams[0].name, "Team A");
});

test("the /swarm bridge is propose-only seed text", () => {
  const team = {
    name: "Growth Team",
    teamPurpose: "Find and rank growth experiments.",
    orchestratorRole: "Growth Lead",
    orchestratorPrompt: "Decompose into experiment hypotheses.",
    subAgentRoles: "Researcher; Analyst",
    outcomeCriteria: "A ranked list with expected impact.",
  };
  const seed = buildSwarmIntentFromTeam(team);
  assert.match(seed, /^Propose a governed agent swarm from the Agent Team blueprint "Growth Team"/);
  assert.match(seed, /Researcher, Analyst/);
  // Seed text describes intent only — it contains no execution directive.
  assert.doesNotMatch(seed, /sandbox-run|execute now|run immediately/i);
});
