/**
 * @growthub/api-contract — Growthub Bridge SDK primitives.
 *
 * Authenticated user-owned resources exposed to agents and humans through the
 * existing Growthub bridge bearer session. These are transport contracts only;
 * auth remains owned by the hosted Growthub session.
 */
export type BridgeAssetType = "image" | "video" | "audio" | "unknown";
export type BridgeAssetSource = "chat" | "autopilot" | "agent" | "knowledge" | "workflow" | "unknown";
export interface BridgeAssetItem {
    id: string;
    name: string;
    storage_path: string;
    type: BridgeAssetType;
    source: BridgeAssetSource;
    created_at: string;
    url: string;
    metadata: Record<string, unknown>;
    size?: number;
    mime_type?: string;
}
export interface BridgePagination {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
}
export interface BridgeAssetListResponse {
    success: boolean;
    userId?: string;
    assets: BridgeAssetItem[];
    pagination: BridgePagination;
}
export interface BridgeBrandKit {
    id: string;
    user_id: string;
    brand_name: string;
    colors?: unknown;
    fonts?: unknown;
    messaging?: string | null;
    visibility?: string | null;
    share_config?: Record<string, unknown> | null;
    created_at?: string | null;
    updated_at?: string | null;
    access?: {
        canView: boolean;
        canEdit: boolean;
        isOwner: boolean;
        isCollaborator: boolean;
    };
    assets?: BridgeBrandAsset[];
}
export interface BridgeBrandAsset {
    id: string;
    brand_kit_id: string;
    asset_type: string;
    asset_url: string;
    storage_path: string;
    metadata?: Record<string, unknown> | null;
    is_global?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
}
export interface BridgeBrandKitListResponse {
    success: boolean;
    userId?: string;
    brandKits: BridgeBrandKit[];
    count: number;
}
export interface BridgeBrandAssetListResponse {
    success: boolean;
    userId?: string;
    brandKitId?: string;
    assets: BridgeBrandAsset[];
    count: number;
}
export interface BridgeKnowledgeItem {
    id: string;
    user_id: string;
    agent_slug?: string | null;
    file_name: string;
    storage_path: string;
    source_type?: string | null;
    metadata?: Record<string, unknown> | null;
    item_count?: number | null;
    compressed?: boolean | null;
    is_active?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
}
export interface BridgeKnowledgeTable extends BridgeKnowledgeItem {
    source_type: "table";
    child_count?: number;
}
export interface BridgeKnowledgeListResponse {
    success: boolean;
    userId?: string;
    items: BridgeKnowledgeItem[];
    count: number;
}
export interface BridgeKnowledgeTableListResponse {
    success: boolean;
    userId?: string;
    tables: BridgeKnowledgeTable[];
    count: number;
}
export interface BridgeKnowledgeSaveInput {
    id?: string;
    title?: string;
    fileName?: string;
    content?: string;
    agentSlug?: string;
    tableId?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
}
export interface BridgeKnowledgeSaveResponse {
    success: boolean;
    id?: string;
    item?: BridgeKnowledgeItem;
    created?: boolean;
    updated?: boolean;
    error?: string;
}
export interface BridgeKnowledgeMetadataPatchInput {
    id: string;
    tableId?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
}
export interface BridgeRunOutputSyncInput {
    runId?: string;
    title?: string;
    output?: unknown;
    payload?: unknown;
    tableId?: string;
    agentSlug?: string;
    metadata?: Record<string, unknown>;
}
export interface BridgeMcpAccount {
    id: string;
    provider: string;
    connectionName?: string;
    connectionType?: string;
    isActive?: boolean;
    isVerified?: boolean;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
    appSlug?: string;
}
export interface BridgeMcpAccountsResponse {
    success: boolean;
    accounts: BridgeMcpAccount[];
}
//# sourceMappingURL=bridge.d.ts.map