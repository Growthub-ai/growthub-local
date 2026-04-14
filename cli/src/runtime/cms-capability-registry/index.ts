/**
 * CMS Capability Registry Client
 *
 * Treats the CMS-backed node/tool definitions as a first-class registry for
 * the CLI/runtime. This layer lets agents discover:
 *   - which core node primitives exist
 *   - which are available to the authenticated user/org
 *   - how they bind into pipelines
 *   - what execution shape they require
 *
 * Data sources:
 *   1. Hosted registry endpoint (primary — via HostedExecutionClient)
 *   2. Built-in catalog seeded from the production CMS workflow_node records
 *
 * The registry does NOT reimplement CMS semantics — it exposes them as
 * CLI/runtime-friendly node records.
 */

import {
  createHostedExecutionClient,
  type HostedCapabilityRecord,
} from "../hosted-execution-client/index.js";
import type {
  CmsCapabilityNode,
  CmsConnectorNode,
  CapabilityFamily,
  CapabilityQuery,
  CapabilityRegistryMeta,
} from "./types.js";

export type {
  CmsCapabilityNode,
  CmsConnectorNode,
  CapabilityFamily,
  CapabilityExecutionKind,
  CapabilityQuery,
  CapabilityRegistryMeta,
  CmsNodeType,
  CmsVisibility,
  CmsExecutionBinding,
  CmsExecutionTokens,
} from "./types.js";

export { CAPABILITY_FAMILIES } from "./types.js";

// ---------------------------------------------------------------------------
// Built-in workflow node templates — seeded from production CMS
// ---------------------------------------------------------------------------

