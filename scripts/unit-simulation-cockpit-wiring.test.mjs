#!/usr/bin/env node
/**
 * Structural wiring coverage for the Simulation Cockpit UI integration.
 *
 * JSX is not transpiled in this repo's node:test CI (components are read as
 * source, exactly like unit-orchestration-canvas-ui.test.mjs). These checks
 * lock the seamless, shared integration so a rename/removal fails CI:
 *   - SimulationCockpit reuses the shared config + the swarm cockpit CSS grammar
 *   - SimulationCockpit is read-only (GET, no PATCH/sandbox-run)
 *   - HelperSidecar mounts it under a "simulation" view + initialView prop
 *   - the /simulate command is a read-only view switch to "simulation"
 *   - the Workspace Lens exposes a white "Run simulation" action that opens the
 *     same sidecar via initialView, gated by the same helper setup
 *
 * Run with:  node --test scripts/unit-simulation-cockpit-wiring.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const read = (rel) => readFileSync(path.join(app, rel), "utf8");

const cockpit = read("app/data-model/components/SimulationCockpit.jsx");
const sidecar = read("app/data-model/components/HelperSidecar.jsx");
const lens = read("app/components/WorkspaceLensPanel.jsx");
const commands = read("app/data-model/components/helper-commands.js");
const css = read("app/globals.css");

test("SimulationCockpit reuses the shared config and the swarm cockpit CSS grammar", () => {
  assert.match(cockpit, /from "@\/lib\/simulation-cockpit-config"/);
  assert.match(cockpit, /buildSimulationQuery/);
  // Identical sidecar grammar — not a new visual language.
  for (const cls of ["dm-swarm-cockpit", "dm-helper-toolcall", "dm-swarm-card", "dm-run-console__hint", "dm-run-console__tree-dot", "dm-helper-setup-input", "dm-btn-primary", "dm-helper-error"]) {
    assert.ok(cockpit.includes(cls), `SimulationCockpit must use ${cls}`);
  }
});

test("SimulationCockpit is strictly read-only (no mutation lanes)", () => {
  assert.ok(cockpit.includes("fetch(buildSimulationQuery"), "calls the read-only GET route via shared config");
  assert.ok(!/method:\s*["']POST["']/.test(cockpit), "no POST");
  assert.ok(!cockpit.includes("/api/workspace/sandbox-run"), "never executes sandbox-run");
  assert.ok(!/PATCH/.test(cockpit), "never PATCHes config");
});

test("HelperSidecar mounts the simulation cockpit under a shared view", () => {
  assert.match(sidecar, /import \{ SimulationCockpit \} from "\.\/SimulationCockpit\.jsx"/);
  assert.match(sidecar, /inSimulationView\s*=\s*activeView === "simulation"/);
  assert.match(sidecar, /inSimulationView && \(/);
  assert.match(sidecar, /<SimulationCockpit/);
  // initialView prop threads the Lens action into the simulation view.
  assert.match(sidecar, /initialView/);
  // chat body excludes the simulation view (no double-render).
  assert.match(sidecar, /!inSwarmView && !inSimulationView/);
});

test("/simulate is a governed, read-only view switch to simulation", () => {
  assert.match(commands, /name: "\/simulate"/);
  // read-only (mutates:false) + view:"simulation"; no intent/proposal seed.
  const block = commands.slice(commands.indexOf('"/simulate"'));
  assert.match(block, /mutates: false/);
  assert.match(block, /view: "simulation"/);
});

test("Workspace Lens exposes a seamless white Run simulation action sharing the sidecar", () => {
  assert.match(lens, /openSimulation/);
  assert.match(lens, /setHelperView\("simulation"\)/);
  assert.match(lens, /Run simulation/);
  assert.match(lens, /initialView=\{helperView\}/);
  // Same setup gate as the helper handoff — no separate auth path.
  assert.match(lens, /if \(!helperConfigured\) \{\s*setSetupOpen\(true\);/);
  // The button is a child of the helper card body ⇒ inherits the white button CSS.
  assert.match(lens, /workspace-lens-helper-card-actions/);
  assert.match(css, /\.workspace-lens-helper-card-body button \{[^}]*background: #fff/);
  assert.match(css, /\.workspace-lens-helper-card-actions \{/);
});
