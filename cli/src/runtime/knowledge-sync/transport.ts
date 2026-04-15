/**
 * Knowledge Sync Transport — Local FS Operations
 *
 * Serialize, sign, verify, and deserialize KnowledgeSyncEnvelopes.
 * Handles local filesystem discovery of sibling workspaces (folders on
 * the user's machine representing ecosystems / worker kits).
 *
 * No network calls here — pure filesystem + crypto primitives.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  KnowledgeSyncEnvelope,
  KnowledgeSyncItem,
} from "@paperclipai/shared/types/knowledge-sync.js";
import { sha256Utf8 } from "@paperclipai/shared/kb-skill-bundle";

// ---------------------------------------------------------------------------
// Envelope serialization
// ---------------------------------------------------------------------------

export interface SerializedEnvelope {
  version: 1;
  envelope: KnowledgeSyncEnvelope;
  exportedAt: string;
  source: "cli-export" | "server-export" | "agent-run";
}

export function serializeEnvelope(
  envelope: KnowledgeSyncEnvelope,
  source: SerializedEnvelope["source"] = "cli-export",
): string {
  const payload: SerializedEnvelope = {
    version: 1,
    envelope,
    exportedAt: new Date().toISOString(),
    source,
  };
  return JSON.stringify(payload, null, 2);
}

export function deserializeEnvelope(raw: string): KnowledgeSyncEnvelope {
  const parsed = JSON.parse(raw) as Partial<SerializedEnvelope>;
  if (parsed.version !== 1 || !parsed.envelope) {
    throw new Error("Invalid knowledge sync envelope: missing version or envelope field");
  }
  return parsed.envelope;
}

// ---------------------------------------------------------------------------
// Integrity verification
// ---------------------------------------------------------------------------

/**
 * Verifies the itemsSignature field of an envelope against the actual items.
 * Returns true if the signature matches (envelope has not been tampered with).
 */
export async function verifyEnvelopeSignature(envelope: KnowledgeSyncEnvelope): Promise<boolean> {
  try {
    const computed = await sha256Utf8(JSON.stringify(envelope.items));
    return computed === envelope.itemsSignature;
  } catch {
    return false;
  }
}

/**
 * Signs the items in an envelope, returning an envelope with an updated signature.
 * Use when creating a new envelope or after modifying items.
 */
export async function signEnvelope(
  envelope: KnowledgeSyncEnvelope,
): Promise<KnowledgeSyncEnvelope> {
  const itemsSignature = await sha256Utf8(JSON.stringify(envelope.items));
  return { ...envelope, itemsSignature };
}

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

/**
 * Returns only the items from the envelope whose bodySha256 is NOT in the
 * provided set of already-known hashes.
 */
export function filterNewItems(
  items: KnowledgeSyncItem[],
  knownSha256s: Set<string>,
): KnowledgeSyncItem[] {
  return items.filter((item) => !knownSha256s.has(item.bodySha256));
}

// ---------------------------------------------------------------------------
// Filesystem path helpers for local workspace discovery
// ---------------------------------------------------------------------------

/** Default locations to search for sibling Paperclip config files. */
const DEFAULT_SEARCH_ROOTS = [
  "~/.paperclip/instances",
];

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? "/",
      p.slice(2),
    );
  }
  return p;
}

export interface LocalWorkspaceDiscoveryResult {
  instanceId: string;
  configPath: string;
  label?: string;
}

/**
 * Discovers all local Paperclip workspace config files under the standard
 * instances directory. Returns a list of discovered workspaces.
 * Non-fatal: returns empty array on any filesystem error.
 */
export function discoverLocalWorkspaces(
  searchRoots: string[] = DEFAULT_SEARCH_ROOTS,
): LocalWorkspaceDiscoveryResult[] {
  const results: LocalWorkspaceDiscoveryResult[] = [];

  for (const root of searchRoots) {
    const expanded = expandHome(root);
    if (!fs.existsSync(expanded)) continue;

    try {
      const entries = fs.readdirSync(expanded, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const configPath = path.join(expanded, entry.name, "config.json");
        if (!fs.existsSync(configPath)) continue;

        try {
          const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
          const auth = raw.auth as Record<string, unknown> | undefined;
          const label = typeof auth?.growthubWorkspaceLabel === "string"
            ? auth.growthubWorkspaceLabel
            : undefined;

          results.push({
            instanceId: entry.name,
            configPath,
            label,
          });
        } catch {
          // Unreadable config — skip silently
        }
      }
    } catch {
      // Unreadable directory — skip silently
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Envelope file I/O
// ---------------------------------------------------------------------------

/**
 * Writes a serialized envelope to a file. Creates parent directories as needed.
 */
export function writeEnvelopeFile(
  envelope: KnowledgeSyncEnvelope,
  filePath: string,
  source: SerializedEnvelope["source"] = "cli-export",
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeEnvelope(envelope, source), "utf-8");
}

/**
 * Reads and deserializes an envelope from a file.
 */
export function readEnvelopeFile(filePath: string): KnowledgeSyncEnvelope {
  const raw = fs.readFileSync(filePath, "utf-8");
  return deserializeEnvelope(raw);
}
