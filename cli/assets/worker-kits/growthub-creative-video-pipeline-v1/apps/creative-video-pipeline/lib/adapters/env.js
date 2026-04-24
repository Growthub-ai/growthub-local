export function readAdapterConfig() {
  return {
    generativeAdapter: process.env.CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER || "growthub-pipeline",
    pipelineHome: process.env.CREATIVE_VIDEO_PIPELINE_HOME || null,
    videoUseHome: process.env.VIDEO_USE_HOME || null,
    hasElevenLabsKey: Boolean(process.env.ELEVENLABS_API_KEY),
    hasBridgeToken: Boolean(process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN),
    bridgeBaseUrl: process.env.GROWTHUB_BRIDGE_BASE_URL || null,
    videoModelProvider: process.env.VIDEO_MODEL_PROVIDER || null,
    hasGoogleKey: Boolean(process.env.GOOGLE_AI_API_KEY),
    hasFalKey: Boolean(process.env.FAL_API_KEY),
    hasRunwayKey: Boolean(process.env.RUNWAY_API_KEY),
  };
}
