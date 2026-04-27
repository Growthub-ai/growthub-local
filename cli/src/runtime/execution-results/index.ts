import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import type {
  ExecuteWorkflowInput,
  ExecuteWorkflowResult,
  ExecutionArtifactRef,
  NodeResult,
} from "@growthub/api-contract";

type ExecuteWorkflowEvent = {
  type?: string;
  nodeId?: string;
  output?: Record<string, unknown>;
  error?: string;
  executionId?: string;
  executionLog?: Array<Record<string, unknown>>;
};

export type CachedExecutionResult = ExecuteWorkflowResult & {
  pipelineId?: string;
  cacheKey: string;
  updatedAt: string;
};

export function resolveExecutionResultsDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "execution-results");
}

export function resolveExecutionResultPath(executionId: string): string {
  return path.resolve(resolveExecutionResultsDir(), `${sanitizeCacheKey(executionId)}.json`);
}

function sanitizeCacheKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function readJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function initialResult(input: Pick<ExecuteWorkflowInput, "pipelineId" | "workflowId" | "threadId" | "nodes">): CachedExecutionResult {
  const cacheKey = input.workflowId?.trim() || input.threadId?.trim() || input.pipelineId;
  return {
    executionId: cacheKey,
    threadId: input.threadId,
    pipelineId: input.pipelineId,
    status: "running",
    nodeResults: Object.fromEntries(
      input.nodes.map((node) => [
        node.nodeId,
        {
          nodeId: node.nodeId,
          slug: node.slug,
          status: "pending",
        } satisfies NodeResult,
      ]),
    ),
    artifacts: [],
    startedAt: new Date().toISOString(),
    cacheKey,
    updatedAt: new Date().toISOString(),
  };
}

function artifactRefsFromNodeResult(nodeResult: NodeResult): ExecutionArtifactRef[] {
  const output = nodeResult.output;
  if (!output || typeof output !== "object") return [];

  const refs: ExecutionArtifactRef[] = [];
  const directStoragePath = stringValue(output.storagePath) ?? stringValue(output.storage_path);
  const directUrl = stringValue(output.videoUrl) ?? stringValue(output.url);
  if (directStoragePath || directUrl) {
    refs.push({
      artifactId: directStoragePath ?? `${nodeResult.nodeId}-artifact`,
      artifactType: inferArtifactType(output, directStoragePath, directUrl),
      nodeId: nodeResult.nodeId,
      url: directUrl,
      storagePath: directStoragePath,
      metadata: output,
    });
  }

  const videos = Array.isArray(output.videos) ? output.videos : [];
  for (const video of videos) {
    if (!video || typeof video !== "object") continue;
    const record = video as Record<string, unknown>;
    const storagePath = stringValue(record.storagePath) ?? stringValue(record.storage_path);
    const url = stringValue(record.videoUrl) ?? stringValue(record.url);
    refs.push({
      artifactId: storagePath ?? `${nodeResult.nodeId}-video-${refs.length + 1}`,
      artifactType: "video",
      nodeId: nodeResult.nodeId,
      url,
      storagePath,
      metadata: record,
    });
  }

  return dedupeArtifactRefs(refs);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function inferArtifactType(
  output: Record<string, unknown>,
  storagePath: string | undefined,
  url: string | undefined,
): ExecutionArtifactRef["artifactType"] {
  const hinted = stringValue(output.type) ?? stringValue(output.artifactType);
  if (hinted) return hinted;
  const candidate = `${storagePath ?? ""} ${url ?? ""}`.toLowerCase();
  if (candidate.match(/\.(mp4|mov|webm|mkv|m4v)(\?|$)/) || output.videoUrl) return "video";
  if (candidate.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/)) return "image";
  return "file";
}

function dedupeArtifactRefs(refs: ExecutionArtifactRef[]): ExecutionArtifactRef[] {
  const seen = new Set<string>();
  const deduped: ExecutionArtifactRef[] = [];
  for (const ref of refs) {
    const key = ref.storagePath ?? ref.url ?? ref.artifactId;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

function mergeArtifactRefs(result: CachedExecutionResult): ExecutionArtifactRef[] {
  return dedupeArtifactRefs([
    ...result.artifacts,
    ...Object.values(result.nodeResults).flatMap((nodeResult) => artifactRefsFromNodeResult(nodeResult)),
  ]);
}

export interface ExecutionResultCache {
  handleEvent(event: ExecuteWorkflowEvent): void;
  saveFinal(result: ExecuteWorkflowResult): CachedExecutionResult;
  getPath(): string;
}

export function createExecutionResultCache(
  input: Pick<ExecuteWorkflowInput, "pipelineId" | "workflowId" | "threadId" | "nodes">,
): ExecutionResultCache {
  let result = initialResult(input);
  let currentPath = resolveExecutionResultPath(result.executionId);
  writeJsonAtomic(currentPath, result);

  const persist = () => {
    result.updatedAt = new Date().toISOString();
    result.artifacts = mergeArtifactRefs(result);
    currentPath = resolveExecutionResultPath(result.executionId);
    writeJsonAtomic(currentPath, result);
  };

  return {
    handleEvent(event) {
      if (typeof event.executionId === "string" && event.executionId.trim()) {
        result.executionId = event.executionId.trim();
      }

      if (event.nodeId) {
        const current = result.nodeResults[event.nodeId] ?? {
          nodeId: event.nodeId,
          slug: event.nodeId,
          status: "pending",
        };

        if (event.type === "node_start") {
          current.status = "running";
        } else if (event.type === "node_complete") {
          current.status = "succeeded";
          current.output = event.output;
        } else if (event.type === "node_error") {
          current.status = "failed";
          current.error = event.error;
        }
        result.nodeResults[event.nodeId] = current;
      }

      if (event.type === "complete" && Array.isArray(event.executionLog)) {
        result.executionLog = event.executionLog;
        result.status = "succeeded";
        result.completedAt = new Date().toISOString();
      }
      if (event.type === "error") {
        result.status = "failed";
        result.completedAt = new Date().toISOString();
      }

      persist();
    },

    saveFinal(finalResult) {
      result = {
        ...finalResult,
        pipelineId: input.pipelineId,
        artifacts: dedupeArtifactRefs([...finalResult.artifacts, ...mergeArtifactRefs(result)]),
        cacheKey: result.cacheKey,
        updatedAt: new Date().toISOString(),
      };
      currentPath = resolveExecutionResultPath(result.executionId);
      writeJsonAtomic(currentPath, result);
      return result;
    },

    getPath() {
      return currentPath;
    },
  };
}

export function readExecutionResult(executionId: string): CachedExecutionResult | null {
  const raw = readJson(resolveExecutionResultPath(executionId));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as CachedExecutionResult;
}

export function listExecutionResults(): CachedExecutionResult[] {
  const dir = resolveExecutionResultsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readJson(path.resolve(dir, entry.name)))
    .filter((entry): entry is CachedExecutionResult => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
