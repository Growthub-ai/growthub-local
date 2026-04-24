#!/usr/bin/env node
// Agency Portal Starter — adapter-first env verification.
import process from "node:process";

const allowed = {
  AGENCY_PORTAL_DATA_ADAPTER: ["postgres", "qstash-kv", "provider-managed"],
  AGENCY_PORTAL_AUTH_ADAPTER: ["oidc", "clerk", "authjs", "provider-managed"],
  AGENCY_PORTAL_PAYMENT_ADAPTER: ["stripe", "polar", "none"],
  AGENCY_PORTAL_INTEGRATION_ADAPTER: ["growthub-bridge", "byo-api-key", "static"],
  AGENCY_PORTAL_DEPLOY_TARGET: ["vercel"],
};

const defaults = {
  AGENCY_PORTAL_DATA_ADAPTER: "provider-managed",
  AGENCY_PORTAL_AUTH_ADAPTER: "provider-managed",
  AGENCY_PORTAL_PAYMENT_ADAPTER: "none",
  AGENCY_PORTAL_INTEGRATION_ADAPTER: "static",
  AGENCY_PORTAL_DEPLOY_TARGET: "vercel",
  AGENCY_PORTAL_APP_ROOT: "apps/agency-portal",
};

let errors = 0;

function value(key) {
  return process.env[key] || defaults[key] || "";
}

function fail(message) {
  console.error(`[verify-env] ${message}`);
  errors += 1;
}

for (const [key, values] of Object.entries(allowed)) {
  const actual = value(key);
  if (!values.includes(actual)) {
    fail(`${key} must be one of: ${values.join(", ")}`);
  } else {
    console.log(`[verify-env] ok: ${key}=${actual}`);
  }
}

const dataAdapter = value("AGENCY_PORTAL_DATA_ADAPTER");
if (dataAdapter === "postgres" && !process.env.DATABASE_URL) {
  fail("DATABASE_URL is required when AGENCY_PORTAL_DATA_ADAPTER=postgres");
}
if (dataAdapter === "qstash-kv") {
  if (!process.env.QSTASH_KV_REST_URL) fail("QSTASH_KV_REST_URL is required when AGENCY_PORTAL_DATA_ADAPTER=qstash-kv");
  if (!process.env.QSTASH_KV_REST_TOKEN) fail("QSTASH_KV_REST_TOKEN is required when AGENCY_PORTAL_DATA_ADAPTER=qstash-kv");
}

const authAdapter = value("AGENCY_PORTAL_AUTH_ADAPTER");
if (authAdapter === "oidc") {
  for (const key of ["AUTH_SECRET", "AUTH_ISSUER", "AUTH_CLIENT_ID", "AUTH_CLIENT_SECRET"]) {
    if (!process.env[key]) fail(`${key} is required when AGENCY_PORTAL_AUTH_ADAPTER=oidc`);
  }
}

const paymentAdapter = value("AGENCY_PORTAL_PAYMENT_ADAPTER");
if ((paymentAdapter === "stripe" || paymentAdapter === "polar") && !process.env.PAYMENT_SECRET_KEY) {
  fail("PAYMENT_SECRET_KEY is required when a payment adapter is enabled");
}

const integrationAdapter = value("AGENCY_PORTAL_INTEGRATION_ADAPTER");
if (integrationAdapter === "growthub-bridge") {
  if (!process.env.GROWTHUB_BRIDGE_BASE_URL) fail("GROWTHUB_BRIDGE_BASE_URL is required when AGENCY_PORTAL_INTEGRATION_ADAPTER=growthub-bridge");
  if (!process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN) fail("GROWTHUB_BRIDGE_ACCESS_TOKEN is required when AGENCY_PORTAL_INTEGRATION_ADAPTER=growthub-bridge");
}
if (integrationAdapter === "byo-api-key") {
  const raw = process.env.AGENCY_PORTAL_BYO_CONNECTIONS_JSON;
  const hasWindsorKey = Boolean(process.env.WINDSOR_API_KEY);
  if (!raw && !hasWindsorKey) {
    fail("AGENCY_PORTAL_BYO_CONNECTIONS_JSON or WINDSOR_API_KEY is required when AGENCY_PORTAL_INTEGRATION_ADAPTER=byo-api-key");
  } else {
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) && (!parsed || typeof parsed !== "object")) {
          fail("AGENCY_PORTAL_BYO_CONNECTIONS_JSON must be a JSON array or object");
        }
      } catch {
        fail("AGENCY_PORTAL_BYO_CONNECTIONS_JSON must be valid JSON");
      }
    }
  }
}

console.log(`[verify-env] app root: ${value("AGENCY_PORTAL_APP_ROOT")}`);
console.log(`[verify-env] reporting adapter: ${process.env.AGENCY_PORTAL_REPORTING_ADAPTER || "(unset)"}`);
console.log(`[verify-env] integration adapter: ${integrationAdapter}`);
console.log(`[verify-env] windsor api key: ${process.env.WINDSOR_API_KEY ? "set" : "(unset)"}`);

process.exit(errors > 0 ? 1 : 0);
