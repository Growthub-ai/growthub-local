/**
 * Manifest Drift
 *
 * Compares a prior cached `CapabilityManifestEnvelope` to a fresh one and
 * emits a `ManifestDriftReport` keyed by the exact `ManifestDriftMarker.change`
 * taxonomy frozen in `@growthub/api-contract`.
 *
 * This mirrors the fork-sync agent mental model: detect, preview, apply.
 * No field outside the public `ManifestDriftMarker` change set is emitted.
 */

import type {
  CapabilityManifest,
  CapabilityManifestEnvelope,
  ManifestDriftMarker,
  ManifestDriftReport,
} from "@growthub/api-contract";

function bySlug(env: CapabilityManifestEnvelope): Map<string, CapabilityManifest> {
  const m = new Map<string, CapabilityManifest>();
  for (const entry of env.capabilities) m.set(entry.slug, entry);
  return m;
}

function sortedArrayEquals(a: string[] | undefined, b: string[] | undefined): boolean {
  const ax = [...(a ?? [])].sort();
  const bx = [...(b ?? [])].sort();
  if (ax.length !== bx.length) return false;
  for (let i = 0; i < ax.length; i++) if (ax[i] !== bx[i]) return false;
  return true;
}

function hasSchemaChanged(
  prev: CapabilityManifest,
  next: CapabilityManifest,
): boolean {
  const a = JSON.stringify(prev.inputSchema ?? null);
  const b = JSON.stringify(next.inputSchema ?? null);
  const c = JSON.stringify(prev.outputSchema ?? null);
  const d = JSON.stringify(next.outputSchema ?? null);
  return a !== b || c !== d;
}

export function compareEnvelopes(
  prev: CapabilityManifestEnvelope | null,
  next: CapabilityManifestEnvelope,
): ManifestDriftReport {
  const markers: ManifestDriftMarker[] = [];
  const prevMap = prev ? bySlug(prev) : new Map<string, CapabilityManifest>();
  const nextMap = bySlug(next);

  for (const [slug, nextEntry] of nextMap) {
    const prevEntry = prevMap.get(slug);
    if (!prevEntry) {
      markers.push({
        slug,
        change: "added",
        description: `${nextEntry.displayName} added`,
      });
      continue;
    }
    if (prevEntry.executionKind !== nextEntry.executionKind) {
      markers.push({
        slug,
        change: "executionKind",
        description: `${prevEntry.executionKind} → ${nextEntry.executionKind}`,
      });
    }
    if (!sortedArrayEquals(prevEntry.requiredBindings, nextEntry.requiredBindings)) {
      markers.push({
        slug,
        change: "requiredBindings",
        description: "required bindings changed",
      });
    }
    if (!sortedArrayEquals(prevEntry.outputTypes, nextEntry.outputTypes)) {
      markers.push({
        slug,
        change: "outputTypes",
        description: "output types changed",
      });
    }
    if (Boolean(prevEntry.node.enabled) !== Boolean(nextEntry.node.enabled)) {
      markers.push({
        slug,
        change: "enabled",
        description: `enabled: ${prevEntry.node.enabled} → ${nextEntry.node.enabled}`,
      });
    }
    if (hasSchemaChanged(prevEntry, nextEntry)) {
      markers.push({
        slug,
        change: "schema",
        description: "input or output schema changed",
      });
    }
  }

  for (const [slug, prevEntry] of prevMap) {
    if (!nextMap.has(slug)) {
      markers.push({
        slug,
        change: "removed",
        description: `${prevEntry.displayName} removed`,
      });
    }
  }

  return {
    comparedAt: new Date().toISOString(),
    markers,
  };
}
