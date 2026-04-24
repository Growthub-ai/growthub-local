const ADAPTERS = {
  "growthub-pipeline": {
    id: "growthub-pipeline",
    label: "growthub-pipeline",
    description: "Hosted CMS video-generation node via growthub pipeline execute. Requires GROWTHUB_BRIDGE_ACCESS_TOKEN + authenticated session.",
    requiredEnv: ["GROWTHUB_BRIDGE_ACCESS_TOKEN", "GROWTHUB_BRIDGE_BASE_URL"],
    cliCommand: "growthub pipeline execute '<DynamicRegistryPipeline JSON>'",
    sdkContract: "@growthub/api-contract — DynamicRegistryPipeline, ExecutionEvent, isExecutionEvent",
  },
  "byo-api-key": {
    id: "byo-api-key",
    label: "byo-api-key",
    description: "Direct provider SDK calls. Set VIDEO_MODEL_PROVIDER (veo | fal | runway) + provider key.",
    requiredEnv: ["VIDEO_MODEL_PROVIDER"],
    cliCommand: null,
    sdkContract: "provider SDK — Google AI / Fal / Runway",
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
