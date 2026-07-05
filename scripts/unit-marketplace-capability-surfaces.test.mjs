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

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const addOns = await import(pathToFileURL(path.join(kitLib, "workspace-add-ons.js")).href);
const schema = await import(pathToFileURL(path.join(kitLib, "workspace-schema.js")).href);
const emailTemplates = await import(pathToFileURL(path.join(kitLib, "workspace-email-templates.js")).href);

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
  const shellSource = readFileSync(
    path.join(kitLib, "..", "app/data-model/components/DataModelShell.jsx"),
    "utf8",
  );
  assert.ok(shellSource.includes('searchParams?.get("prompt")'), "shell supports the generic prompt prefill param");
});
