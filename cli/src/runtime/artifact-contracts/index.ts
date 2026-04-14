/**
 * Artifact Contract Layer
 *
 * Standardizes outputs from dynamic pipelines so they work the same across
 * local runtime, browser surfaces, hosted app, and serverless futures.
 *
 * Responsibilities:
 *   - normalize output metadata from hosted execution / provider assembly
 *   - support future sync through profile/artifact APIs
 *   - make artifacts queryable from both CLI and hosted surfaces
 *   - preserve compatibility with manifest registry and thread-scoped output
 *
 * Storage:
 *   - Local artifacts are persisted under ~/.paperclip/artifacts/
 *   - Hosted artifacts are fetched from the hosted profile/artifact API
 *   - The store merges both sources into a unified query surface
 */

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import type {
  GrowthubArtifactManifest,
  GrowthubArtifactType,
  ArtifactExecutionContext,
  ArtifactContentRef,
  ArtifactQuery,
  ArtifactStoreMeta,
} from "./types.js";

export type {
  GrowthubArtifactManifest,
  GrowthubArtifactType,
  ArtifactExecutionContext,
  ArtifactStatus,
  ArtifactContentRef,
  ArtifactQuery,
  ArtifactStoreMeta,
} from "./types.js";

// ---------------------------------------------------------------------------
// Artifact ID generation
// ---------------------------------------------------------------------------

function generateArtifactId(): string {
  return `art_${randomBytes(8).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Local artifact storage paths
// ---------------------------------------------------------------------------

function resolveArtifactsDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "artifacts");
}

function resolveArtifactManifestPath(artifactId: string): string {
  return path.resolve(resolveArtifactsDir(), `${artifactId}.json`);
}

// ---------------------------------------------------------------------------
// Local persistence
// ---------------------------------------------------------------------------

function readLocalManifest(artifactId: string): GrowthubArtifactManifest | null {
  const filePath = resolveArtifactManifestPath(artifactId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as GrowthubArtifactManifest;
  } catch {
    return null;
  }
}

function writeLocalManifest(manifest: GrowthubArtifactManifest): void {
  const dir = resolveArtifactsDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = resolveArtifactManifestPath(manifest.id);
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}

function listLocalManifests(): GrowthubArtifactManifest[] {
  const dir = resolveArtifactsDir();
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      try {
        const content = fs.readFileSync(path.resolve(dir, entry.name), "utf-8");
        return JSON.parse(content) as GrowthubArtifactManifest;
      } catch {
        return null;
      }
    })
    .filter((m): m is GrowthubArtifactManifest => m !== null)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

// ---------------------------------------------------------------------------
// Query filter
// ---------------------------------------------------------------------------

function matchesQuery(manifest: GrowthubArtifactManifest, query: ArtifactQuery): boolean {
  if (query.artifactType && manifest.artifactType !== query.artifactType) return false;
  if (query.pipelineId && manifest.pipelineId !== query.pipelineId) return false;
  if (query.sourceNodeSlug && manifest.sourceNodeSlug !== query.sourceNodeSlug) return false;
  if (query.executionContext && manifest.executionContext !== query.executionContext) return false;
  if (query.status && manifest.status !== query.status) return false;
  if (query.threadId && manifest.threadId !== query.threadId) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Artifact creation helper
// ---------------------------------------------------------------------------

export interface CreateArtifactInput {
  artifactType: GrowthubArtifactType;
  sourceNodeSlug: string;
  executionContext: ArtifactExecutionContext;
  pipelineId?: string;
  nodeId?: string;
  threadId?: string;
  createdByConnectionId?: string;
  metadata?: Record<string, unknown>;
}

export function createArtifactManifest(input: CreateArtifactInput): GrowthubArtifactManifest {
  return {
    id: generateArtifactId(),
    artifactType: input.artifactType,
    sourceNodeSlug: input.sourceNodeSlug,
    createdByConnectionId: input.createdByConnectionId,
    executionContext: input.executionContext,
    status: "pending",
    pipelineId: input.pipelineId,
    nodeId: input.nodeId,
    threadId: input.threadId,
    createdAt: new Date().toISOString(),
    metadata: input.metadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// Artifact store
// ---------------------------------------------------------------------------

export interface ArtifactStore {
  /** Create and persist a new artifact manifest. */
  create(input: CreateArtifactInput): GrowthubArtifactManifest;
  /** Get a single artifact by ID. */
  get(artifactId: string): GrowthubArtifactManifest | null;
  /** List artifacts, optionally filtered. */
  list(query?: ArtifactQuery): { artifacts: GrowthubArtifactManifest[]; meta: ArtifactStoreMeta };
  /** Update an existing artifact manifest. */
  update(artifactId: string, patch: Partial<Pick<GrowthubArtifactManifest, "status" | "metadata" | "updatedAt">>): GrowthubArtifactManifest | null;
  /** Get the local artifacts directory path. */
  getStorePath(): string;
}

export function createArtifactStore(): ArtifactStore {
  return {
    create(input) {
      const manifest = createArtifactManifest(input);
      writeLocalManifest(manifest);
      return manifest;
    },

    get(artifactId) {
      return readLocalManifest(artifactId);
    },

    list(query) {
      let artifacts = listLocalManifests();

      if (query) {
        artifacts = artifacts.filter((m) => matchesQuery(m, query));
      }

      if (query?.limit && query.limit > 0) {
        artifacts = artifacts.slice(0, query.limit);
      }

      return {
        artifacts,
        meta: {
          total: artifacts.length,
          source: "local",
          fetchedAt: new Date().toISOString(),
        },
      };
    },

    update(artifactId, patch) {
      const existing = readLocalManifest(artifactId);
      if (!existing) return null;

      const updated: GrowthubArtifactManifest = {
        ...existing,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.metadata !== undefined ? { metadata: { ...existing.metadata, ...patch.metadata } } : {}),
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };

      writeLocalManifest(updated);
      return updated;
    },

    getStorePath() {
      return resolveArtifactsDir();
    },
  };
}
