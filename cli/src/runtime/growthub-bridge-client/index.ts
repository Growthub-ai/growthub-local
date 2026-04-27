import fs from "node:fs";
import path from "node:path";
import { readSession, isSessionExpired, type CliAuthSession } from "../../auth/session-store.js";
import type {
  BridgeAssetListResponse,
  BridgeBrandAsset,
  BridgeBrandAssetListResponse,
  BridgeBrandKit,
  BridgeBrandKitListResponse,
  BridgeKnowledgeListResponse,
  BridgeKnowledgeMetadataPatchInput,
  BridgeKnowledgeSaveInput,
  BridgeKnowledgeSaveResponse,
  BridgeKnowledgeTableListResponse,
  BridgeMcpAccountsResponse,
  BridgeRunOutputSyncInput,
} from "@growthub/api-contract/bridge";

export interface BridgeAssetQuery {
  page?: number;
  limit?: number;
  source?: string;
  mediaType?: string;
  search?: string;
}

export interface BridgeBrandKitQuery {
  includeAssets?: boolean;
}

export interface BridgeBrandAssetQuery {
  brandKitId?: string;
  assetType?: string;
}

export interface BridgeKnowledgeQuery {
  type?: string;
  agentSlug?: string;
  tableId?: string;
}

export interface BridgeKnowledgeTableQuery {
  origin?: string;
  connectorType?: string;
}

function readActiveSession(): CliAuthSession {
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Hosted session expired. Run `growthub auth login` again.");
  }
  if (!session.userId) {
    throw new Error("Hosted session is missing userId. Run `growthub auth login` again.");
  }
  return session;
}

