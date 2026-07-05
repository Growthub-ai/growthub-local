/**
 * Stripe Payments — Source Resolver (workspace-commerce lane)
 *
 * The dashboard/data-model hydration lane for the installed `stripe-payments`
 * marketplace product. Read-only by construction: the same operation
 * allowlist as the `stripe-commerce` canvas node (payment intents, customers,
 * products, balance) — no mutation endpoint exists in this file.
 *
 * Auth: STRIPE_SECRET_KEY resolves server-side only (the marketplace connect
 * writes it to .env.local). STRIPE_API_URL overrides the base for offline QA
 * smokes — the exact contract the marketplace probe uses. No secret ever
 * enters rows, source records, or browser payloads.
 *
 * Bindings (data-source objects seeded on product install):
 *   sourceId "payment-intents" → GET /v1/payment_intents?limit=100
 *   sourceId "customers"       → GET /v1/customers?limit=100
 *   sourceId "products"        → GET /v1/products?limit=100
 *   sourceId "balance"         → GET /v1/balance (one row per currency)
 */

import { registerSourceResolver } from "../source-resolver-registry.js";

const STRIPE_FALLBACK_BASE = "https://api.stripe.com";

function stripeBaseUrl() {
  return (process.env.STRIPE_API_URL || "").trim().replace(/\/+$/, "") || STRIPE_FALLBACK_BASE;
}

function stripeSecret() {
  const secret = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not set. Connect the Stripe provider from the Add-ons Marketplace.");
  }
  return secret;
}

async function stripeGet(path) {
  const res = await fetch(`${stripeBaseUrl()}${path}`, {
    headers: { authorization: `Bearer ${stripeSecret()}`, accept: "application/json" },
  });
  if (!res.ok) {
    // Body text stays out of the error — provider messages can echo request
    // details; the status code is the honest, safe diagnostic.
    throw new Error(`Stripe API ${res.status} for ${path}`);
  }
  return res.json();
}

function centsToMajor(amount) {
  return typeof amount === "number" ? Math.round(amount) / 100 : null;
}

function isoFromUnix(seconds) {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

async function fetchPaymentIntents() {
  const payload = await stripeGet("/v1/payment_intents?limit=100");
  return (payload.data || []).map((intent) => ({
    id: intent.id,
    amount: centsToMajor(intent.amount),
    currency: intent.currency || null,
    status: intent.status || null,
    description: intent.description || "",
    customer: intent.customer || null,
    created: isoFromUnix(intent.created),
  }));
}

async function fetchCustomers() {
  const payload = await stripeGet("/v1/customers?limit=100");
  return (payload.data || []).map((customer) => ({
    id: customer.id,
    name: customer.name || "",
    email: customer.email || "",
    created: isoFromUnix(customer.created),
    delinquent: Boolean(customer.delinquent),
  }));
}

async function fetchProducts() {
  const payload = await stripeGet("/v1/products?limit=100");
  return (payload.data || []).map((product) => ({
    id: product.id,
    name: product.name || "",
    active: Boolean(product.active),
    description: product.description || "",
    created: isoFromUnix(product.created),
  }));
}

async function fetchBalance() {
  const payload = await stripeGet("/v1/balance");
  const rows = [];
  for (const [bucket, entries] of [["available", payload.available], ["pending", payload.pending]]) {
    for (const entry of entries || []) {
      rows.push({
        id: `${bucket}-${entry.currency}`,
        bucket,
        currency: entry.currency || null,
        amount: centsToMajor(entry.amount),
      });
    }
  }
  return rows;
}

const FETCHERS = {
  "payment-intents": fetchPaymentIntents,
  customers: fetchCustomers,
  products: fetchProducts,
  balance: fetchBalance,
};

registerSourceResolver({
  integrationId: "stripe-payments",
  connectorKind: "stripe-commerce",
  entityTypes: ["commerce.payment-intents", "commerce.customers", "commerce.products", "commerce.balance"],
  capabilities: ["read-only", "commerce", "dashboard-source"],
  async listEntities() {
    return Object.keys(FETCHERS).map((id) => ({
      id,
      label: `Stripe ${id.replace(/-/g, " ")}`,
      type: `commerce.${id}`,
      meta: {},
    }));
  },
  async fetchRecords(_config, _connection, binding) {
    const sourceId = String(binding?.sourceId || "payment-intents").trim();
    const fetcher = FETCHERS[sourceId];
    if (!fetcher) {
      throw new Error(`stripe-payments resolver: unknown sourceId "${sourceId}" (expected ${Object.keys(FETCHERS).join("/")})`);
    }
    return fetcher();
  },
});
