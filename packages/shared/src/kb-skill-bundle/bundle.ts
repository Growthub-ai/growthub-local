import {
  PAPERCLIP_SKILL_BUNDLE_VERSION,
  type BuiltSkillBundle,
  type KbSkillDocPayload,
  type PaperclipSkillBundleItemV1,
} from "./types.js";

export async function sha256Utf8(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is not available in this environment");
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Truncate UTF-8 string to at most `maxBytes` (may split a codepoint like Buffer.subarray). */
function sliceUtf8ToMaxBytes(str: string, maxBytes: number): string {
  const enc = new TextEncoder();
  const buf = enc.encode(str);
  if (buf.length <= maxBytes) return str;
  const slice = buf.subarray(0, maxBytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(slice);
}

export interface BuildSkillBundleOptions {
  orderedIds: string[];
  docsById: Map<string, KbSkillDocPayload>;
  maxTotalBytes: number;
}

/**
 * Builds a deterministic v1 bundle and aligned rendered bodies for markdown / adapters.
 */
export async function buildPaperclipSkillBundleV1(opts: BuildSkillBundleOptions): Promise<BuiltSkillBundle> {
  const { orderedIds, docsById, maxTotalBytes } = opts;
  let totalSoFar = 0;
  let globalTruncated = false;
  const items: PaperclipSkillBundleItemV1[] = [];
  const renderedBodies: string[] = [];

  for (const id of orderedIds) {
    const doc = docsById.get(id);
    if (!doc) continue;

    let body = doc.body;
    let truncated = false;
    const bodyBytes = utf8ByteLength(body);
    const remaining = maxTotalBytes - totalSoFar;

    if (bodyBytes > remaining) {
      if (remaining <= 0) {
        globalTruncated = true;
        break;
      }
      body = sliceUtf8ToMaxBytes(body, remaining);
      truncated = true;
      globalTruncated = true;
      totalSoFar += utf8ByteLength(body);
    } else {
      totalSoFar += bodyBytes;
    }

    renderedBodies.push(body);
    items.push({
      id: doc.id,
      name: doc.name,
      format: doc.format,
      source: doc.source,
      bodySha256: await sha256Utf8(body),
      bodyCharCount: body.length,
      truncated,
    });
  }

  return {
    version: PAPERCLIP_SKILL_BUNDLE_VERSION,
    items,
    totalBodyBytes: totalSoFar,
    limits: { maxTotalBytes },
    truncated: globalTruncated,
    renderedBodies,
  };
}

export function formatRenderedSkillsMarkdown(
  docsById: Map<string, KbSkillDocPayload>,
  built: BuiltSkillBundle,
): string {
  const lines: string[] = ["## Assigned knowledge-base skills", ""];

  for (let n = 0; n < built.items.length; n++) {
    const itemMeta = built.items[n]!;
    const doc = docsById.get(itemMeta.id);
    if (!doc) continue;
    const body = built.renderedBodies[n] ?? "";

    lines.push(`### ${n + 1}. ${doc.name}`);
    if (doc.description?.trim()) {
      lines.push(doc.description.trim());
      lines.push("");
    }
    lines.push(body.trimEnd());
    if (itemMeta.truncated) {
      lines.push("");
      lines.push("_(truncated)_");
    }
    lines.push("");
  }
  if (built.truncated) {
    lines.push("_Total skill content was capped to fit the configured byte limit._");
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
