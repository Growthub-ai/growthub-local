/**
 * CMS Manifest Diff
 *
 * Phase B primitive: compare two `CapabilityManifestEnvelope` snapshots
 * and return a `ManifestDriftReport` plus a convenience summary.
 *
 * Diff categories (locked per Phase B plan):
 *   - added slugs
 *   - removed slugs
 *   - changed family
 *   - changed execution tokens
 *   - changed required bindings
 *   - changed input schema fields
 *   - changed output schema fields
 *   - changed provenance / origin
 *
 * The granular categories map onto the public
 * `ManifestDriftMarker.change` taxonomy from `@growthub/api-contract`:
 *   - `added` / `removed` / `executionKind` / `requiredBindings` /
 *     `outputTypes` / `enabled` / `schema`
 *
 * "Changed execution tokens" and "changed input schema fields" both
 * surface as `schema` markers with a descriptive `description`.
 */

import type {
  CapabilityManifest,
  CapabilityManifestEnvelope,
  ManifestDriftMarker,
  ManifestDriftReport,
} from "@growthub/api-contract";

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface ManifestDriftSummary {
  /** Slugs that appeared in `next` but not in `prev`. */
  added: string[];
  /** Slugs that disappeared from `prev`. */
  removed: string[];
  /** Slugs whose entry changed in any category other than added / removed. */
  changed: string[];
  /** Slug-keyed list of change descriptions for debugging / rendering. */
  changeDetails: Record<string, string[]>;
  /** Raw markers for anyone that wants the full drift report shape. */
  markers: ManifestDriftMarker[];
  /** Full drift report. */
  report: ManifestDriftReport;
}

// ---------------------------------------------------------------------------
// Comparators
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  for (let i = 0; i < aSorted.length; i++) {
    if (aSorted[i] !== bSorted[i]) return false;
  }
  return true;
}

function diffInputSchema(prev: CapabilityManifest, next: CapabilityManifest): string | null {
  const prevFields = prev.inputSchema?.fields ?? null;
  const nextFields = next.inputSchema?.fields ?? null;

  if (prevFields === null && nextFields === null) return null;
  if (prevFields === null && nextFields !== null) {
    return `input schema introduced (${nextFields.length} field${nextFields.length === 1 ? "" : "s"})`;
  }
  if (prevFields !== null && nextFields === null) {
    return `input schema removed (was ${prevFields.length} field${prevFields.length === 1 ? "" : "s"})`;
  }

  const prevKeys = new Set((prevFields ?? []).map((f) => f.key));
  const nextKeys = new Set((nextFields ?? []).map((f) => f.key));

  const added: string[] = [];
  for (const key of nextKeys) if (!prevKeys.has(key)) added.push(key);
  const removed: string[] = [];
  for (const key of prevKeys) if (!nextKeys.has(key)) removed.push(key);

  const changed: string[] = [];
  for (const field of nextFields ?? []) {
    const prior = (prevFields ?? []).find((f) => f.key === field.key);
    if (!prior) continue;
    if (stableStringify(prior) !== stableStringify(field)) changed.push(field.key);
  }

  if (added.length === 0 && removed.length === 0 && changed.length === 0) return null;

  const parts: string[] = [];
  if (added.length > 0) parts.push(`+${added.join(", +")}`);
  if (removed.length > 0) parts.push(`-${removed.join(", -")}`);
  if (changed.length > 0) parts.push(`~${changed.join(", ~")}`);
  return `input schema fields ${parts.join(" ")}`;
}

function diffOutputSchema(prev: CapabilityManifest, next: CapabilityManifest): string | null {
  const prevFields = prev.outputSchema?.outputs ?? null;
  const nextFields = next.outputSchema?.outputs ?? null;

  if (prevFields === null && nextFields === null) return null;
  if (stableStringify(prevFields) === stableStringify(nextFields)) return null;

  const prevKeys = new Set((prevFields ?? []).map((f) => f.key));
  const nextKeys = new Set((nextFields ?? []).map((f) => f.key));

  const added: string[] = [];
  for (const key of nextKeys) if (!prevKeys.has(key)) added.push(key);
  const removed: string[] = [];
  for (const key of prevKeys) if (!nextKeys.has(key)) removed.push(key);

  const parts: string[] = [];
  if (added.length > 0) parts.push(`+${added.join(", +")}`);
  if (removed.length > 0) parts.push(`-${removed.join(", -")}`);
  if (parts.length === 0) parts.push("reshuffled");
  return `output schema ${parts.join(" ")}`;
}

function diffExecutionTokens(prev: CapabilityManifest, next: CapabilityManifest): string | null {
  const prevTokens = prev.node?.executionTokens;
  const nextTokens = next.node?.executionTokens;
  if (!prevTokens && !nextTokens) return null;

  const diffs: string[] = [];

  if (prevTokens?.tool_name !== nextTokens?.tool_name) {
    diffs.push(`tool_name ${prevTokens?.tool_name ?? "∅"} → ${nextTokens?.tool_name ?? "∅"}`);
  }
  if (stableStringify(prevTokens?.input_template ?? {}) !== stableStringify(nextTokens?.input_template ?? {})) {
    diffs.push("input_template changed");
  }
  if (stableStringify(prevTokens?.output_mapping ?? {}) !== stableStringify(nextTokens?.output_mapping ?? {})) {
    diffs.push("output_mapping changed");
  }

  if (diffs.length === 0) return null;
  return `execution tokens: ${diffs.join("; ")}`;
}

