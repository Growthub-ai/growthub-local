/**
 * Source-record sidecar rows as reference options (growthub.source-records.json).
 */

import { readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { normalizeReferenceOption } from "@/lib/workspace-data-model";

async function resolveSourceRecordReferenceOptions(sourceId, { query = "", limit = 25 } = {}) {
  if (!sourceId || typeof sourceId !== "string") {
    return { options: [], reason: "missing-source-id" };
  }
  const sidecar = await readWorkspaceSourceRecords(sourceId.trim());
  const records = Array.isArray(sidecar?.records) ? sidecar.records : [];
  const needle = String(query || "").trim().toLowerCase();
  const opts = [];
  records.forEach((rec, index) => {
    const value = String(rec?.id ?? rec?.runId ?? `idx-${index}`).trim();
    if (!value) return;
    const label = String(rec?.label ?? rec?.runId ?? value).trim() || value;
    if (needle && !`${value} ${label}`.toLowerCase().includes(needle)) return;
    opts.push(
      normalizeReferenceOption({
        value,
        label,
        source: "source-records",
        status: typeof rec?.status === "string" ? rec.status : undefined,
        metadata: { ranAt: rec?.ranAt }
      })
    );
  });
  return { options: opts.filter(Boolean).slice(0, limit), reason: null };
}

export { resolveSourceRecordReferenceOptions };
