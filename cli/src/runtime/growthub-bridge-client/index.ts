import fs from "node:fs";
import path from "node:path";
import { readSession, isSessionExpired, type CliAuthSession } from "../../auth/session-store.js";
import type {
  BridgeAssetListResponse,
  BridgeBrandAsset,
  BridgeBrandAssetListResponse,
  BridgeBrandKit,
  BridgeBrandKitListResponse,
  BridgeKnowledgeItem,
  BridgeKnowledgeListResponse,
  BridgeKnowledgeMetadataPatchInput,
  BridgeKnowledgeSaveInput,
  BridgeKnowledgeSaveResponse,
  BridgeKnowledgeTable,
  BridgeKnowledgeTableListResponse,
  BridgeHostedAgentManifestListResponse,
  BridgeHostedAgentManifestResponse,
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

async function requestKnowledgeUpload(
  session: CliAuthSession,
  input: BridgeKnowledgeSaveInput,
): Promise<BridgeKnowledgeSaveResponse> {
  const url = bridgeUrl(session, "/api/knowledge/upload");
  const title = input.title?.trim() || input.fileName?.trim() || "Growthub CLI knowledge item";
  const fileName = input.fileName?.trim() || `${title.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "") || "knowledge"}.md`;
  const content = input.content ?? [
    `# ${title}`,
    "",
    input.notes ?? "Created by the Growthub Local CLI bridge.",
  ].join("\n");

  const form = new FormData();
  form.set("file", new Blob([content], { type: "text/markdown" }), fileName);
  form.set("agent_slug", input.agentSlug ?? "growthub_local_bridge");
  form.set("title", title);
  form.set("file_name", fileName);
  const sourceType = String(input.metadata?.source_type ?? "markdown");
  form.set("source_type", sourceType);
  if (input.tableId) form.set("table_id", input.tableId);
  if (input.notes) form.set("notes", input.notes);
  form.set("metadata", JSON.stringify({
    ...(input.metadata ?? {}),
    ...(input.tableId ? { table_id: input.tableId } : {}),
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${session.accessToken}`,
      cookie: buildSupabaseSessionCookie(session),
      "x-user-id": session.userId ?? "",
    },
    body: form,
  });
  const text = await response.text();
  const parsed = text.trim() ? safeJson(text) : null;
  if (!response.ok) {
    const message = typeof parsed === "object" && parsed && "error" in parsed
      ? String((parsed as { error: unknown }).error)
      : `Growthub knowledge upload failed (${response.status})`;
    throw new Error(message);
  }
  if (!parsed || typeof parsed !== "object" || (parsed as { success?: unknown }).success !== true) {
    throw new Error("Growthub knowledge upload did not return success.");
  }
  const record = parsed as {
    knowledge_item_id?: string;
    id?: string;
    storage_path?: string;
    source_type?: string;
  };
  const id = record.knowledge_item_id ?? record.id;
  return {
    success: true,
    id,
    created: true,
    item: id ? {
      id,
      user_id: session.userId ?? "",
      agent_slug: input.agentSlug ?? "growthub_local_bridge",
      file_name: fileName,
      storage_path: record.storage_path ?? "",
      source_type: record.source_type ?? sourceType,
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.tableId ? { table_id: input.tableId } : {}),
      },
    } : undefined,
  };
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

  // Growthub Local knowledge surface. The hosted profile advertises the
  // growthub_local_* tool slugs, while the live route layer persists markdown
  // through /api/knowledge/upload and reads through /api/knowledge-base/list.
  // These routes require the CLI session projected as the Supabase session
  // cookie shape; Bearer-only auth is not enough for this surface.

  async listKnowledge(query: BridgeKnowledgeQuery = {}): Promise<BridgeKnowledgeListResponse> {
    const url = bridgeUrl(this.session, "/api/knowledge-base/list");
    const result = await requestJsonWithSessionCookie<unknown>(this.session, url);
    if (!isKnowledgeBaseListResponse(result)) {
      throw new Error("Growthub knowledge list did not return the knowledge contract.");
    }
    const items = result.items.filter((item) => {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>;
      if (query.type && item.source_type !== query.type) return false;
      if (query.agentSlug && item.agent_slug !== query.agentSlug) return false;
      if (query.tableId && metadata.table_id !== query.tableId) return false;
      return true;
    });
    return {
      success: true,
      userId: this.session.userId,
      items,
      count: items.length,
    };
  }

  async listKnowledgeTables(query: BridgeKnowledgeTableQuery = {}): Promise<BridgeKnowledgeTableListResponse> {
    const url = bridgeUrl(this.session, "/api/knowledge-base/list");
    const result = await requestJsonWithSessionCookie<unknown>(this.session, url);
    if (!isKnowledgeBaseListResponse(result)) {
      throw new Error("Growthub knowledge table list did not return the knowledge table contract.");
    }
    const tables = result.items.filter((item): item is BridgeKnowledgeTable => {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>;
      const isTable =
        item.source_type === "table" ||
        item.file_name.startsWith("growthub-cli-memory-") ||
        metadata.origin === "table";
      if (!isTable) return false;
      if (query.origin && metadata.origin !== query.origin) return false;
      if (query.connectorType && metadata.connector_type !== query.connectorType) return false;
      return true;
    }).map((item) => ({
      ...item,
      source_type: "table" as const,
      child_count: item.item_count ?? 0,
    }));
    return {
      success: true,
      userId: this.session.userId,
      tables,
      count: tables.length,
    };
  }

  async saveKnowledge(input: BridgeKnowledgeSaveInput): Promise<BridgeKnowledgeSaveResponse> {
    return requestKnowledgeUpload(this.session, input);
  }

  deleteKnowledge(id: string): Promise<{ success: boolean; id?: string; deleted?: boolean; error?: string }> {
    const url = bridgeUrl(this.session, "/api/providers/growthub-local/knowledge/items");
    return requestJson(this.session, url, {
      method: "DELETE",
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

  async listHostedAgentManifests(): Promise<BridgeHostedAgentManifestListResponse> {
    const url = bridgeUrl(this.session, "/api/cli/profile", {
      view: "agent-orchestrator-manifests",
    });
    const result = await requestJson<unknown>(this.session, url);
    if (isHostedAgentManifestListResponse(result)) return result;
    throw new Error("Growthub bridge agent manifest list did not return the hosted agent manifest contract.");
  }

  async inspectHostedAgentManifest(agentSlug: string): Promise<BridgeHostedAgentManifestResponse> {
    const url = bridgeUrl(this.session, "/api/cli/profile", {
      view: "agent-orchestrator-manifest",
      agentSlug,
    });
    const result = await requestJson<unknown>(this.session, url);
    if (isHostedAgentManifestResponse(result)) return result;
    throw new Error("Growthub bridge agent manifest inspect did not return the hosted agent manifest contract.");
  }

  async downloadStoragePath(storagePath: string, outPath: string, bucket = "node_documents"): Promise<number> {
    const url = bridgeUrl(this.session, "/api/secure-image", { bucket, path: storagePath });
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${this.session.accessToken}`,
        cookie: buildSupabaseSessionCookie(this.session),
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
    const url = bridgeUrl(this.session, `/api/knowledge-base/download/${encodeURIComponent(id)}`);
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

function isKnowledgeBaseListResponse(value: unknown): value is { success?: boolean; items: BridgeKnowledgeItem[] } {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { items?: unknown }).items),
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

function isHostedAgentManifestListResponse(value: unknown): value is BridgeHostedAgentManifestListResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { agents?: unknown }).agents),
  );
}

function isHostedAgentManifestResponse(value: unknown): value is BridgeHostedAgentManifestResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    (
      typeof (value as { agent?: { slug?: unknown } }).agent?.slug === "string" ||
      typeof (value as { agent?: { agentSlug?: unknown } }).agent?.agentSlug === "string" ||
      typeof (value as { manifest?: { slug?: unknown } }).manifest?.slug === "string" ||
      typeof (value as { manifest?: { agentSlug?: unknown } }).manifest?.agentSlug === "string"
    ),
  );
}

export function createGrowthubBridgeClient(): GrowthubBridgeClient {
  return new GrowthubBridgeClient();
}
