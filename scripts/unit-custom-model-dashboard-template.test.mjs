#!/usr/bin/env node
/**
 * Unit coverage for the Custom Model Operating Dashboard template — the
 * super-admin observability companion to /custom-models and /training.
 *
 * Mirrors the CEO Daily Operating Dashboard test exactly: it proves the
 * template is a real, valid entry in the EXISTING DASHBOARD_TEMPLATES registry
 * surfaced by the template gallery modal — not a new registry, route, object
 * type, or live-data claim:
 *   - it exists with a clean name/description
 *   - only known widget kinds; in-bounds, non-overlapping grid
 *   - every binding is manual/sample (no fake live-data claim)
 *   - it clones through the existing cloneTemplateToDashboard path and the
 *     cloned dashboard passes validateWorkspaceConfig
 *
 * Run with:  node --test scripts/unit-custom-model-dashboard-template.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js",
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

const TEMPLATE_ID = "custom-model-operating";
const getTemplate = () => DASHBOARD_TEMPLATES.find((t) => t.id === TEMPLATE_ID);

test("the Custom Model Operating Dashboard template exists with a clean identity", () => {
  const tpl = getTemplate();
  assert.ok(tpl, "template present in the existing DASHBOARD_TEMPLATES");
  assert.equal(tpl.name, "Custom Model Operating Dashboard");
  assert.equal(typeof tpl.description, "string");
  assert.ok(tpl.description.length > 20);
  assert.ok(Array.isArray(tpl.widgets) && tpl.widgets.length === 7, "seven widgets");
  assert.ok(tpl.widgets.some((w) => w.title === "Custom Models"), "includes the Custom Models widget");
  assert.ok(tpl.widgets.some((w) => w.title === "Verification & Invocation Proof"), "includes the proof widget");
  assert.ok(tpl.widgets.some((w) => w.title === "Improvement Gaps"), "includes the gaps widget");
});

test("every widget uses a known kind and an in-bounds, non-overlapping grid slot", () => {
  const tpl = getTemplate();
  const occupied = new Map();
  for (const w of tpl.widgets) {
    assert.ok(KNOWN_WIDGET_KINDS.includes(w.kind), `known kind: ${w.kind}`);
    assert.ok(typeof w.title === "string" && w.title, "non-empty title");
    const { x, y, w: width, h: height } = w.position;
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

test("every binding is manual/sample — no fake live-data claim (live data lives in the cockpits)", () => {
  const tpl = getTemplate();
  for (const w of tpl.widgets) {
    const binding = w.config?.binding;
    if (!binding) continue;
    assert.ok(KNOWN_DATA_BINDING_MODES.includes(binding.mode), `binding mode known: ${binding.mode}`);
    assert.equal(binding.mode, "manual", `${w.title} binding is manual (sample), not live`);
  }
});

test("the template clones and the resulting dashboard passes validateWorkspaceConfig", () => {
  const tpl = getTemplate();
  let n = 0;
  const idFactory = (kind) => `${kind}-${(n += 1)}`;
  const { dashboard, tab } = cloneTemplateToDashboard(tpl, { idFactory });
  const config = { dashboards: [{ ...dashboard, tabs: [tab], activeTabId: tab.id }] };
  assert.doesNotThrow(() => validateWorkspaceConfig(config));
  assert.equal(tab.widgets.length, 7);
});
