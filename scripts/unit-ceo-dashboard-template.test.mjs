#!/usr/bin/env node
/**
 * Unit coverage for the CEO Daily Operating Dashboard template
 * (CEO_PRIMITIVE_COCKPIT_ROADMAP_V1 — product-taste companion surface).
 *
 * Proves the template is a real, valid dashboard template — not a new
 * registry, route, or object type:
 *   - it exists in the existing DASHBOARD_TEMPLATES with a clean name/desc
 *   - it uses only known widget kinds and a non-overlapping, in-bounds grid
 *   - it clones through the existing cloneTemplateToDashboard path
 *   - the cloned dashboard passes the existing validateWorkspaceConfig
 *   - every binding is manual/sample (no fake live-data claim)
 *
 * Run with:  node --test scripts/unit-ceo-dashboard-template.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js"
);

const schema = await import(pathToFileURL(schemaPath).href);
const {
  DASHBOARD_TEMPLATES,
  GRID_COLUMNS,
  GRID_ROWS,
  KNOWN_WIDGET_KINDS,
  KNOWN_DATA_BINDING_MODES,
  cloneTemplateToDashboard,
  validateWorkspaceConfig,
} = schema;

const TEMPLATE_ID = "ceo-daily-operating";

function getTemplate() {
  return DASHBOARD_TEMPLATES.find((t) => t.id === TEMPLATE_ID);
}

test("the CEO Daily Operating Dashboard template exists with a clean identity", () => {
  const tpl = getTemplate();
  assert.ok(tpl, "template present in DASHBOARD_TEMPLATES");
  assert.equal(tpl.name, "CEO Daily Operating Dashboard");
  assert.equal(typeof tpl.description, "string");
  assert.ok(tpl.description.length > 20);
  assert.ok(Array.isArray(tpl.widgets) && tpl.widgets.length === 6, "six widgets");
});

test("every widget uses a known kind and an in-bounds, non-overlapping grid slot", () => {
  const tpl = getTemplate();
  const occupied = new Map();
  for (const w of tpl.widgets) {
    assert.ok(KNOWN_WIDGET_KINDS.includes(w.kind), `known kind: ${w.kind}`);
    assert.ok(typeof w.title === "string" && w.title, "non-empty title");
    const { x, y, width, height } = { x: w.position.x, y: w.position.y, width: w.position.w, height: w.position.h };
    assert.ok(x >= 0 && width >= 1 && x + width <= GRID_COLUMNS, `${w.title} fits columns`);
    assert.ok(y >= 0 && height >= 1 && y + height <= GRID_ROWS, `${w.title} fits rows`);
    for (let dx = 0; dx < width; dx += 1) {
      for (let dy = 0; dy < height; dy += 1) {
        const cell = `${x + dx}:${y + dy}`;
        assert.ok(!occupied.has(cell), `${w.title} does not overlap ${occupied.get(cell)} at ${cell}`);
        occupied.set(cell, w.title);
      }
    }
  }
});

test("every binding is manual/sample — no fake live-data claim", () => {
  const tpl = getTemplate();
  for (const w of tpl.widgets) {
    const binding = w.config?.binding;
    if (!binding) continue;
    assert.ok(KNOWN_DATA_BINDING_MODES.includes(binding.mode), `binding mode known: ${binding.mode}`);
    // The template ships no live binding — only manual sample data.
    assert.equal(binding.mode, "manual", `${w.title} binding is manual (sample), not live`);
  }
});

test("the template clones and the resulting dashboard passes validateWorkspaceConfig", () => {
  const tpl = getTemplate();
  let n = 0;
  const idFactory = (kind) => `${kind}-${(n += 1)}`;
  // cloneTemplateToDashboard runs validateWorkspaceTemplate internally — it
  // throws if the template (grid/kinds/config) is invalid.
  const { dashboard, tab } = cloneTemplateToDashboard(tpl, { idFactory });
  const config = {
    dashboards: [
      { ...dashboard, tabs: [tab], activeTabId: tab.id },
    ],
  };
  // Throws on any schema error — a clean return means the dashboard is valid.
  assert.doesNotThrow(() => validateWorkspaceConfig(config));
  assert.equal(tab.widgets.length, 6);
});
