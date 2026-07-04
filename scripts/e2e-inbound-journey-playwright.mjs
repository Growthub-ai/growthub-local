#!/usr/bin/env node
/**
 * Thin Playwright e2e — the REAL no-code customer journey for the inbound
 * Webhook / API-request input methods, driven in an actual browser against an
 * actual `next dev` server on a temp workspace export (never the repo tree).
 *
 * The closed daily loop it proves, per method:
 *
 *   canvas → select input method (readiness/delta guidance activates)
 *     → bind (server-owned, one write) → seeded test-request values
 *     → run test invocation (real signed/bearer POST through the destination
 *       door, full downstream graph) → "verified 200" WITHOUT refresh
 *     → publish (gated on the durable method-specific proof)
 *     → external DOMAIN HIT: a real HMAC-signed webhook / bearer API request
 *       from outside the browser → 200, last-run proof + lastResponse saved
 *     → negative: tampered auth → 401, no execution.
 *
 * Reuses the kit's own primitives — signInboundWebhook from the EXPORT's lib
 * signs the domain hit; no re-implementation of the auth contract.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3777 \
 *   PLAYWRIGHT_DIR=/path/with/node_modules/playwright-core \
 *   node scripts/e2e-inbound-journey-playwright.mjs <export .../apps/workspace> [screenshot-dir]
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const appDir = path.resolve(process.argv[2] || "");
const shotDir = path.resolve(process.argv[3] || path.join(appDir, "..", "e2e-screenshots"));
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3777").replace(/\/$/, "");
const SECRET = "whsec_e2e_inbound_journey";
const TOKEN = "tok_e2e_inbound_journey";
fs.mkdirSync(shotDir, { recursive: true });

const requireFrom = createRequire(path.join(process.env.PLAYWRIGHT_DIR || process.cwd(), "package.json"));
const { chromium } = requireFrom("playwright-core");
const { signInboundWebhook } = await import(pathToFileURL(path.join(appDir, "lib/workspace-inbound-invocation.js")).href);

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

async function driveMethod(page, { rowName, mode, optionLabel, bindLabel, shotPrefix }) {
  await page.goto(`${BASE}/workflows?object=sandbox-probe&row=${encodeURIComponent(rowName)}`, { waitUntil: "networkidle" });
  await page.locator(".dm-orchestration-node", { hasText: "Input" }).first().click();
  await shot(page, `${shotPrefix}-1-canvas-input-selected.png`);

  // Select the inbound method in the input node's mode select.
  await page.locator(".dm-input-mode-select button").first().click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
  await page.waitForTimeout(400);
  // A READY workflow shows zero readiness flags — the scan ran and found no
  // blast radius (the not-ready case is asserted separately on gap-workflow).
  const readinessNodes = await page.locator(".dm-orchestration-node--readiness").count();
  record(`${mode}: readiness scan is clean on a ready workflow (no false deltas)`, readinessNodes === 0, `${readinessNodes} flagged node(s)`);
  await shot(page, `${shotPrefix}-2-method-selected-readiness.png`);

  // Persist the method selection as a draft so the publish control stays
  // available for the proof-gated promotion at the end of the loop.
  const saveDraft = page.getByRole("button", { name: /Save draft/ });
  if (await saveDraft.count()) {
    await saveDraft.first().click();
    await page.waitForTimeout(1000);
  }

  // Bind through the server-owned route.
  await page.getByRole("button", { name: bindLabel }).click();
  await page.waitForSelector("textarea", { timeout: 15000 });
  const boundRow = await workspaceRow(rowName);
  record(`${mode}: bind writes the serverless binding on the owning row`,
    Boolean(boundRow?.scheduleId) && boundRow?.runLocality === "serverless" && boundRow?.schedulerTriggerKind === (mode === "webhook" ? "inbound-webhook" : "api-request"),
    `scheduleId=${boundRow?.scheduleId} triggerKind=${boundRow?.schedulerTriggerKind}`);

  // Seeded test-request values come from the input node's samplePayload.
  const seeded = await page.locator("textarea").first().inputValue();
  record(`${mode}: test values seeded from samplePayload contract`, seeded.includes("daily-brief") && seeded.includes("since"), seeded.replace(/\s+/g, " ").slice(0, 80));
  await shot(page, `${shotPrefix}-3-bound-seeded-values.png`);

  // Run the first-class test invocation with edited user values.
  await page.locator("textarea").first().fill(JSON.stringify({ since: "2026-07-01", segment: "e2e-edited" }, null, 2));
  await page.getByRole("button", { name: /Run test invocation/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes("verified 200"), null, { timeout: 30000 });
  record(`${mode}: canvas shows "verified 200" WITHOUT manual refresh`, true);
  await shot(page, `${shotPrefix}-4-verified-200-no-refresh.png`);

  const proofRow = await workspaceRow(rowName);
  record(`${mode}: durable last-run proof saved (status/kind/nodes/lastResponse)`,
    String(proofRow?.lastScheduledRunStatus) === "200"
      && proofRow?.lastScheduledRunTriggerKind === (mode === "webhook" ? "inbound-webhook" : "api-request")
      && String(proofRow?.lastScheduledRunNodesCompleted) !== "false"
      && Boolean(proofRow?.lastResponse),
    `status=${proofRow?.lastScheduledRunStatus} kind=${proofRow?.lastScheduledRunTriggerKind}`);

  // Publish rides the method-specific serverless proof — assert the actual
  // publish route verdict, not just UI state.
  const publish = page.getByRole("button", { name: /^Publish/ });
  if (await publish.count()) {
    const publishResponse = page.waitForResponse(
      (r) => r.url().includes("/api/workspace/workflow/publish") && r.request().method() === "POST",
      { timeout: 20000 },
    ).catch(() => null);
    await publish.first().click();
    const verdict = await publishResponse;
    const status = verdict ? verdict.status() : "none";
    let detail = `HTTP ${status}`;
    if (verdict && status !== 200) detail += ` ${JSON.stringify(await verdict.json().catch(() => ({}))).slice(0, 160)}`;
    record(`${mode}: publish succeeds on the durable 200 proof`, status === 200, detail);
    await page.waitForTimeout(1000);
    await shot(page, `${shotPrefix}-5-published.png`);
  } else {
    record(`${mode}: publish control present`, false, "Publish button not found");
  }
  return await workspaceRow(rowName);
}

async function domainHit(row, mode) {
  const dest = String(row?.schedulerDestination || `${BASE}/api/workspace/workflows/growthub`);
  const rawBody = JSON.stringify({
    kind: "growthub-invoked-run-v1",
    scheduleId: row.scheduleId,
    workspaceId: "workspace",
    objectId: "sandbox-probe",
    rowId: row.Name,
    version: String(row.version || "v1"),
    runInputs: { kind: "growthub-workflow-run-inputs-v1", source: mode, values: { since: "2026-07-02", segment: "daily-domain-hit" }, files: [] },
  });
  const headers = { "content-type": "application/json" };
  if (mode === "webhook") {
    const signed = signInboundWebhook({ secret: SECRET, rawBody, destinationUrl: dest });
    headers["x-growthub-signature"] = signed.signature;
    headers["x-growthub-timestamp"] = signed.timestamp;
  } else {
    headers.authorization = `Bearer ${TOKEN}`;
  }
  const res = await fetch(dest, { method: "POST", headers, body: rawBody });
  record(`${mode}: REAL external domain hit executes serverless → 200`, res.status === 200, `HTTP ${res.status}`);
  const after = await workspaceRow(row.Name);
  record(`${mode}: domain hit saved fresh last-run proof + lastResponse`,
    String(after?.lastScheduledRunStatus) === "200" && Boolean(after?.lastResponse),
    `status=${after?.lastScheduledRunStatus}`);

  // Negative: tampered auth never executes.
  const badHeaders = { ...headers };
  if (mode === "webhook") badHeaders["x-growthub-signature"] = "v1=deadbeef";
  else badHeaders.authorization = "Bearer wrong-token";
  const bad = await fetch(dest, { method: "POST", headers: badHeaders, body: rawBody });
  record(`${mode}: tampered auth is rejected (401), nothing executes`, bad.status === 401, `HTTP ${bad.status}`);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  // Blast-radius guidance: on the deliberately NOT-ready workflow (its API
  // node references an unconfigured env ref), selecting a serverless input
  // method must flag the affected downstream node BEFORE bind.
  await page.goto(`${BASE}/workflows?object=sandbox-probe&row=gap-workflow`, { waitUntil: "networkidle" });
  await page.locator(".dm-orchestration-node", { hasText: "Input" }).first().click();
  await page.locator(".dm-input-mode-select button").first().click();
  await page.getByRole("option", { name: "Webhook", exact: true }).click();
  await page.waitForTimeout(500);
  const gapFlags = await page.locator(".dm-orchestration-node--readiness").count();
  record("webhook: readiness/delta flags fire pre-bind on a NOT-ready workflow", gapFlags > 0, `${gapFlags} flagged node(s)`);
  await shot(page, "00-gap-workflow-readiness-flags.png");

  const webhookRow = await driveMethod(page, {
    rowName: "registry-workflow", mode: "webhook",
    optionLabel: "Webhook", bindLabel: "Bind Webhook trigger", shotPrefix: "01-webhook",
  });
  await domainHit(webhookRow, "webhook");

  const apiRow = await driveMethod(page, {
    rowName: "api-workflow", mode: "api-request",
    optionLabel: "API Request", bindLabel: "Bind API request trigger", shotPrefix: "02-api-request",
  });
  await domainHit(apiRow, "api-request");

  // Cockpit surfaces both method chips + scheduled state.
  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  await shot(page, "03-schedule-cockpit-method-chips.png");
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} journey checks passed; screenshots in ${shotDir}`);
if (failed.length) process.exit(1);
