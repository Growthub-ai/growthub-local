#!/usr/bin/env node
/**
 * Unit coverage for the helper slash-command registry (SWARM_RUN_CONTRACT_V1).
 *
 * Governance invariants:
 *   - read-only and mutating commands are clearly separated
 *   - /swarm is mutating and seeds the swarm proposal intent
 *   - /workflows is read-only and only switches the sidecar view
 *   - mutating commands seed governed proposal requests (intent and/or
 *     prompt template) — no command carries a direct patch/execute hook
 *   - fuzzy matching and slash parsing behave (no mid-sentence hijack)
 *
 * Run with:  node --test scripts/unit-helper-command-registry.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const commandsPath = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/components/helper-commands.js"
);

const { HELPER_COMMANDS, matchHelperCommands, parseSlashInput } = await import(pathToFileURL(commandsPath).href);

test("registry separates read-only and mutating commands", () => {
  for (const cmd of HELPER_COMMANDS) {
    assert.equal(typeof cmd.name, "string");
    assert.ok(cmd.name.startsWith("/"), `${cmd.name} starts with /`);
    assert.equal(typeof cmd.label, "string");
    assert.equal(typeof cmd.mutates, "boolean", `${cmd.name} declares mutates`);
  }
  const readOnly = HELPER_COMMANDS.filter((c) => !c.mutates).map((c) => c.name);
  const mutating = HELPER_COMMANDS.filter((c) => c.mutates).map((c) => c.name);
  assert.ok(readOnly.includes("/goal"));
  assert.ok(readOnly.includes("/workflows"));
  assert.ok(mutating.includes("/swarm"));
  assert.ok(mutating.includes("/loop"));
  assert.ok(mutating.includes("/register-api"));
  assert.ok(mutating.includes("/create-object"));
});

test("/swarm seeds the governed swarm proposal intent", () => {
  const swarm = HELPER_COMMANDS.find((c) => c.name === "/swarm");
  assert.equal(swarm.mutates, true);
  assert.equal(swarm.intent, "swarm");
  assert.equal(swarm.scope, "swarm");
  assert.match(swarm.promptTemplate, /governed agent swarm/i);
  assert.equal(swarm.view, undefined, "no direct view bypass for a mutating command");
});

test("/workflows is read-only and opens the cockpit list view", () => {
  const workflows = HELPER_COMMANDS.find((c) => c.name === "/workflows");
  assert.equal(workflows.mutates, false);
  assert.equal(workflows.view, "swarm-list");
  assert.equal(workflows.intent, undefined, "read-only command seeds no proposal intent");
});

test("no command carries a direct mutation/execution hook", () => {
  for (const cmd of HELPER_COMMANDS) {
    // The only allowed behaviors are view switches and prompt/intent seeding.
    const keys = Object.keys(cmd).sort();
    for (const key of keys) {
      assert.ok(
        ["name", "label", "scope", "mutates", "promptTemplate", "view", "intent"].includes(key),
        `${cmd.name} has unexpected behavior key "${key}"`
      );
    }
    // Mutating commands must route through the proposal chain.
    if (cmd.mutates) {
      assert.ok(cmd.intent || cmd.promptTemplate, `${cmd.name} must seed a governed proposal request`);
      assert.equal(cmd.view, undefined, `${cmd.name} must not switch views directly`);
    }
  }
});

test("fuzzy matching finds commands by name, label, and subsequence", () => {
  assert.equal(matchHelperCommands("").length, HELPER_COMMANDS.length);
  assert.ok(matchHelperCommands("sw").some((c) => c.name === "/swarm"));
  assert.ok(matchHelperCommands("wf").some((c) => c.name === "/workflows"));
  assert.ok(matchHelperCommands("register").some((c) => c.name === "/register-api"));
  assert.ok(matchHelperCommands("Create object").some((c) => c.name === "/create-object"));
  assert.equal(matchHelperCommands("zzzqqq").length, 0);
});

test("slash parsing only engages at the start of the prompt", () => {
  assert.equal(parseSlashInput("/").active, true);
  assert.equal(parseSlashInput("/sw").active, true);
  assert.ok(parseSlashInput("/sw").matches.some((c) => c.name === "/swarm"));
  // Mid-sentence slash or URL never hijacks typing.
  assert.equal(parseSlashInput("see https://example.com/path").active, false);
  assert.equal(parseSlashInput("a /swarm").active, false);
  // Once the command token is followed by whitespace the user is writing
  // the body — menu stays closed.
  assert.equal(parseSlashInput("/swarm run 8 agents").active, false);
  assert.equal(parseSlashInput("").active, false);
});
