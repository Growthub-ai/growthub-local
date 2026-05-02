import { readAdapterConfig } from "@/lib/adapters/env";

const STATIC_TABLES = [
  {
    id: "brand-metrics",
    label: "Brand metrics",
    rowCount: 7,
    rows: [
      { date: "Mon", revenue: 320, channel: "search" },
      { date: "Tue", revenue: 410, channel: "social" },
      { date: "Wed", revenue: 285, channel: "search" },
      { date: "Thu", revenue: 540, channel: "email" },
      { date: "Fri", revenue: 470, channel: "social" },
      { date: "Sat", revenue: 220, channel: "search" },
      { date: "Sun", revenue: 380, channel: "email" }
    ]
  },
  {
    id: "campaign-performance",
    label: "Campaign performance",
    rowCount: 5,
    rows: [
      { campaign: "Spring", impressions: 12000, clicks: 320 },
      { campaign: "Launch", impressions: 18000, clicks: 540 },
      { campaign: "Retarget", impressions: 9000, clicks: 280 },
      { campaign: "Brand", impressions: 21000, clicks: 410 },
      { campaign: "Lookalike", impressions: 15500, clicks: 360 }
    ]
  }
];

async function listKnowledgeTables() {
  const config = readAdapterConfig();
  if (config.integrationAdapter !== "growthub-bridge" || !process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN) {
    return { source: "static-sample", tables: STATIC_TABLES.map(({ rows: _rows, ...meta }) => meta) };
  }
  if (!config.growthubBridge.baseUrl) {
    return { source: "static-sample", tables: STATIC_TABLES.map(({ rows: _rows, ...meta }) => meta) };
  }
  try {
    const url = new URL("/api/mcp/knowledge/tables", config.growthubBridge.baseUrl);
    const response = await fetch(url, {
      headers: bridgeHeaders(config),
      next: { revalidate: 30 }
    });
    if (!response.ok) {
      return { source: "static-sample", tables: STATIC_TABLES.map(({ rows: _rows, ...meta }) => meta) };
    }
    const payload = await response.json();
    const tables = Array.isArray(payload?.tables) ? payload.tables : [];
    return { source: "growthub-bridge", tables };
  } catch {
    return { source: "static-sample", tables: STATIC_TABLES.map(({ rows: _rows, ...meta }) => meta) };
  }
}

async function queryKnowledgeTable(tableId) {
  const config = readAdapterConfig();
  if (config.integrationAdapter !== "growthub-bridge" || !process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN || !config.growthubBridge.baseUrl) {
    const table = STATIC_TABLES.find((item) => item.id === tableId) || STATIC_TABLES[0];
    return { source: "static-sample", tableId: table.id, rows: table.rows };
  }
  try {
    const url = new URL(`/api/mcp/knowledge/tables/${encodeURIComponent(tableId)}/rows`, config.growthubBridge.baseUrl);
    const response = await fetch(url, {
      headers: bridgeHeaders(config),
      next: { revalidate: 30 }
    });
    if (!response.ok) {
      const fallback = STATIC_TABLES.find((item) => item.id === tableId) || STATIC_TABLES[0];
      return { source: "static-sample", tableId: fallback.id, rows: fallback.rows };
    }
    const payload = await response.json();
    return {
      source: "growthub-bridge",
      tableId,
      rows: Array.isArray(payload?.rows) ? payload.rows : []
    };
  } catch {
    const fallback = STATIC_TABLES.find((item) => item.id === tableId) || STATIC_TABLES[0];
    return { source: "static-sample", tableId: fallback.id, rows: fallback.rows };
  }
}

function bridgeHeaders(config) {
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN}`
  };
  if (config.growthubBridge.userId) {
    headers["x-user-id"] = config.growthubBridge.userId;
  }
  return headers;
}

export { listKnowledgeTables, queryKnowledgeTable };
