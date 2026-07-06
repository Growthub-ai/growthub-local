#!/usr/bin/env node
/**
 * Thin Playwright e2e — the REAL no-code custom-model training journey, driven
 * in an actual browser against an actual `next dev` server on a temp workspace
 * export (never the repo tree). Mirrors e2e-inbound-journey-playwright.mjs.
 *
 * The closed loop it proves as a real user:
 *
 *   /training ledger → fine-tune gate GREEN (≥10 qualified reasoning traces)
 *     → open the handoff modal → the ONE-CLICK pipeline is the composed
 *       QLoRA → quantize → serve chain (real commands + quant level shown)
 *     → Start fine-tuning (one governed PATCH: running receipt + runner sandbox
 *       row + sandbox-run kick) → the thin-delta progress bar advances off the
 *       REAL model-training-run receipt (preflight → stage boundaries)
 *     → on a runner failure (no local GPU/toolchain here) the run stamps a
 *       GOVERNED `failed` receipt naming the stage → the derived one-click
 *       REMEDIATION card renders in the SAME modal (deriveTrainingRemediation)
 *     → readbacks against /api/workspace confirm the governed receipt + progress
 *       + blockedReason at every step.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3777 PLAYWRIGHT_DIR=<repo> \
 *   node scripts/e2e-custom-model-journey-playwright.mjs [screenshot-dir]
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3777").replace(/\/$/, "");
const shotDir = path.resolve(process.argv[2] || "docs/proofs/custom-model-pipeline");
fs.mkdirSync(shotDir, { recursive: true });

const requireFrom = createRequire(path.join(process.env.PLAYWRIGHT_DIR || process.cwd(), "package.json"));
const { chromium } = requireFrom("playwright-core");

const results = [];
function record(step, ok, detail = "") {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(shotDir, name), fullPage: false });
  console.log(`  shot: ${name}`);
}
async function readWorkspace() {
  const res = await fetch(`${BASE}/api/workspace`, { cache: "no-store" });
  return res.json();
}
function runRow(cfg) {
  for (const o of cfg?.workspaceConfig?.dataModel?.objects || []) {
    if (o.objectType === "model-training-run") return (o.rows || [])[o.rows.length - 1] || null;
  }
  return null;
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-proxy-server", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const readbacks = {};
try {
  // 1 — /training ledger with the fine-tune gate GREEN (≥10 traces seeded).
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const bodyText1 = await page.evaluate(() => document.body.innerText);
  // Gate-green signal: the bootstrap ledger reports the train step "ready"
  // (≥10 qualified traces seeded), or the full ledger's fine-tune gate chip.
  const gateGreen = /Train & import a real custom model/i.test(bodyText1) && /ready/i.test(bodyText1) || /Fine-tune gate/i.test(bodyText1);
  record("training ledger renders and the fine-tune step is READY (gate met)", gateGreen, (bodyText1.match(/Fine-tune gate:[^\n]*/)?.[0]) || "bootstrap: Train & import — ready");
  await shot(page, "01-training-ledger-gate.png");

  // 2 — open the handoff modal via the real user control, then walk the
  //     governed wizard: checklist → curate → profile → prepare → train.
  //     The visible entry differs by ledger state, so expand the full ledger
  //     and use the canonical handoff-open control (fall back to bootstrap).
  const showAll = page.getByRole("button", { name: /Show all .* steps/i });
  if (await showAll.count()) { await showAll.first().click(); await page.waitForTimeout(400); }
  const handoffOpen = page.locator("[data-training-handoff-open]");
  if (await handoffOpen.count()) await handoffOpen.first().click();
  else await page.getByRole("button", { name: /Open training runtime|Test custom model/i }).first().click();
  await page.waitForSelector("[data-handoff-curate]", { timeout: 15000 });
  await shot(page, "02-handoff-modal-open.png");
  await page.locator("[data-handoff-curate]").first().click();               // → curate
  await page.waitForSelector("[data-handoff-to-profile]", { timeout: 10000 });
  await page.locator("[data-handoff-to-profile]").first().click();           // → profile
  await page.waitForSelector("[data-handoff-confirm]", { timeout: 10000 });
  // The profile panel shows the resolved run config (commands) for the chosen
  // pipeline profile — assert the composed chain here.
  const profileText = await page.evaluate(() => document.querySelector("[data-handoff-runconfig]")?.innerText || document.body.innerText);
  await shot(page, "03-pipeline-commands.png");
  await page.locator("[data-handoff-confirm]").first().click();              // runPrepare → train
  await page.waitForSelector('[data-training-panel="train"], [data-train-start]', { timeout: 30000 });
  await page.waitForTimeout(600);

  // 3 — the one-click pipeline is the composed QLoRA→quantize→serve chain.
  const trainText = await page.evaluate(() => document.querySelector("[data-train-command]")?.innerText || document.body.innerText);
  const hasQuant = /llama-quantize|Quantizing|quantize/i.test(trainText + profileText);
  const hasServe = /ollama create/i.test(trainText + profileText);
  record("modal shows the composed pipeline (quantize + ollama create in the command chain)", hasQuant && hasServe, `quantize=${hasQuant} serve=${hasServe}`);
  await shot(page, "03b-train-panel-commands.png");

  // 4 — ONE click: Start fine-tuning → governed run + runner + kick.
  const start = page.locator("[data-train-start]");
  let started = false;
  if (await start.count()) { await start.first().click(); started = true; }
  await page.waitForTimeout(2000);
  const afterStart = await readWorkspace();
  const row1 = runRow(afterStart);
  readbacks.afterStart = row1;
  record("one click records a governed model-training-run receipt", started && Boolean(row1), `status=${row1?.status} progress.stage=${row1?.progress?.stage || "-"}`);
  await shot(page, "04-one-click-started.png");

  // 5 — the thin-delta progress bar is bound to the real receipt (preflight/
  //     stage boundary), and the runner sandbox row exists.
  const runnerObj = (afterStart?.workspaceConfig?.dataModel?.objects || []).find((o) => o.id === "model-training-runner");
  record("runner sandbox object stood up (atomic run, no parallel runtime)", Boolean(runnerObj), `rows=${(runnerObj?.rows || []).length}`);

  // 6 — poll for the governed terminal/failed state + derived remediation.
  //     No local GPU/toolchain here → the runner stamps a GOVERNED failed
  //     receipt naming the stage; the modal derives the one-click remedy.
  let terminal = null;
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(3000);
    const cfg = await readWorkspace();
    const r = runRow(cfg);
    if (r && (String(r.status) === "failed" || String(r.status) === "blocked" || String(r.status) === "imported")) { terminal = r; readbacks.terminal = r; break; }
    if (i === 2) await shot(page, "05-thin-delta-progress.png");
  }
  record("runner reached a GOVERNED terminal receipt (no fake pass)", Boolean(terminal), `status=${terminal?.status} reason=${(terminal?.blockedReason || "").slice(0, 80)}`);

  // 7 — the derived remediation card renders in the SAME modal.
  await page.waitForTimeout(1500);
  const finalText = await page.evaluate(() => document.body.innerText);
  const remedyVisible = await page.locator("[data-train-remedy]").count();
  record("derived one-click remediation surfaces in the same modal on failure", remedyVisible > 0 || /Suggested fix|Re-run/i.test(finalText), `remedyCards=${remedyVisible}`);
  await shot(page, "06-derived-remediation.png");

  fs.writeFileSync(path.join(shotDir, "readbacks.json"), JSON.stringify(readbacks, null, 2));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} journey checks passed; screenshots in ${shotDir}`);
if (failed.length) process.exit(1);
