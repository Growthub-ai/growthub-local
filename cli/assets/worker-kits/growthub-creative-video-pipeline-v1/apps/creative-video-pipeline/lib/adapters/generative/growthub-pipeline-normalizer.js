import { isExecutionEvent } from "@growthub/api-contract";

/**
 * Normalizes a growthub pipeline NDJSON ExecutionEvent stream into
 * GenerativeArtifact[]. Mirrors the hosted-execution-client collectArtifacts
 * pattern: artifacts live in node_complete output fields (.videos, .images)
 * and optionally in the CompleteEvent summary.executionLog.
 *
 * @param {AsyncIterable<string>} ndjsonStream - line-delimited JSON from `growthub pipeline execute`
 * @returns {Promise<GenerativeArtifact[]>}
 */
export async function normalizeGrowthubPipelineStream(ndjsonStream) {
  const artifacts = [];
  const nodeOutputs = [];

  for await (const line of ndjsonStream) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!isExecutionEvent(event)) continue;

    if (event.type === "node_complete" && event.output != null) {
      nodeOutputs.push({ nodeId: event.nodeId, output: event.output });
    }

    if (event.type === "complete") {
      const executionLog = event.summary?.executionLog;
      if (Array.isArray(executionLog)) {
        for (const entry of executionLog) {
          if (entry.type !== "cmsNode" || typeof entry.nodeId !== "string") continue;
          const output = entry.output;
          if (!output || typeof output !== "object") continue;
          extractArtifactsFromOutput(entry.nodeId, output, artifacts);
        }
      }
      break;
    }

    if (event.type === "error") {
      throw new Error(`Pipeline execution failed: ${event.message}`);
    }
  }

  // Fallback: extract from node_complete outputs if executionLog was absent in CompleteEvent
  if (artifacts.length === 0 && nodeOutputs.length > 0) {
    for (const { nodeId, output } of nodeOutputs) {
      extractArtifactsFromOutput(nodeId, output, artifacts);
    }
  }

  return artifacts;
}

function extractArtifactsFromOutput(nodeId, output, artifacts) {
  if (Array.isArray(output.videos)) {
    for (const video of output.videos) {
      artifacts.push({
        id: video.id ?? video.storage_path ?? crypto.randomUUID(),
        type: "video",
        url: typeof video.url === "string" ? video.url : null,
        localPath: video.localPath ?? null,
        mimeType: video.mimeType ?? "video/mp4",
        metadata: { nodeId, ...video },
        stage: "generative",
        createdAt: video.createdAt ?? new Date().toISOString(),
      });
    }
  }
  if (Array.isArray(output.images)) {
    for (const image of output.images) {
      artifacts.push({
        id: image.id ?? image.storage_path ?? crypto.randomUUID(),
        type: "image",
        url: typeof image.url === "string" ? image.url : null,
        localPath: image.localPath ?? null,
        mimeType: image.mimeType ?? "image/jpeg",
        metadata: { nodeId, ...image },
        stage: "generative",
        createdAt: image.createdAt ?? new Date().toISOString(),
      });
    }
  }
}
