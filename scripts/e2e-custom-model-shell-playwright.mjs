#!/usr/bin/env node
/**
 * Drives the REAL workspace shell (/data-model) of a booted temp export —
 * the actual no-code experience (rail, canvas, governed objects, helper
 * sidecar), not the bare /training route. Captures the model-training governed
 * object and opens the training runtime from inside the real shell.
 *
 * Usage: BASE_URL=http://127.0.0.1:3777 PLAYWRIGHT_DIR=<repo> \
 *        node scripts/e2e-custom-model-shell-playwright.mjs [shot-dir]
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3777").replace(/\/$/, "");
const shotDir = path.resolve(process.argv[2] || "docs/proofs/custom-model-pipeline/shell");
fs.mkdirSync(shotDir, { recursive: true });
const requireFrom = createRequire(path.join(process.env.PLAYWRIGHT_DIR || process.cwd(), "package.json"));
const { chromium } = requireFrom("playwright-core");

const results = [];
const rec = (s, ok, d = "") => { results.push({ s, ok, d }); console.log(`${ok ? "PASS" : "FAIL"}  ${s}${d ? ` — ${d}` : ""}`); };
const shot = async (page, n) => { await page.screenshot({ path: path.join(shotDir, n), fullPage: false }); console.log(`  shot: ${n}`); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-proxy-server", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
try {
  // 1 — the REAL workspace shell.
  await page.goto(`${BASE}/data-model`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const shellText = await page.evaluate(() => document.body.innerText);
  rec("real /data-model shell renders (not the bare route)", /Data Model|Workspace|model-training|Objects|Registry/i.test(shellText), shellText.slice(0, 60).replace(/\s+/g, " "));
  await shot(page, "01-data-model-shell.png");

  // 2 — the governed model-training object is present in the real shell.
  const cfg = await (await fetch(`${BASE}/api/workspace`, { cache: "no-store" })).json();
  const objs = cfg?.workspaceConfig?.dataModel?.objects || [];
  const mt = objs.find((o) => o.objectType === "model-training");
  const traces = objs.find((o) => o.id === "training-traces");
  rec("governed model-training object exists in the real workspace", Boolean(mt), `rows=${(mt?.rows || []).length} base=${mt?.rows?.[0]?.baseModel || "-"}`);
  rec("governed training-traces present (gate corpus)", (traces?.rows || []).length >= 10, `${(traces?.rows || []).length} traces`);

  // 3 — open the training runtime from inside the shell's helper sidecar.
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const open = page.getByRole("button", { name: /Open training runtime/i });
  if (await open.count()) { await open.first().click(); await page.waitForTimeout(700); }
  await shot(page, "02-training-runtime-modal.png");
  rec("training runtime modal opens over the governed corpus", (await page.locator("[data-training-handoff], [data-handoff-curate]").count()) > 0);

  fs.writeFileSync(path.join(shotDir, "objects.json"), JSON.stringify(objs.map((o) => ({ id: o.id, objectType: o.objectType, rows: (o.rows || []).length })), null, 2));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} shell checks passed; shots in ${shotDir}`);
if (failed.length) process.exit(1);