const BUILTIN_WORKFLOW_NODES: CmsCapabilityNode[] = [
  {
    slug: "llm-text-generation",
    displayName: "LLM Text Generation",
    icon: "🤖",
    family: "text",
    category: "automation",
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionBinding: { type: "mcp_tool_call", strategy: "direct" },
    executionTokens: {
      tool_name: "llm_text_generation",
      input_template: {
        prompt: "",
        modelId: "",
        maxTokens: 4096,
        temperature: 0.7,
        systemPrompt: "",
      },
      output_mapping: {
        text: "string",
        model: "string",
        success: "boolean",
        duration: "number",
        tokensUsed: "object",
      },
      migration_version: "20251018000000",
    },
    requiredBindings: ["provider-api-key"],
    outputTypes: ["text"],
    enabled: true,
    experimental: false,
    visibility: "public",
    description: "Generate text using any AI model provider.",
  },
  {
    slug: "image-generation",
    displayName: "Image Generation",
    icon: "🎨",
    family: "image",
    category: "automation",
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionBinding: { type: "mcp_tool_call", strategy: "direct" },
    executionTokens: {
      tool_name: "image_generation",
      input_template: {
        size: "1024",
        prompt: "",
        brandKitId: "",
        imageModel: "gpt-image-1",
        creativeCount: 1,
        sequenceConfig: {
          delayMs: 0,
          createdAt: "",
          loopCount: 1,
          continueOnError: false,
        },
        referenceImages: [],
      },
      output_mapping: {
        type: "object",
        required: ["success", "images"],
        properties: {
          error: { type: "string" },
          model: { type: "string" },
          images: {
            type: "array",
            items: {
              type: "object",
              properties: {
                alt: { type: "string" },
                url: { type: "string" },
                width: { type: "integer" },
                height: { type: "integer" },
                storage_path: { type: "string" },
              },
            },
          },
          success: { type: "boolean" },
          loopCount: { type: "integer" },
          executionTime: { type: "number" },
          imagesGenerated: { type: "integer" },
        },
      },
      migration_version: "20251018000000",
    },
    requiredBindings: ["provider-api-key"],
    outputTypes: ["image"],
    enabled: true,
    experimental: false,
    visibility: "public",
    description: "Generate images with brand assets.",
  },
  {
    slug: "video-generation",
    displayName: "Video Generation",
    icon: "🎥",
    family: "video",
    category: "automation",
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionBinding: { type: "mcp_tool_call", strategy: "sequential-with-persistence" },
    executionTokens: {
      tool_name: "Video Generation",
      input_template: {
        size: "720x1280",
        prompt: "",
        seconds: "4",
        lastFrame: "",
        brandKitId: "",
        firstFrame: "",
        resolution: "1080p",
        videoModel: "sora-2",
        aspectRatio: "16:9",
        extendVideo: "",
        remixVideoId: "",
        creativeCount: 1,
        inputReference: "",
        referenceImages: [],
      },
      output_mapping: {
        size: "string",
        error: "string",
        model: "string",
        assets: "array",
        status: "string",
        success: "boolean",
        videoId: "string",
        videoUri: "string",
        videoUrl: "string",
        durationMs: "number",
        executedAt: "string",
        tokenUsage: "object",
        thumbnailUri: "string",
        executionTime: "number",
        durationSeconds: "number",
        pollingAttempts: "number",
        totalDurationMs: "number",
      },
      migration_version: "20251018000000",
    },
    requiredBindings: ["provider-api-key"],
    outputTypes: ["video"],
    enabled: true,
    experimental: false,
    visibility: "public",
    description: "Generate AI videos.",
  },
  {
    slug: "slides-generation",
    displayName: "Slides Generation",
    icon: "💻",
    family: "slides",
    category: "automation",
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionBinding: { type: "mcp_tool_call", strategy: "direct" },
    executionTokens: {
      tool_name: "slides_generation",
      input_template: {
        prompt: "",
        brandKitId: "",
        slideCount: 6,
        referenceImages: [],
      },
      output_mapping: {
        slides: "slides",
        totalSlides: "totalSlides",
      },
      migration_version: "20251018000000",
    },
    requiredBindings: ["provider-api-key"],
    outputTypes: ["slides"],
    enabled: true,
    experimental: false,
    visibility: "public",
    description: "Generate presentation slides.",
  },
  {
    slug: "deep-research-perplexity",
    displayName: "Deep Research (Perplexity Sonar)",
    icon: "🔍",
    family: "research",
    category: "automation",
    nodeType: "cms_workflow",
    executionKind: "hosted-execute",
    executionBinding: { type: "mcp_tool_call", strategy: "direct" },
    executionTokens: {
      tool_name: "deep_research_perplexity",
      input_template: {
        model: "sonar",
        query: "",
        context: "",
        maxResults: 10,
      },
      output_mapping: {
        model: "string",
        query: "string",
        context: "string",
        sources: "array",
        success: "boolean",
        duration: "number",
        citations: "number",
        executedAt: "string",
        hasContext: "boolean",
        tokensUsed: "object",
        finishReason: "string",
        researchSummary: "string",
      },
      migration_version: "20251018000000",
    },
    requiredBindings: ["provider-api-key"],
    outputTypes: ["report", "text"],
    enabled: true,
    experimental: false,
    visibility: "authenticated",
    description: "Conduct deep research using Perplexity Sonar models with citations.",
  },
  {
    slug: "image-analysis",
    displayName: "Image Analysis",
    icon: "👁️",
    family: "vision",
    category: "automation",
    nodeType: "tool_execution",
    executionKind: "hosted-execute",
    executionBinding: { type: "mcp_tool_call", strategy: "direct" },
    executionTokens: {
      tool_name: "image_analysis",
      input_template: {
        imageUrl: "",
        userPrompt: "",
        visionModel: "gpt-4-vision",
      },
      output_mapping: {
        tags: "array",
        text: "string",
        colors: "array",
        objects: "array",
        success: "boolean",
        summary: "string",
      },
      migration_version: "20251018000000",
    },
    requiredBindings: ["provider-api-key"],
    outputTypes: ["report", "text"],
    enabled: true,
    experimental: false,
    visibility: "public",
    description: "Analyze images with vision models to extract tags, summaries, and insights.",
  },
];

// ---------------------------------------------------------------------------
// Built-in connector registry — seeded from production CMS
// ---------------------------------------------------------------------------

const BUILTIN_CONNECTORS: CmsConnectorNode[] = [
  {
    slug: "growthub_local",
    displayName: "Growthub Local Machine",
    icon: "🖥️",
    authType: "oauth_first_party",
    tools: [
      "growthub_local_list_knowledge_tables",
      "growthub_local_list_knowledge_items",
      "growthub_local_upsert_knowledge_item",
      "growthub_local_update_knowledge_metadata",
      "growthub_local_sync_run_output",
    ],
    description: "Connect a local Growthub DX or GTM machine so agents can read and write shared knowledge.",
    longDescription: "Growthub Local Machine bridges a private Growthub account to a local Growthub DX or GTM installation.",
    enabled: true,
    mcpProvider: "growthub_local",
  },
  {
    slug: "facebook_graph_api",
    displayName: "Meta Ads",
    icon: "📘",
    authType: "oauth_first_party",
    tools: [
      "meta_ads_insights",
      "creative_fatigue_analysis",
      "demographic_targeting_insights",
      "nlu_text_prompt_generator",
    ],
    description: "Facebook and Instagram advertising insights and management.",
    enabled: true,
    mcpProvider: "meta-ads",
  },
  {
    slug: "foreplay_api",
    displayName: "Foreplay",
    icon: "🎯",
    authType: "api_token",
    tools: [
      "foreplay_competitor_research",
      "foreplay_board_analysis",
    ],
    description: "Competitive ad intelligence and creative insights.",
    enabled: true,
    mcpProvider: "foreplay",
  },
];

