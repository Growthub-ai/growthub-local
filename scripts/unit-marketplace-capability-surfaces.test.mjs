#!/usr/bin/env node
/**
 * Coverage for the capability SURFACES layer (PR #270 follow-on mission):
 *   - install-seeded source objects (surfaces.sourceObjects, declared key)
 *   - the Stripe Commerce dashboard template (native DASHBOARD_TEMPLATES
 *     entry, widgets bound to governed data-model objects, honest empties)
 *   - the stripe-payments source resolver (read-only, server-side env)
 *   - governed email templates (pure lib + messaging-door save action)
 *
 * Pure / offline. Run with:
 *   node --test scripts/unit-marketplace-capability-surfaces.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const schema = await import(pathToFileURL(path.join(kitLib, "workspace-schema.js")).href);
const emailTemplates = await import(pathToFileURL(path.join(kitLib, "workspace-email-templates.js")).href);
const emailSends = await import(pathToFileURL(path.join(kitLib, "workspace-email-sends.js")).href);

const { getMarketplaceProduct, withDeclaredSourceObjects } = addOns;

function emptyConfig() {
  return { dataModel: { objects: [] } };
}

// ---------------------------------------------------------------------------
// Install-seeded source objects (declared contract key)
// ---------------------------------------------------------------------------

test("stripe declares source objects; seeding is add-if-absent and honest-empty", () => {
  const product = getMarketplaceProduct("stripe", "stripe-payments");
  assert.ok(Array.isArray(product.surfaces.sourceObjects) && product.surfaces.sourceObjects.length >= 4, "stripe declares its data-source objects");

  const seeded = withDeclaredSourceObjects(emptyConfig(), product);
  const objects = seeded.dataModel.objects;
  assert.equal(objects.length, product.surfaces.sourceObjects.length, "every declared object seeds");
  const feed = objects.find((object) => object.id === "stripe-payments-feed");
  assert.equal(feed.objectType, "data-source");
  assert.deepEqual(feed.rows, [], "rows start EMPTY — honest until the first refresh");
  assert.equal(feed.binding.sourceStorage, "workspace-source-records", "hydrates through the refresh-sources lane");
  assert.equal(feed.binding.integrationId, "stripe-payments", "binding names the governed row's integration");
  assert.equal(feed.binding.sourceId, "payment-intents");

  // Add-if-absent: re-install never clobbers (simulate user-hydrated rows).
  const withRows = {
    dataModel: {
      objects: seeded.dataModel.objects.map((object) =>
        object.id === "stripe-payments-feed" ? { ...object, rows: [{ id: "pi_1" }] } : object),
    },
  };
  const reSeeded = withDeclaredSourceObjects(withRows, product);
  const feedAfter = reSeeded.dataModel.objects.find((object) => object.id === "stripe-payments-feed");
  assert.deepEqual(feedAfter.rows, [{ id: "pi_1" }], "re-install is a no-op for existing objects");

  // Products with no declaration are untouched (the long tail).
  const resend = getMarketplaceProduct("resend", "resend-email");
  const unchanged = withDeclaredSourceObjects(emptyConfig(), resend);
  assert.deepEqual(unchanged.dataModel.objects, [], "no declaration → no seeding");
});

test("products/sync install path seeds declared source objects (source truth)", () => {
  const routeSource = readFileSync(
    path.join(kitLib, "..", "app/api/workspace/add-ons/providers/[providerId]/products/sync/route.js"),
    "utf8",
  );
  assert.ok(routeSource.includes("withDeclaredSourceObjects(nextConfig, product)"), "generic route interprets the declared key — no provider fork");
});

// ---------------------------------------------------------------------------
// Stripe Commerce dashboard template (native gallery entry)
// ---------------------------------------------------------------------------

test("Stripe Commerce ships as a native dashboard template bound to governed objects", () => {
  const template = (schema.DASHBOARD_TEMPLATES || []).find((entry) => entry.id === "stripe-commerce");
  assert.ok(template, "stripe-commerce template registered in DASHBOARD_TEMPLATES");
  assert.ok(template.widgets.length >= 5, "revenue/balance/payments/customers/products widgets present");
  const bound = template.widgets.filter((widget) => widget.config?.binding?.sourceType === "workspace-data-model");
  assert.ok(bound.length >= 5, "widgets bind data-model objects, not inline provider calls");
  const objectIds = new Set(bound.map((widget) => widget.config.binding.objectId));
  for (const id of ["stripe-payments-feed", "stripe-balance", "stripe-customers", "stripe-products"]) {
    assert.ok(objectIds.has(id), `template binds seeded object ${id}`);
  }
  for (const widget of bound) {
    assert.deepEqual(widget.config.rows ?? [], [], "no fake sample rows — honest empty until refresh");
  }
  const templateText = JSON.stringify(template);
  assert.ok(!/sk_test|sk_live|STRIPE_SECRET/.test(templateText), "template carries no secret material or env names");
});

test("Stripe Commerce template APPLIES through the real gallery clone path (regression: validator grammar)", () => {
  // The browser proof pack caught the template failing validateWorkspaceTemplate
  // on the actual "Use Here"/"New Dashboard" click (invalid chartType, string
  // axes, integration-mode bindings without integrationId/lane). Exercise the
  // exact clone path the gallery buttons call so a grammar drift can never
  // ship as a dead gallery card again.
  const template = (schema.DASHBOARD_TEMPLATES || []).find((entry) => entry.id === "stripe-commerce");
  assert.ok(template, "stripe-commerce template registered");
  let counter = 0;
  const idFactory = (prefix) => `${prefix}-test-${counter += 1}`;
  const tab = schema.cloneTemplateToTab(template, { tabName: template.name, idFactory });
  assert.equal(tab.widgets.length, template.widgets.length, "Use Here clone keeps every widget");
  const { dashboard } = schema.cloneTemplateToDashboard(template, { idFactory });
  assert.equal(dashboard.name, "Stripe Commerce", "New Dashboard clone carries the template name");
  // Every non-manual-text widget binds the builder's own data-model grammar
  // (mode manual + sourceType workspace-data-model + objectId), mirroring how
  // the builder itself writes bindings when a user picks a data-model source.
  const bound = template.widgets.filter((widget) => widget.config?.binding?.sourceType === "workspace-data-model");
  for (const widget of bound) {
    assert.equal(widget.config.binding.mode, "manual", `${widget.title} uses the builder's data-model binding mode`);
    assert.equal(widget.config.binding.sourceAuthority, "workspace-config", `${widget.title} declares workspace-config authority`);
  }
  const chart = template.widgets.find((widget) => widget.kind === "chart");
  assert.ok(schema.KNOWN_CHART_TYPES.includes(chart.config.chartType), "chart type comes from the validator's allowlist");
  assert.equal(typeof chart.config.xAxis, "object", "xAxis is ChartAxisConfig, not a bare string");
  assert.ok(schema.KNOWN_AGGREGATIONS.includes(chart.config.yAxis.aggregation), "yAxis aggregation is a known aggregation");
});

// ---------------------------------------------------------------------------
// stripe-payments source resolver (read-only, server-side)
// ---------------------------------------------------------------------------

test("stripe-payments resolver is registered, read-only, and server-side only", () => {
  const resolverSource = readFileSync(
    path.join(kitLib, "adapters/integrations/resolvers/stripe-payments.js"),
    "utf8",
  );
  assert.ok(resolverSource.includes('registerSourceResolver({') && resolverSource.includes('integrationId: "stripe-payments"'), "auto-registers in the source-resolver registry");
  assert.ok(!/method:\s*["'](POST|PUT|PATCH|DELETE)/i.test(resolverSource), "no mutation verbs — read-only lane by construction");
  for (const path_ of ["/v1/payment_intents", "/v1/customers", "/v1/products", "/v1/balance"]) {
    assert.ok(resolverSource.includes(path_), `covers ${path_}`);
  }
  assert.ok(resolverSource.includes("STRIPE_SECRET_KEY") && resolverSource.includes("STRIPE_API_URL"), "same env contract as the marketplace probe (incl. offline-QA override)");
  assert.ok(!resolverSource.includes("NEXT_PUBLIC"), "nothing browser-exposed");
});

// ---------------------------------------------------------------------------
// Governed email templates (pure lib + door action)
// ---------------------------------------------------------------------------

test("email templates: validate → upsert (idempotent) → list round-trip", () => {
  const bad = emailTemplates.validateEmailTemplate({ name: "x", subject: "", html: "", text: "" });
  assert.equal(bad.ok, false, "underspecified templates are refused");

  const good = emailTemplates.validateEmailTemplate({ name: "Welcome", subject: "Hi {{input.name}}", html: "<p>Hello</p>" });
  assert.equal(good.ok, true);

  let config = emptyConfig();
  ({ config } = emailTemplates.withEmailTemplateUpsert(config, { ...good.template, nowIso: "2026-07-05T01:00:00.000Z" }));
  ({ config } = emailTemplates.withEmailTemplateUpsert(config, { ...good.template, subject: "Hi again {{input.name}}", nowIso: "2026-07-05T02:00:00.000Z" }));
  const object = emailTemplates.findEmailTemplatesObject(config);
  assert.equal(object.rows.length, 1, "upsert by Name is idempotent");
  const listed = emailTemplates.listEmailTemplates(config);
  assert.equal(listed[0].subject, "Hi again {{input.name}}", "latest content wins");
  assert.equal(listed[0].updatedAt, "2026-07-05T02:00:00.000Z");
  assert.equal(object.objectType, "data-source", "templates live on the governed object grammar");
});

test("email templates are ATOMIC blueprints (identity, version) — performance lives on SENDS, not templates", () => {
  // Agent-teams grammar on the blueprint: slug id, capital-N identity,
  // status, version, createdAt/updatedAt, lastUsedAt. NO performance
  // counters here — the sent email is the unit of tracking intelligence.
  const good = emailTemplates.validateEmailTemplate({
    name: "Launch Welcome", subject: "Hi {{input.name}}", previewText: "Your workspace is live", html: "<p>Hello</p>",
  });
  assert.equal(good.ok, true);
  assert.equal(good.template.previewText, "Your workspace is live", "preview text (preheader) is a first-class field");

  let config = emptyConfig();
  ({ config } = emailTemplates.withEmailTemplateUpsert(config, { ...good.template, nowIso: "2026-07-05T01:00:00.000Z" }));
  let row = emailTemplates.findEmailTemplatesObject(config).rows[0];
  assert.equal(row.id, "email-template-launch-welcome", "explicit slug identity, agent-teams style");
  assert.equal(row.status, "ready", "atomic status column");
  assert.equal(row.version, 1, "starts at version 1");
  assert.equal(row.createdAt, "2026-07-05T01:00:00.000Z");
  for (const counter of ["sends", "delivered", "opens", "clicks", "replies", "bounces"]) {
    assert.ok(!(counter in row), `templates carry NO ${counter} counter — tracking belongs to email-activity rows`);
  }

  ({ config } = emailTemplates.withEmailTemplateUpsert(config, { ...good.template, subject: "Hi v2", nowIso: "2026-07-05T02:00:00.000Z" }));
  row = emailTemplates.findEmailTemplatesObject(config).rows[0];
  assert.equal(row.version, 2, "content edit bumps the version");
  assert.equal(row.createdAt, "2026-07-05T01:00:00.000Z", "creation stamp is stable");

  // Reuse stamp: a REAL send referencing the template stamps lastUsedAt.
  ({ config } = emailTemplates.withTemplateUsageStamp(config, { templateId: row.id, nowIso: "2026-07-05T03:00:00.000Z" }));
  row = emailTemplates.findEmailTemplatesObject(config).rows[0];
  assert.equal(row.lastUsedAt, "2026-07-05T03:00:00.000Z", "usage stamps land on the blueprint");
  const missing = emailTemplates.withTemplateUsageStamp(config, { templateId: "nope", nowIso: "x" });
  assert.equal(missing.stamped, false, "unknown template ids stamp nothing");
});

test("email-activity rows: the SENT EMAIL is the atomic tracking unit, driven by REAL Resend events", () => {
  // Resend's actual webhook surface — nothing invented (notably: no reply
  // event exists, so no replies column exists).
  assert.deepEqual(emailSends.RESEND_EMAIL_EVENT_TYPES, [
    "email.sent", "email.delivered", "email.delivery_delayed", "email.bounced",
    "email.complained", "email.failed", "email.opened", "email.clicked",
  ], "event map is exactly Resend's documented email webhook surface");
  assert.ok(!emailSends.EMAIL_SENDS_COLUMNS.includes("replies"), "no replies column — Resend has no reply event");

  // A real send lands one atomic row keyed by the provider message id.
  let config = emptyConfig();
  let out = emailSends.recordEmailSend(config, {
    providerMessageId: "email_abc123", to: ["qa@growthub.example"], from: "workflows@growthub.example",
    subject: "Welcome", templateId: "email-template-launch-welcome", templateName: "Launch Welcome",
    workflowRef: "registry-workflow", nodeId: "resend-email", registryId: "resend-email", nowIso: "2026-07-05T01:00:00.000Z",
  });
  config = out.config;
  assert.equal(out.created, true);
  assert.equal(out.row.id, "email_abc123", "row id IS the provider message id — the event correlation key");
  assert.equal(out.row.status, "sent");
  assert.equal(out.row.templateId, "email-template-launch-welcome", "template linkage travels on the send row");
  assert.equal(out.row.opens, 0);
  // Idempotent by message id.
  out = emailSends.recordEmailSend(config, { providerMessageId: "email_abc123", to: "x@y.z", subject: "dup", nowIso: "later" });
  config = out.config;
  assert.equal(out.created, false, "duplicate record calls never duplicate rows");

  // Lifecycle events update THAT row (idempotent-safe ordering).
  const at = (h) => `2026-07-05T0${h}:00:00.000Z`;
  const ev = (type, hour) => ({ type, created_at: at(hour), data: { email_id: "email_abc123" } });
  ({ config } = emailSends.applyResendEvent(config, ev("email.delivered", 2)));
  ({ config } = emailSends.applyResendEvent(config, ev("email.opened", 3)));
  ({ config } = emailSends.applyResendEvent(config, ev("email.opened", 4)));
  ({ config } = emailSends.applyResendEvent(config, ev("email.clicked", 5)));
  let row = emailSends.listEmailSends(config)[0];
  assert.equal(row.status, "delivered");
  assert.equal(row.deliveredAt, at(2));
  assert.equal(row.opens, 2, "each open event increments the row");
  assert.equal(row.firstOpenedAt, at(3));
  assert.equal(row.lastOpenedAt, at(4));
  assert.equal(row.clicks, 1);
  // Terminal states never regress.
  ({ config } = emailSends.applyResendEvent(config, ev("email.bounced", 6)));
  ({ config } = emailSends.applyResendEvent(config, ev("email.delivered", 7)));
  row = emailSends.listEmailSends(config)[0];
  assert.equal(row.status, "bounced", "bounced never regresses to delivered");

  // Events for sends made elsewhere (runtime nodes) CREATE the row — the
  // loop closes for every send on the same webhook key.
  ({ config } = emailSends.applyResendEvent(config, { type: "email.delivered", created_at: at(8), data: { email_id: "email_other", to: ["a@b.c"], subject: "Runtime send" } }));
  const other = emailSends.listEmailSends(config).find((r) => r.id === "email_other");
  assert.equal(other.status, "delivered", "unknown ids create rows from event data");
  // Unsupported types are refused honestly.
  const skipped = emailSends.applyResendEvent(config, { type: "contact.created", data: { email_id: "email_abc123" } });
  assert.equal(skipped.applied, false);
});

test("Resend webhook signature verification is real Svix (HMAC over raw bytes, constant time, bounded clock)", () => {
  const cryptoMod = require("node:crypto");
  const secret = "whsec_" + Buffer.from("supersecretsigningkey123").toString("base64");
  const key = Buffer.from(Buffer.from("supersecretsigningkey123").toString("base64"), "base64");
  const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email_abc123" } });
  const id = "msg_123";
  const now = 1751680000;
  const sig = cryptoMod.createHmac("sha256", key).update(`${id}.${now}.${payload}`).digest("base64");
  const ok = emailSends.verifyResendWebhookSignature({
    secret, id, timestamp: String(now), payload, signatureHeader: `v1,${sig}`, nowSeconds: now,
  });
  assert.equal(ok.ok, true, "valid Svix signature verifies");
  const bad = emailSends.verifyResendWebhookSignature({
    secret, id, timestamp: String(now), payload: payload + "x", signatureHeader: `v1,${sig}`, nowSeconds: now,
  });
  assert.equal(bad.ok, false, "tampered payload is refused");
  const stale = emailSends.verifyResendWebhookSignature({
    secret, id, timestamp: String(now - 3600), payload, signatureHeader: `v1,${sig}`, nowSeconds: now,
  });
  assert.equal(stale.ok, false, "stale timestamps are refused (replay bound)");
  assert.equal(stale.reason, "stale-timestamp");
  const noSecret = emailSends.verifyResendWebhookSignature({ secret: "", id, timestamp: String(now), payload, signatureHeader: `v1,${sig}` });
  assert.equal(noSecret.reason, "missing-secret");
});

test("events door + send loop are wired server-side only (source truth)", () => {
  const eventsSource = readFileSync(
    path.join(kitLib, "..", "app/api/workspace/add-ons/resend/events/route.js"),
    "utf8",
  );
  assert.ok(eventsSource.includes("await request.text()"), "signature verifies the RAW body bytes");
  assert.ok(eventsSource.includes("verifyResendWebhookSignature"), "Svix verification gates every event");
  assert.ok(eventsSource.includes("RESEND_WEBHOOK_SECRET"), "secret resolves from runtime env only");
  assert.ok(eventsSource.includes('status: 401'), "invalid signatures are refused 401");
  assert.ok(eventsSource.includes('outcomeStatus: "blocked"'), "refusals are receipted blocked outcomes");
  assert.ok(!eventsSource.includes("NEXT_PUBLIC"), "nothing browser-exposed");
  const doorSource = readFileSync(
    path.join(kitLib, "..", "app/api/workspace/add-ons/[providerId]/messaging/route.js"),
    "utf8",
  );
  assert.ok(doorSource.includes("recordEmailSend"), "every door send lands an email-activity row");
  assert.ok(doorSource.includes("withTemplateUsageStamp"), "template reuse stamps lastUsedAt on the blueprint");
  assert.ok(doorSource.includes("trackingReady"), "door readiness reports the tracking half of the loop");
  const runnerSource = readFileSync(path.join(kitLib, "orchestration-graph-runner.js"), "utf8");
  assert.ok(!/nodeConfig\?\.baseUrl[^\n]*\n[^\n]*RESEND_API_URL/.test(runnerSource), "resend runner base cannot be redirected from canvas config");
  assert.ok(runnerSource.split("SECURITY: the bearer secret only ever travels to bases from GOVERNED").length >= 3, "both capability executors lock the credentialed base to governed material");
});

test("email editor 2026 chrome: single action bar + intentional envelope, separate from editing", () => {
  const panelSource = readFileSync(
    path.join(kitLib, "..", "app/data-model/components/OrchestrationNodeConfigPanel.jsx"),
    "utf8",
  );
  // One Notion-style action bar hosts modes, formatting, variable menu, and
  // expand — no stacked chip rows above the surface.
  assert.ok(panelSource.includes('className="dm-email-editor__bar"'), "single action bar wraps the editor chrome");
  assert.ok(panelSource.includes("variableOpen"), "variable insertion is a menu, not a persistent chip row");
  // Envelope: To / From / Subject / Preview text live OUTSIDE the editing
  // experience as breadcrumbs; fields open only intentionally.
  assert.ok(panelSource.includes("function EmailEnvelope"), "envelope is its own surface");
  assert.ok(panelSource.includes("dm-email-envelope__crumb"), "envelope renders breadcrumb chips");
  assert.ok(panelSource.includes("previewTextTemplate"), "preview text (preheader) is part of the envelope + template state");
  const css = readFileSync(path.join(kitLib, "..", "app/globals.css"), "utf8");
  for (const selector of [".dm-email-editor__bar", ".dm-email-editor__divider", ".dm-email-envelope__bar", ".dm-email-envelope__crumb"]) {
    assert.ok(css.includes(selector), `globals.css styles ${selector}`);
  }
});

test("messaging door: save-template is a governed receipted action with the sanitize boundary", () => {
  const doorSource = readFileSync(
    path.join(kitLib, "..", "app/api/workspace/add-ons/[providerId]/messaging/route.js"),
    "utf8",
  );
  assert.ok(doorSource.includes('"save-template"'), "save-template action exists");
  assert.ok(doorSource.includes("sanitizeEmailHtml(validation.template.html)"), "stored template HTML passes the sanitize boundary");
  assert.ok(doorSource.includes("withEmailTemplateUpsert"), "writes through the pure lib");
  assert.ok(doorSource.includes("invalid_template_request"), "invalid saves are receipted blocked outcomes");
  assert.ok(doorSource.includes("templates: listEmailTemplates"), "GET returns the governed template list for sidecar reuse");
});

test("resend sidecar ships the full editor surface (modes, preview, tokens, templates, AI affordance)", () => {
  const panelSource = readFileSync(
    path.join(kitLib, "..", "app/data-model/components/OrchestrationNodeConfigPanel.jsx"),
    "utf8",
  );
  for (const marker of ['["design", "Design"]', '["html", "HTML"]', '["text", "Text"]', '["preview", "Preview"]']) {
    assert.ok(panelSource.includes(marker), `editor mode ${marker} present`);
  }
  assert.ok(panelSource.includes('previewDevice === "mobile" ? 320 : 600'), "desktop + mobile preview widths");
  assert.ok(panelSource.includes("Insert variable"), "token insertion affordance");
  assert.ok(panelSource.includes("ResendTemplateControls"), "template save/load controls");
  assert.ok(panelSource.includes("Draft with AI helper"), "AI-native helper affordance");
  assert.ok(panelSource.includes("helper=open&prompt="), "helper deep-link prefill");
  // Images are first-class body content: toolbar insertion in Design mode,
  // and the sanitize boundary must keep <img> (it strips handlers/URLs, not
  // tags) so images survive sends AND template saves.
  assert.ok(panelSource.includes("insertOptimizedImage"), "toolbar inserts images through the optimizing path");
  assert.ok(!/replace\([^)]*img/i.test(panelSource), "sanitizer does not strip img tags");
  // On-click image controls with automatic sizing optimization: inline
  // email-client-safe sizing ships with the HTML (not just in-app CSS), and
  // clicking an image exposes width/align/alt/remove controls. The UI-only
  // selection marker must never leak into the stored template.
  assert.ok(panelSource.includes('img.style.maxWidth = "100%"'), "auto-optimization writes INLINE max-width the sent email keeps");
  assert.ok(panelSource.includes("normalizeSurfaceImages"), "every image (incl. pasted markup) gets normalized");
  assert.ok(panelSource.includes("serializeSurfaceHtml"), "surface reads go through the marker-stripping serializer");
  assert.ok(panelSource.includes('removeAttribute("data-dm-selected")'), "selection marker is stripped before persisting");
  assert.ok(panelSource.includes("IMAGE_WIDTH_PRESETS") && panelSource.includes("IMAGE_ALIGN_PRESETS"), "width + alignment presets exist");
  assert.ok(panelSource.includes("img.isConnected"), "controls guard against detached images (no broken states)");
  assert.ok(panelSource.includes('"Remove image"') || panelSource.includes(">Remove<"), "image removal control exists");
  // Editor ergonomics: bottom-left drag grip resizes the active writing
  // surface; the top-right expand opens a full-width modal (portal, same
  // pattern as WorkspaceHelperSetupModal) editing the SAME node state live.
  assert.ok(panelSource.includes("startSurfaceResize") && panelSource.includes("dm-email-editor__resize"), "drag-to-resize grip exists");
  assert.ok(panelSource.includes("dm-email-editor__expand"), "expand affordance in the editor chrome");
  assert.ok(panelSource.includes("createPortal(") && panelSource.includes("dm-email-editor-modal"), "full view renders as a body-level modal portal");
  assert.ok(panelSource.includes('event.key === "Escape"'), "Escape closes the full view");
  const cssSurfaces = readFileSync(path.join(kitLib, "..", "app/globals.css"), "utf8");
  for (const selector of [".dm-email-editor__resize", ".dm-email-editor-modal__panel", ".dm-email-editor__surface-wrap"]) {
    assert.ok(cssSurfaces.includes(selector), `globals.css styles ${selector}`);
  }
  // Clean interface: the static explainer waterfall stays out of the sidecar
  // (env-ref context lives in placeholders and the live Test-pane status).
  for (const removed of ["Design the email visually", "Templates save as governed rows", "One governed send per run"]) {
    assert.ok(!panelSource.includes(removed), `static hint "${removed}…" stays removed`);
  }
  // contentEditable surfaces hold unmanaged children — the mode branches must
  // stay keyed so React remounts instead of leaking typed content across modes.
  assert.ok(panelSource.includes('key="design-surface-wrap"') && panelSource.includes('key="preview-frame"'), "design/preview branches are keyed against DOM reuse");
  const shellSource = readFileSync(
    path.join(kitLib, "..", "app/data-model/components/DataModelShell.jsx"),
    "utf8",
  );
  assert.ok(shellSource.includes('searchParams?.get("prompt")'), "shell supports the generic prompt prefill param");
});

test("editor + palette surfaces are STYLED on the design system, not UA defaults (regression)", () => {
  // The browser proof pack caught the editor tabs/tokens/toolbar rendering as
  // unstyled user-agent buttons (a class with no CSS anywhere). Guard both
  // halves: the markup must use the canonical config-tab class, and
  // globals.css must actually declare the editor/palette rules.
  const panelSource = readFileSync(
    path.join(kitLib, "..", "app/data-model/components/OrchestrationNodeConfigPanel.jsx"),
    "utf8",
  );
  assert.ok(panelSource.includes('"dm-orchestration-config__tabs dm-email-editor__tabs"'), "mode tabs reuse the canonical styled tab class");
  assert.ok(panelSource.includes('"dm-orchestration-config__tabs dm-email-editor__devices"'), "device tabs reuse the canonical styled tab class");
  assert.ok(!panelSource.includes("dm-workflow-tabs"), "no orphan class with zero CSS rules");
  const css = readFileSync(path.join(kitLib, "..", "app/globals.css"), "utf8");
  for (const selector of [
    ".dm-email-editor__tokens button",
    ".dm-email-editor__toolbar button",
    ".dm-email-editor__surface",
    ".dm-email-editor__frame",
    ".dm-email-editor__preview",
    ".dm-workflow-variant-search",
    ".dm-workflow-capability-list",
    ".dm-workflow-variant-more",
  ]) {
    assert.ok(css.includes(selector), `globals.css styles ${selector}`);
  }
});

test("Installed capabilities group stays clean at scale: max 10 per page, scroll area, +10 expand", () => {
  const surfaceSource = readFileSync(
    path.join(kitLib, "..", "app/workflows/WorkflowSurface.jsx"),
    "utf8",
  );
  assert.ok(surfaceSource.includes("useState(10)") && surfaceSource.includes("capabilityLimit"), "capability page size starts at 10");
  assert.ok(surfaceSource.includes("capabilityItems.slice(0, capabilityLimit)"), "visible capabilities are a bounded slice of the governed-row-derived items");
  assert.ok(surfaceSource.includes('className="dm-workflow-capability-list"'), "capability items render inside the scrollable section");
  assert.ok(surfaceSource.includes("setCapabilityLimit((current) => current + 10)"), "+10 expand grows the page");
  assert.ok(surfaceSource.includes("+ Show 10 more"), "expand affordance is explicit");
  // The bounding is scoped to the capabilities group ONLY — curated groups
  // keep their native rendering.
  assert.ok(surfaceSource.includes("WORKFLOW_ACTION_GROUPS.map((group)"), "curated groups render natively, unbounded");
});
