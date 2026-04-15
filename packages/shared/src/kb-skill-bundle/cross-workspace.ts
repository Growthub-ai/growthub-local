/**
 * Cross-Workspace Bundle Builder
 *
 * Combines skill bundles from multiple workspace refs into a single
 * KnowledgeSyncEnvelope or CrossWorkspaceKitBundle. Compatible with the
 * existing PaperclipSkillBundleV1 and KbSkillDocPayload primitives.
 *
 * No network calls here — pure data transformation. Transport is in cli/src/runtime/knowledge-sync/.
 */

import { buildPaperclipSkillBundleV1, sha256Utf8 } from "./bundle.js";
import type { KbSkillDocPayload } from "./types.js";
import type {
  CrossWorkspaceKitBundle,
  KnowledgeSyncEnvelope,
  KnowledgeSyncItem,
  WorkspaceKnowledgeRef,
} from "../types/knowledge-sync.js";

export interface CrossWorkspaceSource {
  ref: WorkspaceKnowledgeRef;
  docs: KbSkillDocPayload[];
}

export interface BuildCrossWorkspaceBundleOptions {
  sources: CrossWorkspaceSource[];
  label: string;
  bundleId?: string;
  maxBytesPerEnvelope?: number;
}

const DEFAULT_MAX_BYTES_PER_ENVELOPE = 512_000;

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Builds a KnowledgeSyncEnvelope from a single workspace source.
 * Each item carries a pre-computed bodySha256 for deduplication on import.
 */
export async function buildEnvelopeFromSource(
  source: CrossWorkspaceSource,
  opts: { maxBytes?: number; envelopeId?: string } = {},
): Promise<KnowledgeSyncEnvelope> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES_PER_ENVELOPE;
  const orderedIds = source.docs.map((d) => d.id);
  const docsById = new Map(source.docs.map((d) => [d.id, d]));

  const built = await buildPaperclipSkillBundleV1({ orderedIds, docsById, maxTotalBytes: maxBytes });

  const items: KnowledgeSyncItem[] = [];
  for (let i = 0; i < built.items.length; i++) {
    const meta = built.items[i]!;
    const doc = docsById.get(meta.id)!;
    const body = built.renderedBodies[i] ?? doc.body;
    items.push({
      originId: doc.id,
      name: doc.name,
      description: doc.description ?? "",
      body,
      format: doc.format ?? "markdown",
      source: doc.source ?? "cross_workspace",
      bodySha256: meta.bodySha256,
      metadata: undefined,
    });
  }

  const itemsSignature = await sha256Utf8(JSON.stringify(items));
  const now = new Date().toISOString();

  return {
    version: 1,
    envelopeId: opts.envelopeId ?? generateId(),
    createdAt: now,
    sourceRef: source.ref,
    items,
    itemsSignature,
    totalBodyBytes: built.totalBodyBytes,
  };
}

/**
 * Builds a CrossWorkspaceKitBundle from multiple workspace sources.
 * Each source produces one envelope; the bundle aggregates them.
 */
export async function buildCrossWorkspaceBundle(
  opts: BuildCrossWorkspaceBundleOptions,
): Promise<CrossWorkspaceKitBundle> {
  const maxBytes = opts.maxBytesPerEnvelope ?? DEFAULT_MAX_BYTES_PER_ENVELOPE;
  const bundleId = opts.bundleId ?? generateId();
  const now = new Date().toISOString();

  const envelopes: KnowledgeSyncEnvelope[] = [];
  for (const source of opts.sources) {
    const envelope = await buildEnvelopeFromSource(source, { maxBytes });
    envelopes.push(envelope);
  }

  const totalItems = envelopes.reduce((sum, e) => sum + e.items.length, 0);
  const totalBodyBytes = envelopes.reduce((sum, e) => sum + e.totalBodyBytes, 0);

  return {
    version: 1,
    bundleId,
    createdAt: now,
    label: opts.label,
    sourceRefs: opts.sources.map((s) => s.ref),
    envelopes,
    stats: {
      totalItems,
      totalBodyBytes,
      workspaceCount: opts.sources.length,
    },
  };
}

/**
 * Merges all items from a CrossWorkspaceKitBundle into a flat, deduplicated list.
 * Items with the same bodySha256 are deduplicated (first occurrence wins).
 */
export function flattenBundleItems(bundle: CrossWorkspaceKitBundle): KnowledgeSyncItem[] {
  const seen = new Set<string>();
  const result: KnowledgeSyncItem[] = [];
  for (const envelope of bundle.envelopes) {
    for (const item of envelope.items) {
      if (seen.has(item.bodySha256)) continue;
      seen.add(item.bodySha256);
      result.push(item);
    }
  }
  return result;
}