function diffProvenance(prev: CapabilityManifest, next: CapabilityManifest): string | null {
  const prevOrigin = prev.provenance?.originType;
  const nextOrigin = next.provenance?.originType;
  if (prevOrigin === nextOrigin) return null;
  return `provenance.originType ${prevOrigin ?? "∅"} → ${nextOrigin ?? "∅"}`;
}

// ---------------------------------------------------------------------------
// Main diff
// ---------------------------------------------------------------------------

export interface DiffOptions {
  /** Timestamp to stamp the `comparedAt` field with. Defaults to now. */
  comparedAt?: string;
}

/**
 * Diff two capability manifest envelopes.
 *
 * If `prev` is `null`, every capability in `next` is reported as `added`.
 */
export function diffManifestEnvelopes(
  prev: CapabilityManifestEnvelope | null,
  next: CapabilityManifestEnvelope,
  opts: DiffOptions = {},
): ManifestDriftSummary {
  const comparedAt = opts.comparedAt ?? new Date().toISOString();
  const markers: ManifestDriftMarker[] = [];
  const changeDetails: Record<string, string[]> = {};

  const prevBySlug = new Map<string, CapabilityManifest>();
  if (prev) {
    for (const entry of prev.capabilities) prevBySlug.set(entry.slug, entry);
  }
  const nextBySlug = new Map<string, CapabilityManifest>();
  for (const entry of next.capabilities) nextBySlug.set(entry.slug, entry);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [slug] of nextBySlug) {
    if (!prevBySlug.has(slug)) {
      added.push(slug);
      markers.push({ slug, change: "added" });
    }
  }

  for (const [slug] of prevBySlug) {
    if (!nextBySlug.has(slug)) {
      removed.push(slug);
      markers.push({ slug, change: "removed" });
    }
  }

  for (const [slug, nextEntry] of nextBySlug) {
    const prevEntry = prevBySlug.get(slug);
    if (!prevEntry) continue;

    const slugChanges: string[] = [];

    if (prevEntry.family !== nextEntry.family) {
      const description = `family ${prevEntry.family} → ${nextEntry.family}`;
      markers.push({ slug, change: "schema", description });
      slugChanges.push(description);
    }

    if (prevEntry.executionKind !== nextEntry.executionKind) {
      const description = `executionKind ${prevEntry.executionKind} → ${nextEntry.executionKind}`;
      markers.push({ slug, change: "executionKind", description });
      slugChanges.push(description);
    }

    if (!arraysEqual(prevEntry.requiredBindings, nextEntry.requiredBindings)) {
      const description = `requiredBindings [${prevEntry.requiredBindings.join(", ")}] → [${nextEntry.requiredBindings.join(", ")}]`;
      markers.push({ slug, change: "requiredBindings", description });
      slugChanges.push(description);
    }

    if (!arraysEqual(prevEntry.outputTypes, nextEntry.outputTypes)) {
      const description = `outputTypes [${prevEntry.outputTypes.join(", ")}] → [${nextEntry.outputTypes.join(", ")}]`;
      markers.push({ slug, change: "outputTypes", description });
      slugChanges.push(description);
    }

    const prevEnabled = prevEntry.node?.enabled;
    const nextEnabled = nextEntry.node?.enabled;
    if (prevEnabled !== nextEnabled) {
      const description = `enabled ${String(prevEnabled)} → ${String(nextEnabled)}`;
      markers.push({ slug, change: "enabled", description });
      slugChanges.push(description);
    }

    const tokensDiff = diffExecutionTokens(prevEntry, nextEntry);
    if (tokensDiff) {
      markers.push({ slug, change: "schema", description: tokensDiff });
      slugChanges.push(tokensDiff);
    }

    const inputSchemaDiff = diffInputSchema(prevEntry, nextEntry);
    if (inputSchemaDiff) {
      markers.push({ slug, change: "schema", description: inputSchemaDiff });
      slugChanges.push(inputSchemaDiff);
    }

    const outputSchemaDiff = diffOutputSchema(prevEntry, nextEntry);
    if (outputSchemaDiff) {
      markers.push({ slug, change: "schema", description: outputSchemaDiff });
      slugChanges.push(outputSchemaDiff);
    }

    const provenanceDiff = diffProvenance(prevEntry, nextEntry);
    if (provenanceDiff) {
      markers.push({ slug, change: "schema", description: provenanceDiff });
      slugChanges.push(provenanceDiff);
    }

    if (slugChanges.length > 0) {
      changed.push(slug);
      changeDetails[slug] = slugChanges;
    }
  }

  const report: ManifestDriftReport = { comparedAt, markers };

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
    changeDetails,
    markers,
    report,
  };
}
