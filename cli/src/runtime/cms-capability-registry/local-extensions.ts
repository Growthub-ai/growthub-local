/**
 * CMS Capability Registry — Local Extensions
 *
 * Operator-authored capability declarations that live inside the fork at:
 *
 *   <forkPath>/.growthub-fork/capabilities/*.json
 *
 * Each file is a `LocalCapabilityExtension` envelope. Extensions are merged
 * into the registry view with local-overrides-hosted precedence. Agents see
 * them exactly the same way hosted nodes are seen, tagged with
 * `provenance.source === "local-extension"` so their origin is never
 * ambiguous.
 *
 * Why this exists: it lets a fork develop provider adapters, test
 * capability wiring, and ship experimental nodes without round-tripping
 * through the hosted CMS. The hosted app remains the authority — local
 * extensions are additive, never replace an enabled hosted slug silently.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveInForkStateDir } from "../../config/kit-forks-home.js";
import { listKitForkRegistrations } from "../../kits/fork-registry.js";
import type { CmsCapabilityNode } from "@growthub/api-contract/capabilities";
import type { LocalCapabilityExtension } from "@growthub/api-contract/manifest";
import { validateLocalCapabilityExtension } from "./schema.js";

export const LOCAL_EXTENSIONS_DIRNAME = "capabilities";

export interface LocalExtensionLoadResult {
  node: CmsCapabilityNode;
  filePath: string;
  forkPath: string;
  active: boolean;
  note?: string;
}

export interface LocalExtensionLoadError {
  filePath: string;
  reason: string;
}

export interface LocalExtensionScanResult {
  extensions: LocalExtensionLoadResult[];
  errors: LocalExtensionLoadError[];
  scannedForkPaths: string[];
}

function extensionsDirFor(forkPath: string): string {
  return path.resolve(resolveInForkStateDir(forkPath), LOCAL_EXTENSIONS_DIRNAME);
}

function collectForkPaths(explicit?: string[]): string[] {
  const out = new Set<string>();
  for (const p of explicit ?? []) {
    if (p) out.add(path.resolve(p));
  }
  // Include every registered fork so extensions are visible regardless of cwd.
  try {
    for (const entry of listKitForkRegistrations()) {
      if (entry.forkPath && fs.existsSync(entry.forkPath)) {
        out.add(entry.forkPath);
      }
    }
  } catch {
    // Registry may not exist yet; ignore.
  }
  // Include cwd if it has a fork state dir.
  const cwdState = resolveInForkStateDir(process.cwd());
  if (fs.existsSync(cwdState)) {
    out.add(process.cwd());
  }
  return [...out];
}

export function readLocalCapabilityExtensions(opts?: {
  forkPaths?: string[];
}): LocalExtensionScanResult {
  const forkPaths = collectForkPaths(opts?.forkPaths);
  const extensions: LocalExtensionLoadResult[] = [];
  const errors: LocalExtensionLoadError[] = [];

  for (const forkPath of forkPaths) {
    const dir = extensionsDirFor(forkPath);
    if (!fs.existsSync(dir)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch (err) {
      errors.push({ filePath: dir, reason: `Unable to read directory: ${(err as Error).message}` });
      continue;
    }

    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".json")) continue;
      const filePath = path.join(dir, entry);

      let raw: string;
      try {
        raw = fs.readFileSync(filePath, "utf8");
      } catch (err) {
        errors.push({ filePath, reason: `Unable to read: ${(err as Error).message}` });
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        errors.push({ filePath, reason: `Invalid JSON: ${(err as Error).message}` });
        continue;
      }

      const verdict = validateLocalCapabilityExtension(parsed);
      if (!verdict.ok) {
        const reason = verdict.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
        errors.push({ filePath, reason });
        continue;
      }

      const envelope = parsed as LocalCapabilityExtension;
      const nodeWithProvenance: CmsCapabilityNode = {
        ...envelope.node,
        provenance: {
          source: "local-extension",
          fetchedAt: new Date().toISOString(),
          filePath,
        },
      };

      extensions.push({
        node: nodeWithProvenance,
        filePath,
        forkPath,
        active: envelope.active,
        note: envelope.note,
      });
    }
  }

  return { extensions, errors, scannedForkPaths: forkPaths };
}

/**
 * Merge local extensions into a hosted node list. Local extensions with
 * `active === false` are filtered out. On slug collision the local
 * extension wins and the provenance is preserved; the hosted node is
 * surfaced as an overridden reference in the returned `overriddenSlugs`
 * list so CLI renderers can flag the difference.
 */
export interface MergedCapabilityNodeSet {
  nodes: CmsCapabilityNode[];
  overriddenSlugs: string[];
  localExtensionCount: number;
  errors: LocalExtensionLoadError[];
}

export function mergeLocalExtensions(
  hostedNodes: CmsCapabilityNode[],
  scan: LocalExtensionScanResult,
): MergedCapabilityNodeSet {
  const bySlug = new Map(hostedNodes.map((n) => [n.slug, n]));
  const overriddenSlugs: string[] = [];
  let localExtensionCount = 0;

  for (const { node, active } of scan.extensions) {
    if (!active) continue;
    if (bySlug.has(node.slug)) overriddenSlugs.push(node.slug);
    bySlug.set(node.slug, node);
    localExtensionCount += 1;
  }

  return {
    nodes: [...bySlug.values()],
    overriddenSlugs,
    localExtensionCount,
    errors: scan.errors,
  };
}

export function resolveLocalExtensionDir(forkPath: string): string {
  return extensionsDirFor(forkPath);
}
