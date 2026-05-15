export class GrowthubAgentClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || process.env.GROWTHUB_AGENT_SERVICE_URL || "http://localhost:8787").replace(/\/+$/, "");
    this.apiKey = options.apiKey || process.env.GROWTHUB_AGENT_SERVICE_API_KEY || "";
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("GrowthubAgentClient requires fetch. Use Node 20+ or pass fetchImpl.");
    }
  }

  headers(extra = {}) {
    return {
      "content-type": "application/json",
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      ...extra
    };
  }

  async query(query, options = {}) {
    if (typeof query !== "string" || !query.trim()) {
      throw new Error("query must be a non-empty string");
    }
    const response = await this.fetchImpl(`${this.baseUrl}/workspace/query`, {
      method: "POST",
      headers: this.headers(options.headers),
      body: JSON.stringify({
        query,
        workspace: options.workspace || undefined,
        outputMode: options.outputMode || "governed-envelope"
      })
    });
    return readJsonResponse(response);
  }

  async chatCompletions(payload, options = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(options.headers),
      body: JSON.stringify(payload || {})
    });
    return readJsonResponse(response);
  }
}

export function createGrowthubAgentClient(options = {}) {
  return new GrowthubAgentClient(options);
}

async function readJsonResponse(response) {
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Growthub Agent Service returned non-JSON response: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    const message = json?.error || `Growthub Agent Service request failed with ${response.status}`;
    throw new Error(message);
  }
  return json;
}
