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

const {
  HELPER_COMMANDS,
  HELPER_COMMAND_ALLOWED_KEYS,
  isGovernedHelperCommand,
  matchHelperCommands,
  parseSlashInput,
} = await import(pathToFileURL(commandsPath).href);

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
    const verdict = isGovernedHelperCommand(cmd);
    assert.equal(verdict.ok, true, verdict.error);
    for (const key of Object.keys(cmd)) {
      assert.ok(HELPER_COMMAND_ALLOWED_KEYS.includes(key), `${cmd.name} has unexpected behavior key "${key}"`);
    }
    // Mutating commands must route through the proposal chain.
    if (cmd.mutates) {
      assert.ok(cmd.intent || cmd.promptTemplate, `${cmd.name} must seed a governed proposal request`);
      assert.equal(cmd.view, undefined, `${cmd.name} must not switch views directly`);
    }
    // Discoverability: every command documents itself for the slash menu.
    assert.ok(typeof cmd.description === "string" && cmd.description.length > 0, `${cmd.name} needs a description`);
  }
});

test("the no-direct-mutation-hook invariant bites on forged commands", () => {
  // A command smuggling an execute/patch/fetch hook must fail validation —
  // this is the adversarial proof the governance test is not vacuous.
  assert.equal(
    isGovernedHelperCommand({ name: "/evil", label: "Evil", mutates: true, intent: "swarm", execute: () => {} }).ok,
    false
  );
  assert.equal(
    isGovernedHelperCommand({ name: "/evil", label: "Evil", mutates: true, intent: "swarm", patch: { dataModel: {} } }).ok,
    false
  );
  // Mutating command with a direct view switch is rejected.
  assert.equal(
    isGovernedHelperCommand({ name: "/evil", label: "Evil", mutates: true, intent: "swarm", view: "swarm-list" }).ok,
    false
  );
  // Mutating command with no proposal seed is rejected.
  assert.equal(
    isGovernedHelperCommand({ name: "/evil", label: "Evil", mutates: true }).ok,
    false
  );
  // A well-formed read-only command passes.
  assert.equal(
    isGovernedHelperCommand({ name: "/fine", label: "Fine", description: "d", scope: "chat", mutates: false, view: "swarm-list" }).ok,
    true
  );
});

test("fuzzy matching finds commands by name, label, and subsequence", () => {
  assert.equal(matchHelperCommands("").length, HELPER_COMMANDS.length);
  assert.ok(matchHelperCommands("sw").some((c) => c.name === "/swarm"));
  assert.ok(matchHelperCommands("swa").some((c) => c.name === "/swarm"));
  assert.ok(matchHelperCommands("swm").some((c) => c.name === "/swarm"));
  assert.ok(matchHelperCommands("wf").some((c) => c.name === "/workflows"));
  assert.ok(matchHelperCommands("register").some((c) => c.name === "/register-api"));
  assert.ok(matchHelperCommands("Create object").some((c) => c.name === "/create-object"));
  assert.equal(matchHelperCommands("zzzqqq").length, 0);
});

test("/ceo is read-only and opens the CEO cockpit view", () => {
  const ceo = HELPER_COMMANDS.find((c) => c.name === "/ceo");
  assert.ok(ceo, "/ceo command is registered");
  assert.equal(ceo.mutates, false);
  assert.equal(ceo.view, "ceo");
  assert.equal(ceo.intent, undefined, "read-only command seeds no proposal intent");
});

test("/governance is read-only and aliases the unified Authority cockpit", () => {
  const gov = HELPER_COMMANDS.find((c) => c.name === "/governance");
  assert.ok(gov, "/governance command is registered");
  assert.equal(gov.mutates, false);
  // It must point at the unified authority view — the same surface the CEO ›
  // Authority tab renders — never a separate "governance" product island.
  assert.equal(gov.view, "authority");
  assert.notEqual(gov.view, "governance", "/governance must not be a separate island view");
  assert.equal(gov.intent, undefined, "read-only command seeds no proposal intent");
  assert.equal(gov.promptTemplate, undefined, "read-only view switch seeds no prompt");
  // Governed validator must accept it as a clean read-only command.
  assert.equal(isGovernedHelperCommand(gov).ok, true, isGovernedHelperCommand(gov).error);
});

test("no command executes or patches directly (full registry, including authority commands)", () => {
  for (const cmd of HELPER_COMMANDS) {
    const verdict = isGovernedHelperCommand(cmd);
    assert.equal(verdict.ok, true, verdict.error);
    // Behavioral surface is fixed: no execute/patch/fetch hooks anywhere.
    for (const key of Object.keys(cmd)) {
      assert.ok(
        HELPER_COMMAND_ALLOWED_KEYS.includes(key),
        `${cmd.name} carries non-governed behavior key "${key}"`
      );
    }
  }
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
