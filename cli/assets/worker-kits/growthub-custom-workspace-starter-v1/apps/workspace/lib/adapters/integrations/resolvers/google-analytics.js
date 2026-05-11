/**
 * Google Analytics 4 — Source Resolver
 *
 * Auth path:
 *   GROWTHUB_BRIDGE_ACCESS_TOKEN (set in .env.local by `growthub starter init`)
 *   → GET /api/cli/profile?view=integration&provider=google-analytics
 *   → short-lived Google OAuth accessToken
 *   → GA4 Admin API (accountSummaries → property list)
 *   → GA4 Data API (runReport)
 *
 * Required env vars (set automatically in .env.local):
 *   GROWTHUB_BRIDGE_ACCESS_TOKEN
 *   GROWTHUB_BRIDGE_USER_ID      (optional — improves routing)
 *   GROWTHUB_BRIDGE_BASE_URL     (default: https://www.growthub.ai)
 *
 * Optional env vars:
 *   GOOGLE_ANALYTICS_PROPERTY_ID     override property for fetchRecords
 *   GOOGLE_ANALYTICS_DATE_RANGE_DAYS  lookback window (default 30)
 */

import { registerSourceResolver } from "../source-resolver-registry.js";

const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

/**
 * Resolve the GA4 access token.
 *
 * GROWTHUB_BRIDGE_ACCESS_TOKEN is the Google OAuth access token vended by the
 * Growthub bridge for the connected google-analytics integration. It is used
 * directly — no secondary bridge API call required.
 */
function resolveGA4AccessToken() {
  const token = process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "GROWTHUB_BRIDGE_ACCESS_TOKEN is not set. Export it from growthub.ai/settings/connections."
    );
  }
  return token;
}

/**
 * List all GA4 properties for the authenticated account.
 */
async function listGA4Properties(ga4Token) {
  const res = await fetch(`${GA4_ADMIN_API}/accountSummaries`, {
    headers: { Authorization: `Bearer ${ga4Token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GA4 Admin API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.accountSummaries || []).flatMap((account) =>
    (account.propertySummaries || []).map((prop) => ({
      id: prop.property,
      label: `${prop.displayName} — ${account.displayName}`,
      type: "ga4.account",
      meta: {
        propertyId: prop.property,
        accountId: account.account,
        accountName: account.displayName,
      },
    }))
  );
}

/**
 * Run a GA4 traffic report for the given property.
 */
async function fetchGA4Report(ga4Token, propertyId, days = 30) {
  const body = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [
      { name: "date" },
      { name: "sessionDefaultChannelGroup" },
      { name: "deviceCategory" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "conversions" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" }, desc: true }],
    limit: 500,
  };

  const res = await fetch(`${GA4_DATA_API}/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ga4Token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`GA4 Data API ${res.status}: ${await res.text()}`);
  }

  const report = await res.json();
  const dimHeaders = (report.dimensionHeaders || []).map((h) => h.name);
  const metHeaders = (report.metricHeaders || []).map((h) => h.name);

  return (report.rows || []).map((row) => {
    const dims = Object.fromEntries(
      dimHeaders.map((name, i) => [name, row.dimensionValues?.[i]?.value ?? null])
    );
    const mets = Object.fromEntries(
      metHeaders.map((name, i) => {
        const raw = row.metricValues?.[i]?.value ?? null;
        return [name, raw !== null ? Number(raw) : null];
      })
    );
    return {
      date: dims.date ?? null,
      channel: dims.sessionDefaultChannelGroup ?? null,
      device: dims.deviceCategory ?? null,
      sessions: mets.sessions ?? 0,
      activeUsers: mets.activeUsers ?? 0,
      bounceRate: mets.bounceRate != null ? Number((mets.bounceRate * 100).toFixed(2)) : null,
      avgSessionDuration: mets.averageSessionDuration != null
        ? Number(mets.averageSessionDuration.toFixed(1))
        : null,
      conversions: mets.conversions ?? 0,
    };
  });
}

registerSourceResolver({
  integrationId: "google-analytics",

  entityTypes: ["ga4.traffic", "ga4.account"],

  listEntities: async (_config, _connection) => {
    const ga4Token = resolveGA4AccessToken();
    return await listGA4Properties(ga4Token);
  },

  fetchRecords: async (_config, _connection, binding) => {
    const ga4Token = resolveGA4AccessToken();

    const propertyId =
      binding?.propertyId ||
      process.env.GOOGLE_ANALYTICS_PROPERTY_ID;

    if (!propertyId) {
      throw new Error(
        "No GA4 property ID configured. Set binding.propertyId in the data model object " +
        "or GOOGLE_ANALYTICS_PROPERTY_ID in .env.local."
      );
    }

    const days = Number(process.env.GOOGLE_ANALYTICS_DATE_RANGE_DAYS || 30);
    return fetchGA4Report(ga4Token, propertyId, days);
  },
});
