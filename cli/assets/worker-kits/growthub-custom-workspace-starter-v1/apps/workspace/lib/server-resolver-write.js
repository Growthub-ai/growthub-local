/**
 * Server Resolver Write V1 — the single, confined, gated fs write for resolver
 * files. Used by the helper apply route's resolver.create lane (and available
 * to register-resolver). Server-only.
 *
 * AWaC topology: writes only in filesystem mode; read-only runtimes throw a
 * coded error with guidance (the same 409 contract the rest of the workspace
 * uses). Path is confined to lib/adapters/integrations/resolvers — never
 * escapes. Never logs file contents.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { describePersistenceMode } from "@/lib/workspace-config";
import { resolveResolverFilePath } from "@/lib/workspace-resolver-proposal";

const MAX_RESOLVER_SIZE = 256 * 1024;

/**
 * Write a resolver file from a validated proposal. Returns
 * { saved:true, path, filename } or throws a coded error:
 *   - WORKSPACE_PERSISTENCE_READ_ONLY (read-only runtime; carries guidance)
 *   - INVALID_RESOLVER_WRITE (bad path / code)
 *   - WORKSPACE_PERSISTENCE_PATH_REFUSED (escaped the resolver dir)
 */
async function writeResolverProposalFile(proposal) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    const error = new Error(persistence.reason || "resolver write requires a writable filesystem runtime");
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.guidance = persistence.guidance || "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use local development mode.";
    throw error;
  }
  const target = (proposal?.target && proposal.target.ok)
    ? proposal.target
    : resolveResolverFilePath(proposal?.payload?.integrationId);
  if (!target || !target.ok) {
    const error = new Error(target?.error || "invalid resolver target path");
    error.code = "INVALID_RESOLVER_WRITE";
    throw error;
  }
  const code = String(proposal?.code || "");
  if (!code.includes("registerSourceResolver")) {
    const error = new Error("resolver code must call registerSourceResolver()");
    error.code = "INVALID_RESOLVER_WRITE";
    throw error;
  }
  if (Buffer.byteLength(code, "utf8") > MAX_RESOLVER_SIZE) {
    const error = new Error(`resolver file must be smaller than ${MAX_RESOLVER_SIZE / 1024} KB`);
    error.code = "INVALID_RESOLVER_WRITE";
    throw error;
  }

  const resolversDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), target.dir);
  const outPath = path.join(resolversDir, target.filename);
  if (path.dirname(outPath) !== resolversDir) {
    const error = new Error("invalid filename — path traversal not allowed");
    error.code = "WORKSPACE_PERSISTENCE_PATH_REFUSED";
    throw error;
  }

  await fs.mkdir(resolversDir, { recursive: true });
  await fs.writeFile(outPath, code, "utf8");
  return { saved: true, path: target.path, filename: target.filename };
}

export { writeResolverProposalFile };
