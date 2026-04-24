const ADAPTERS = {
  "growthub-pipeline": {
    id: "growthub-pipeline",
    label: "growthub-pipeline",
    description: "Routes through the hosted CMS video-generation node (veo-3.1-generate-001). Requires GROWTHUB_BRIDGE_ACCESS_TOKEN and GROWTHUB_BRIDGE_BASE_URL.",
    requiredEnv: ["GROWTHUB_BRIDGE_ACCESS_TOKEN", "GROWTHUB_BRIDGE_BASE_URL"],
  },
  "byo-api-key": {
    id: "byo-api-key",
    label: "byo-api-key",
    description: "Direct provider SDK calls. Set VIDEO_MODEL_PROVIDER (veo | fal | runway) and the matching provider API key. Same GenerativeArtifact[] output contract.",
    requiredEnv: ["VIDEO_MODEL_PROVIDER"],
  },
};

export function describeGenerativeAdapter() {
  const id = process.env.CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER || "growthub-pipeline";
  return ADAPTERS[id] ?? ADAPTERS["growthub-pipeline"];
}

export function readGenerativeConfig() {
  const adapter = describeGenerativeAdapter();
  return {
    adapter,
    missingEnv: adapter.requiredEnv.filter((k) => !process.env[k]),
  };
}