// ---------------------------------------------------------------------------
// Normalize hosted records to CmsCapabilityNode
// ---------------------------------------------------------------------------

function toCapabilityNode(record: HostedCapabilityRecord): CmsCapabilityNode {
  const familyMap: Record<string, CapabilityFamily> = {
    video: "video",
    image: "image",
    slides: "slides",
    text: "text",
    data: "data",
    ops: "ops",
    research: "research",
    vision: "vision",
  };

  return {
    slug: record.slug,
    displayName: record.displayName,
    icon: "",
    family: familyMap[record.family] ?? "ops",
    category: "automation",
    nodeType: "tool_execution",
    executionKind: record.executionKind,
    executionBinding: { type: "mcp_tool_call", strategy: "direct" },
    executionTokens: {
      tool_name: record.slug,
      input_template: {},
      output_mapping: {},
    },
    requiredBindings: record.requiredBindings,
    outputTypes: record.outputTypes,
    enabled: record.enabled,
    experimental: false,
    visibility: "authenticated",
    manifestMetadata: record.metadata,
  };
}

// ---------------------------------------------------------------------------
// Query filter
// ---------------------------------------------------------------------------

function matchesQuery(node: CmsCapabilityNode, query: CapabilityQuery): boolean {
  if (query.enabledOnly !== false && !node.enabled) return false;
  if (query.family && node.family !== query.family) return false;
  if (query.executionKind && node.executionKind !== query.executionKind) return false;
  if (query.outputType && !node.outputTypes.includes(query.outputType)) return false;
  if (query.slug && !node.slug.includes(query.slug)) return false;
  if (query.search) {
    const term = query.search.toLowerCase();
    const haystack = `${node.slug} ${node.displayName} ${node.description ?? ""} ${node.category}`.toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Registry client
// ---------------------------------------------------------------------------

export interface CmsCapabilityRegistryClient {
  /** Fetch all capabilities, optionally filtered. */
  listCapabilities(query?: CapabilityQuery): Promise<{ nodes: CmsCapabilityNode[]; meta: CapabilityRegistryMeta }>;
  /** Fetch a single capability by slug. */
  getCapability(slug: string): Promise<CmsCapabilityNode | null>;
  /** Fetch only the built-in workflow node templates (no network). */
  listBuiltinCapabilities(query?: CapabilityQuery): { nodes: CmsCapabilityNode[]; meta: CapabilityRegistryMeta };
  /** Fetch built-in connectors (no network). */
  listBuiltinConnectors(): CmsConnectorNode[];
}

export function createCmsCapabilityRegistryClient(): CmsCapabilityRegistryClient {
  return {
    async listCapabilities(query) {
      let nodes: CmsCapabilityNode[];
      let source: "hosted" | "local-fallback";

      try {
        const executionClient = createHostedExecutionClient();
        const hostedRecords = await executionClient.getHostedCapabilities();

        if (hostedRecords.length > 0) {
          nodes = hostedRecords.map(toCapabilityNode);
          source = "hosted";
        } else {
          nodes = [...BUILTIN_WORKFLOW_NODES];
          source = "local-fallback";
        }
      } catch {
        nodes = [...BUILTIN_WORKFLOW_NODES];
        source = "local-fallback";
      }

      const enabledCount = nodes.filter((n) => n.enabled).length;
      const filtered = query ? nodes.filter((n) => matchesQuery(n, query)) : nodes;

      return {
        nodes: filtered,
        meta: {
          total: nodes.length,
          enabledCount,
          fetchedAt: new Date().toISOString(),
          source,
        },
      };
    },

    async getCapability(slug) {
      const { nodes } = await this.listCapabilities({ slug, enabledOnly: false });
      return nodes.find((n) => n.slug === slug) ?? null;
    },

    listBuiltinCapabilities(query) {
      const nodes = query
        ? BUILTIN_WORKFLOW_NODES.filter((n) => matchesQuery(n, query))
        : [...BUILTIN_WORKFLOW_NODES];

      return {
        nodes,
        meta: {
          total: BUILTIN_WORKFLOW_NODES.length,
          enabledCount: BUILTIN_WORKFLOW_NODES.filter((n) => n.enabled).length,
          fetchedAt: new Date().toISOString(),
          source: "local-fallback",
        },
      };
    },

    listBuiltinConnectors() {
      return [...BUILTIN_CONNECTORS];
    },
  };
}
