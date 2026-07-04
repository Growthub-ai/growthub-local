#!/usr/bin/env node
/**
 * Thin Playwright e2e — the REAL daily habitual loop for the /pulse autonomic
 * cockpit, driven in an actual browser against an actual `next dev` server on
 * a temp workspace export (never the repo tree). Mirrors
 * e2e-inbound-journey-playwright.mjs in shape and proof bar.
 *
 * The closed behavior loop it proves (cue → action → reward):
 *
 *   CUE     rail "Ask helper" → type "/pulse" → Pulse Cockpit: 1 stalled
 *           workflow holds the attention slot; no-stalls policy finding fires
 *           (critical); the beat policy flags the missing pulse workflow.
 *   ACTION  the stalled card's recovery hand-off opens the workflow canvas
 *           (binding-aware: an unbound row never targets a provider route)
 *           → bind the native API Request input method → run a REAL test
 *           invocation through the destination door (full downstream graph,
 *           attempt stamped pre-run, completion proof written).
 *   REWARD  back in /pulse WITHOUT any hand-editing: the card is healthy,
 *           stalled count is 0, the no-stalls finding is GONE — the loop the
 *           user repeats daily closes with real state, not optimism.
 *   REALITY an external bearer domain hit (outside the browser) returns 200
 *           and refreshes proof; tampered auth returns 401 and changes nothing.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3779 \
 *   PLAYWRIGHT_DIR=<export .../apps/workspace> \
 *   node scripts/e2e-pulse-journey-playwright.mjs <export .../apps/workspace> [screenshot-dir]
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const appDir = path.resolve(process.argv[2] || "");
const shotDir = path.resolve(process.argv[3] || path.join(appDir, "..", "pulse-e2e-screenshots"));
// localhost (not 127.0.0.1): Next dev blocks cross-origin dev resources from
// the IP form, which strands the shell on "Loading workspace…".
const BASE = String(process.env.BASE_URL || "http://localhost:3779").replace(/\/$/, "");
const TOKEN = "tok_e2e_pulse_journey";
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
async function workspaceRow(name) {
  const res = await fetch(`${BASE}/api/workspace`, { cache: "no-store" });
  const payload = await res.json();
  for (const obj of payload?.workspaceConfig?.dataModel?.objects || []) {
    for (const row of obj.rows || []) if (String(row?.Name || "") === name) return row;
  }
  return null;
}

/** Open the helper sidecar from the rail and enter the /pulse cockpit. */
async function openPulseCockpit(page, shotName) {
  await page.goto(`${BASE}/data-model`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.body.innerText.includes("Loading workspace"), null, { timeout: 60000 });
  await page.locator('[data-helper-trigger="rail"]').first().click();
  await page.waitForSelector("[data-helper-sidecar]", { timeout: 15000 });
  const composer = page.locator(".dm-helper-composer-textarea").first();
  await composer.fill("/pulse");
  await page.waitForSelector('[data-helper-slash-item="/pulse"]', { timeout: 10000 });
  await page.locator('[data-helper-slash-item="/pulse"]').click();
  await page.waitForSelector("[data-pulse-cockpit]", { timeout: 15000 });
  // Give the cockpit's env-status/receipts fetches a beat to land.
  await page.waitForTimeout(1200);
  if (shotName) await shot(page, shotName);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  /* ---------------- CUE: the pulse surfaces the stall ---------------- */
  await openPulseCockpit(page, "01-pulse-cue-stalled.png");

  const title = await page.locator("[data-helper-title]").innerText();
  record("cue: /pulse slash command opens the Pulse Cockpit view", title.trim() === "Pulse Cockpit", title.trim());

  const stalledCard = page.locator('[data-pulse-card="stuck-workflow"]');
  record("cue: stalled workflow surfaces with data-pulse-state=stalled",
    (await stalledCard.count()) > 0 && (await stalledCard.first().getAttribute("data-pulse-state")) === "stalled");

  const counts = await page.locator("[data-pulse-cockpit] .dm-run-console__hint").first().innerText();
  record("cue: counts line reports exactly 1 stalled", counts.includes("1 stalled"), counts);

  const noStalls = page.locator('[data-pulse-finding="no-stalls"]');
  record("cue: no-stalls policy finding fires (critical) from the human rule row",
    (await noStalls.count()) === 1 && (await noStalls.getAttribute("data-pulse-severity")) === "critical");

  const beatFinding = page.locator('[data-pulse-finding="beat"]');
  record("cue: pulse-cadence finding flags the missing workspace-pulse workflow",
    (await beatFinding.count()) === 1 && (await beatFinding.innerText()).includes("Propose pulse workflow"));

  // Binding-aware recovery: the stalled row is UNBOUND, so its hand-off is
  // the canvas — never a provider schedule route it isn't bound to.
  const recoveryLabel = await stalledCard.locator("button", { hasText: "Open & re-run" }).count();
  record("cue: unbound stalled card offers the canvas recovery hand-off", recoveryLabel > 0);

  /* ---------------- ACTION: recovery hand-off → real execution ---------------- */
  await stalledCard.locator("button", { hasText: "Open & re-run" }).first().click();
  await page.waitForURL(/\/workflows\?/, { timeout: 15000 });
  record("action: recovery opens the workflow canvas focused on the stalled row",
    page.url().includes("row=stuck-workflow"), page.url());
  await page.waitForLoadState("networkidle");
  await shot(page, "02-recovery-canvas.png");

  // Bind the native API Request input method and run a REAL test invocation —
  // the same governed journey PR #263 froze (select → save draft → bind →
  // seeded values → run → verified 200 without refresh).
  await page.locator(".dm-orchestration-node", { hasText: "Input" }).first().click();
  await page.locator(".dm-input-mode-select button").first().click();
  await page.getByRole("option", { name: "API Request", exact: true }).click();
  await page.waitForTimeout(400);
  // No draft save: this journey never publishes, and the canvas's client-side
  // PATCH can race the door's proof write with a stale dataModel snapshot.
  await page.getByRole("button", { name: "Bind API request trigger" }).click();
  await page.waitForTimeout(2500);
  const boundRow = await workspaceRow("stuck-workflow");
  record("action: bind writes the serverless binding on the stalled row",
    Boolean(boundRow?.scheduleId) && boundRow?.schedulerTriggerKind === "api-request",
    `scheduleId=${boundRow?.scheduleId}`);

  // Generate → edit → send the REAL test event (the PR #263 governed flow).
  await page.getByRole("button", { name: /Generate Test Event/i }).click();
  const editor = page.locator(".dm-inbound-test-modal .dm-inbound-body textarea");
  await editor.waitFor({ timeout: 15000 });
  await editor.fill(JSON.stringify({ since: "2026-07-03", segment: "pulse-recovery" }, null, 2));
  await page.getByRole("button", { name: /Send test event/ }).click();
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("verified 200"), null, { timeout: 45000 });
  record("action: REAL test event through the door returns Verified 200 without refresh", true);
  await shot(page, "03-recovery-verified-200.png");

  /* ---------------- REALITY: external domain hit, canvas closed ---------------- */
  // Leave the canvas before the external hit: the open canvas adopts the
  // server-synced trigger graph and its client PATCH can race the door's
  // proof write (last-writer-wins). Serverless reality is exactly this: the
  // external system invokes while no browser tab holds the workflow open.
  await page.goto(`${BASE}/data-model`, { waitUntil: "networkidle" });

  const dest = String(boundRow?.schedulerDestination || `${BASE.replace("localhost", "127.0.0.1")}/api/workspace/workflows/growthub`);
  // The binding id embeds the REAL workspace id — the door's triple binding
  // validation (and the inbound lane pick) depend on it matching.
  const wsRes = await fetch(`${BASE}/api/workspace`, { cache: "no-store" });
  const wsId = String((await wsRes.json())?.workspaceConfig?.id || "workspace");
  const rawBody = JSON.stringify({
    kind: "growthub-invoked-run-v1",
    scheduleId: boundRow.scheduleId,
    workspaceId: wsId,
    objectId: "sandbox-probe",
    rowId: "stuck-workflow",
    version: String(boundRow.version || "v1"),
    runInputs: { kind: "growthub-workflow-run-inputs-v1", source: "api-request", values: { since: "2026-07-04", segment: "pulse-domain-hit" }, files: [] },
  });
  const hit = await fetch(dest, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: rawBody });
  const hitBody = await hit.json().catch(() => ({}));
  record("reality: REAL external bearer invocation executes serverless → 200", hit.status === 200, `HTTP ${hit.status}`);
  record("reality: door reports proof persisted for the external run", hitBody?.proofPersisted === true, `proofPersisted=${hitBody?.proofPersisted}`);

  let proofRow = null;
  for (let i = 0; i < 10; i++) {
    proofRow = await workspaceRow("stuck-workflow");
    if (String(proofRow?.lastScheduledRunStatus) === "200") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  record("reality: fresh completion proof lands (attempt stamped pre-run, success after)",
    String(proofRow?.lastScheduledRunStatus) === "200" && Boolean(proofRow?.lastScheduledRunSucceededAt),
    `status=${proofRow?.lastScheduledRunStatus}`);

  const bad = await fetch(dest, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer wrong-token" }, body: rawBody });
  record("reality: tampered auth is rejected (401), nothing executes", bad.status === 401, `HTTP ${bad.status}`);

  /* ---------------- REWARD: the loop closes green ---------------- */
  await openPulseCockpit(page, null);

  const countsAfter = await page.locator("[data-pulse-cockpit] .dm-run-console__hint").first().innerText();
  record("reward: stalled count returns to 0", countsAfter.includes("0 stalled"), countsAfter);

  record("reward: the no-stalls policy finding clears itself",
    (await page.locator('[data-pulse-finding="no-stalls"]').count()) === 0);

  record("reward: the beat finding persists (the pulse still wants its heartbeat workflow)",
    (await page.locator('[data-pulse-finding="beat"]').count()) === 1);

  // The fleet lives on the Checks tab — search + real-state filters at scale.
  await page.locator('[data-pulse-tab="checks"]').click();
  await page.waitForSelector("[data-pulse-list]", { timeout: 10000 });
  const recovered = page.locator('[data-pulse-list] [data-pulse-card="stuck-workflow"]');
  record("reward: the recovered workflow reads Healthy in Checks",
    (await recovered.count()) > 0 && (await recovered.first().getAttribute("data-pulse-state")) === "healthy",
    String(await recovered.first().getAttribute("data-pulse-state")));
  await page.locator(".dm-schedule-search input").fill("stuck");
  record("reward: search narrows the fleet to the matching workflow",
    (await page.locator("[data-pulse-list] [data-pulse-card]").count()) === 1);
  await shot(page, "04-pulse-reward-healthy.png");

  // Policies tab: the rules table is the atomic workspace-policy object.
  await page.locator('[data-pulse-tab="policies"]').click();
  await page.waitForSelector("[data-pulse-policies]", { timeout: 10000 });
  record("policies: the human rules render from the atomic policy rows",
    (await page.locator('[data-pulse-policy="no-stalls"]').count()) === 1
    && (await page.getByRole("button", { name: "New rule" }).count()) === 1);

  // Gear editor → Save writes the SAME atomic workspace-policy row through
  // the governed PATCH lane (no side store).
  await page.locator('[data-pulse-policy="no-stalls"] .dm-swarm-card-action').click();
  await page.waitForSelector("[data-pulse-policy-editor]", { timeout: 10000 });
  await page.locator('[data-pulse-policy-editor] input[type="number"]').fill("0");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("evaluates it on the next beat"), null, { timeout: 15000 });
  record("policies: gear editor saves drafts to the atomic policy row via the governed PATCH lane", true);
  await shot(page, "05-pulse-policies-table.png");

  // Report tab: daily digest + the self-run checklist with governed seeds.
  await page.locator('[data-pulse-tab="report"]').click();
  await page.waitForSelector("[data-pulse-report]", { timeout: 10000 });
  const selfRunSteps = await page.locator("[data-pulse-selfrun]").count();
  record("report: daily digest renders the self-run checklist", selfRunSteps === 5, `${selfRunSteps} steps`);
  record("report: the missing heartbeat step offers its governed seed",
    (await page.locator('[data-pulse-selfrun="heartbeat"] button', { hasText: "Propose heartbeat" }).count()) === 1);
  await shot(page, "06-pulse-report-selfrun.png");
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pulse journey checks passed; screenshots in ${shotDir}`);
if (failed.length) process.exit(1);
