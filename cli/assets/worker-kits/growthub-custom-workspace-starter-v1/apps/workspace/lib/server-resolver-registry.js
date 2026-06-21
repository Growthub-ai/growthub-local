/**
 * Server Resolver Registry IO V1 — the confined, server-only bridge between the
 * pure unified-resolver-registry deriver and the filesystem.
 *
 * Responsibilities (server-only; the browser never imports this):
 *   - read the provenance header off each resolver file (to tag
 *     helper-generated vs static-file provenance)
 *   - persist the externalized, agent-readable index artifact and the endpoint
 *     manifest (gated by persistence mode — read-only runtimes skip silently
 *     and the live derivation is still returned over the API)
 *
 * The artifacts are PROJECTIONS of the governed records — do-not-edit, and kept
 * in sync by this write-through. Never logs file contents. Contract:
 * `@growthub/api-contract/resolver-registry`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { describePersistenceMode } from "@/lib/workspace-config";
import {
  RESOLVER_REGISTRY_DIR,
  RESOLVER_REGISTRY_INDEX_FILE,
  RESOLVER_ENDPOINT_MANIFEST_FILE,
  parseResolverFileHeader,
  slugifyIntegrationId,
  buildEndpointManifest,
} from "@/lib/unified-resolver-registry";

const HEADER_BYTES = 600;

function resolversDirAbs() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), RESOLVER_REGISTRY_DIR);
}

/**
 * Read the provenance header of every resolver file.
 * Returns { [slug]: { generated, integrationId, record } }. Never throws.
 */
async function readResolverFileMeta() {
  const dir = resolversDirAbs();
  const meta = {};
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return meta;
  }
  const jsFiles = entries.filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."));
  await Promise.all(
    jsFiles.map(async (file) => {
      const slug = slugifyIntegrationId(file, "");
      if (!slug) return;
      try {
        const handle = await fs.open(path.join(dir, file), "r");
        try {
          const buf = Buffer.alloc(HEADER_BYTES);
          const { bytesRead } = await handle.read(buf, 0, HEADER_BYTES, 0);
          meta[slug] = parseResolverFileHeader(buf.toString("utf8", 0, bytesRead));
        } finally {
          await handle.close();
        }
      } catch {
        // Unreadable file — leave it out of meta; the deriver still sees the
        // filename via `files` and classifies it as static-file.
      }
    }),
  );
  return meta;
}

/**
 * Persist the index + endpoint manifest artifacts (gated). Returns
 * { written: boolean, reason?: string }. Read-only runtimes are not an error —
 * the live API derivation remains the source of truth at request time.
 */
async function persistResolverRegistryArtifacts(index) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return { written: false, reason: persistence.reason || "read-only runtime" };
  }
  const dir = resolversDirAbs();
  try {
    await fs.mkdir(dir, { recursive: true });
    const indexPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), RESOLVER_REGISTRY_INDEX_FILE);
    const manifestPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), RESOLVER_ENDPOINT_MANIFEST_FILE);
    // Confinement — both artifacts live directly in the resolvers dir.
    if (path.dirname(indexPath) !== dir || path.dirname(manifestPath) !== dir) {
      return { written: false, reason: "artifact path escaped the resolvers dir" };
    }
    const manifest = buildEndpointManifest(index, index.generatedAt);
    await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return { written: true };
  } catch (err) {
    return { written: false, reason: err?.message || "artifact write failed" };
  }
}

export { readResolverFileMeta, persistResolverRegistryArtifacts };
