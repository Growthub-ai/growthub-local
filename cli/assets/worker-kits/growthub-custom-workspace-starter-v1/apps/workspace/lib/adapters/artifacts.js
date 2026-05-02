import { readAdapterConfig } from "@/lib/adapters/env";

const STATIC_ARTIFACTS = [
  {
    id: "artifact_sample_1",
    kind: "image",
    title: "Sample creative",
    storagePath: "node_documents/sample/creative.png",
    mimeType: "image/png",
    source: { workflowId: "creative-brief-v1", runId: "run_sample_1" }
  },
  {
    id: "artifact_sample_2",
    kind: "report",
    title: "Weekly recap",
    storagePath: "node_documents/sample/recap.json",
    mimeType: "application/json",
    source: { workflowId: "weekly-recap-v1", runId: "run_sample_2" }
  }
];

async function listArtifacts() {
  const config = readAdapterConfig();
  if (config.integrationAdapter !== "growthub-bridge" || !process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN || !config.growthubBridge.baseUrl) {
    return { source: "static-sample", artifacts: STATIC_ARTIFACTS };
  }
  try {
    const url = new URL("/api/mcp/assets", config.growthubBridge.baseUrl);
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN}`
      },
      next: { revalidate: 30 }
    });
    if (!response.ok) {
      return { source: "static-sample", artifacts: STATIC_ARTIFACTS };
    }
    const payload = await response.json();
    const assets = Array.isArray(payload?.assets) ? payload.assets : [];
    return {
      source: "growthub-bridge",
      artifacts: assets.map((asset) => ({
        id: asset.id || asset.assetId,
        kind: asset.kind || asset.type || "asset",
        title: asset.title || asset.name || asset.id,
        storagePath: asset.storagePath || asset.path,
        mimeType: asset.mimeType,
        source: asset.source || {}
      }))
    };
  } catch {
    return { source: "static-sample", artifacts: STATIC_ARTIFACTS };
  }
}

export { listArtifacts };
