import { isExecutionEvent } from "@growthub/api-contract";

/**
 * Normalizes a growthub pipeline NDJSON ExecutionEvent stream into
 * GenerativeArtifact[]. Mirrors growthub-connection-normalizer.js pattern.
 *
 * @param {AsyncIterable<string>} ndjsonStream - line-delimited JSON from `growthub pipeline execute`
 * @returns {Promise<import("@growthub/api-contract").GenerativeArtifact[]>}
 */
export async function normalizeGrowthubPipelineStream(ndjsonStream) {
  const artifacts = [];

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

    if (event.type === "artifact" && event.payload) {
      artifacts.push({
        id: event.payload.id ?? crypto.randomUUID(),
        type: event.payload.type ?? "video",
        url: event.payload.url ?? null,
        localPath: event.payload.localPath ?? null,
        mimeType: event.payload.mimeType ?? null,
        metadata: event.payload.metadata ?? {},
        stage: event.payload.stage ?? "generative",
        createdAt: event.timestamp ?? new Date().toISOString(),
      });
    }
  }

  return artifacts;
}