function bridgeUrl(session: CliAuthSession, pathname: string, params?: Record<string, string | number | undefined>): URL {
  const baseUrl = process.env.GROWTHUB_BRIDGE_BASE_URL?.trim() || session.hostedBaseUrl;
  const url = new URL(pathname, `${baseUrl.replace(/\/+$/, "")}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildSupabaseSessionCookie(session: CliAuthSession): string {
  const payload = {
    access_token: session.accessToken,
    user: {
      id: session.userId,
      email: session.email,
    },
  };
  return `sb-growthub-auth-token=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function requestJson<T>(session: CliAuthSession, url: URL, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${session.accessToken}`,
    "x-user-id": session.userId ?? "",
    ...Object.fromEntries(new Headers(init.headers).entries()),
  };
  if (init.body !== undefined && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  const parsed = text.trim() ? safeJson(text) : null;
  if (!response.ok) {
    const message = typeof parsed === "object" && parsed && "error" in parsed
      ? String((parsed as { error: unknown }).error)
      : `Growthub bridge request failed (${response.status})`;
    throw new Error(message);
  }
  return parsed as T;
}

async function requestJsonWithSessionCookie<T>(session: CliAuthSession, url: URL, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    cookie: buildSupabaseSessionCookie(session),
    ...Object.fromEntries(new Headers(init.headers).entries()),
  };
  if (init.body !== undefined && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  const parsed = text.trim() ? safeJson(text) : null;
  if (!response.ok) {
    const message = typeof parsed === "object" && parsed && "error" in parsed
      ? String((parsed as { error: unknown }).error)
      : `Growthub session-backed request failed (${response.status})`;
    throw new Error(message);
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class GrowthubBridgeClient {
  constructor(private readonly session: CliAuthSession = readActiveSession()) {}

  async listAssets(query: BridgeAssetQuery = {}): Promise<BridgeAssetListResponse> {
    const url = bridgeUrl(this.session, "/api/cli/profile", {
      view: "gallery-assets",
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      source: query.source,
      mediaType: query.mediaType,
      search: query.search,
    });
    const bridgeResult = await requestJson<unknown>(this.session, url);
    if (isAssetListResponse(bridgeResult)) return bridgeResult;

    const fallback = bridgeUrl(this.session, "/api/gallery/assets", {
      userId: this.session.userId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      source: query.source,
      mediaType: query.mediaType,
      search: query.search,
    });
    const fallbackResult = await requestJson<unknown>(this.session, fallback);
    if (isAssetListResponse(fallbackResult)) return fallbackResult;
    throw new Error("Growthub bridge asset list did not return the asset contract.");
  }

  async listBrandKits(query: BridgeBrandKitQuery = {}): Promise<BridgeBrandKitListResponse> {
    const url = bridgeUrl(this.session, "/api/brand-settings");
    const directResult = await requestJsonWithSessionCookie<unknown>(this.session, url);
    if (!isRemoteBrandKitArray(directResult)) {
      throw new Error("Growthub brand settings endpoint did not return brand kits.");
    }

    const brandKits = directResult.brandKits;
    if (!query.includeAssets || brandKits.length === 0) {
      return {
        success: true,
        userId: this.session.userId,
        brandKits,
        count: brandKits.length,
      };
    }

    const assetsResult = await this.listBrandAssets();
    const assetsByKitId = new Map<string, BridgeBrandAsset[]>();
    for (const asset of assetsResult.assets) {
      const key = String(asset.brand_kit_id);
      assetsByKitId.set(key, [...(assetsByKitId.get(key) ?? []), asset]);
    }

    return {
      success: true,
      userId: this.session.userId,
      brandKits: brandKits.map((kit) => ({
        ...kit,
        assets: assetsByKitId.get(String(kit.id)) ?? [],
      })),
      count: brandKits.length,
    };
  }

  async listBrandAssets(query: BridgeBrandAssetQuery = {}): Promise<BridgeBrandAssetListResponse> {
    const url = bridgeUrl(this.session, "/api/brand-settings/assets", {
      brandKitId: query.brandKitId,
    });
    const result = await requestJsonWithSessionCookie<unknown>(this.session, url);
    if (!isRemoteBrandAssetArray(result)) {
      throw new Error("Growthub brand assets endpoint did not return brand assets.");
    }

    const assets = query.assetType
      ? result.assets.filter((asset) => asset.asset_type === query.assetType)
      : result.assets;

    return {
      success: true,
      userId: this.session.userId,
      brandKitId: query.brandKitId,
      assets,
      count: assets.length,
    };
  }

  async listKnowledge(query: BridgeKnowledgeQuery = {}): Promise<BridgeKnowledgeListResponse> {
    const url = bridgeUrl(this.session, "/api/cli/profile", {
      view: "knowledge",
      type: query.type,
      agentSlug: query.agentSlug,
      tableId: query.tableId,
    });
    const result = await requestJson<unknown>(this.session, url);
    if (isKnowledgeListResponse(result)) return result;
    const providerUrl = bridgeUrl(this.session, "/api/providers/growthub-local/knowledge/items", {
      type: query.type,
      agentSlug: query.agentSlug,
      tableId: query.tableId,
    });
    const providerResult = await requestJson<unknown>(this.session, providerUrl);
    if (isKnowledgeListResponse(providerResult)) return providerResult;
    throw new Error("Growthub bridge knowledge list did not return the knowledge contract.");
  }

  async listKnowledgeTables(query: BridgeKnowledgeTableQuery = {}): Promise<BridgeKnowledgeTableListResponse> {
    const url = bridgeUrl(this.session, "/api/cli/profile", {
      view: "knowledge-tables",
      origin: query.origin,
      connectorType: query.connectorType,
    });
    const result = await requestJson<unknown>(this.session, url);
    if (isKnowledgeTableListResponse(result)) return result;
    const providerUrl = bridgeUrl(this.session, "/api/providers/growthub-local/knowledge/tables", {
      origin: query.origin,
      connectorType: query.connectorType,
    });
    const providerResult = await requestJson<unknown>(this.session, providerUrl);
    if (isKnowledgeTableListResponse(providerResult)) return providerResult;
    throw new Error("Growthub bridge knowledge table list did not return the knowledge table contract.");
  }

  async saveKnowledge(input: BridgeKnowledgeSaveInput): Promise<BridgeKnowledgeSaveResponse> {
    const url = bridgeUrl(this.session, "/api/cli/profile", { action: "save-knowledge" });
    const result = await requestJson<unknown>(this.session, url, {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (result && typeof result === "object" && "success" in result) {
      return result as BridgeKnowledgeSaveResponse;
    }
    const providerUrl = bridgeUrl(this.session, "/api/providers/growthub-local/knowledge/items");
    const providerResult = await requestJson<unknown>(this.session, providerUrl, {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (providerResult && typeof providerResult === "object" && "success" in providerResult) {
      return providerResult as BridgeKnowledgeSaveResponse;
    }
    throw new Error("Growthub bridge knowledge save did not return the knowledge save contract.");
  }

  deleteKnowledge(id: string): Promise<{ success: boolean; id?: string; deleted?: boolean; error?: string }> {
    const url = bridgeUrl(this.session, "/api/cli/profile", { action: "delete-knowledge" });
    return requestJson(this.session, url, {
      method: "POST",
      body: JSON.stringify({ id }),
    });
  }

  updateKnowledgeMetadata(input: BridgeKnowledgeMetadataPatchInput): Promise<{ success: boolean; id?: string; updated?: boolean; error?: string }> {
    const url = bridgeUrl(this.session, "/api/providers/growthub-local/knowledge/items/metadata");
    return requestJson(this.session, url, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  syncRunOutput(input: BridgeRunOutputSyncInput): Promise<{ success: boolean; item?: unknown; runId?: string; storagePath?: string; error?: string }> {
    const url = bridgeUrl(this.session, "/api/providers/growthub-local/runs/sync");
    return requestJson(this.session, url, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listMcpAccounts(): Promise<BridgeMcpAccountsResponse> {
    const url = bridgeUrl(this.session, "/api/mcp/accounts");
    return requestJson<BridgeMcpAccountsResponse>(this.session, url);
  }

  async downloadStoragePath(storagePath: string, outPath: string, bucket = "node_documents"): Promise<number> {
    const url = bridgeUrl(this.session, "/api/secure-image", { bucket, path: storagePath });
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${this.session.accessToken}`,
        "x-user-id": this.session.userId ?? "",
      },
    });
    if (!response.ok) {
      throw new Error(`Authenticated artifact download failed (${response.status}).`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), buffer);
    return buffer.length;
  }

  async downloadKnowledge(id: string, outPath: string): Promise<number> {
    const url = bridgeUrl(this.session, "/api/cli/profile", { view: "knowledge-download", id });
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${this.session.accessToken}`,
        "x-user-id": this.session.userId ?? "",
      },
    });
    if (!response.ok) {
      throw new Error(`Knowledge download failed (${response.status}).`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), buffer);
    return buffer.length;
  }
}

function isAssetListResponse(value: unknown): value is BridgeAssetListResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { assets?: unknown }).assets) &&
    typeof (value as { pagination?: { total?: unknown } }).pagination?.total === "number",
  );
}

function isBrandKitListResponse(value: unknown): value is BridgeBrandKitListResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { brandKits?: unknown }).brandKits) &&
    typeof (value as { count?: unknown }).count === "number",
  );
}

function isRemoteBrandKitArray(value: unknown): value is { brandKits: BridgeBrandKit[] } {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { brandKits?: unknown }).brandKits)
  );
}

function isBrandAssetListResponse(value: unknown): value is BridgeBrandAssetListResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { assets?: unknown }).assets) &&
    typeof (value as { count?: unknown }).count === "number",
  );
}

function isRemoteBrandAssetArray(value: unknown): value is { assets: BridgeBrandAsset[] } {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { assets?: unknown }).assets)
  );
}

function isKnowledgeListResponse(value: unknown): value is BridgeKnowledgeListResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { items?: unknown }).items) &&
    typeof (value as { count?: unknown }).count === "number",
  );
}

function isKnowledgeTableListResponse(value: unknown): value is BridgeKnowledgeTableListResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { tables?: unknown }).tables) &&
    typeof (value as { count?: unknown }).count === "number",
  );
}

export function createGrowthubBridgeClient(): GrowthubBridgeClient {
  return new GrowthubBridgeClient();
}
