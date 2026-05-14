/**
 * GTM / sales distillation — build training corpora from governed sandbox run
 * receipts persisted under growthub.source-records.json (see sandbox-run route).
 *
 * OpenAI-style SFT lines: { messages: [ system, user, assistant ] }
 * Envelope lines: structured trace for offline teacher labeling (qualityLabel on row).
 */

function sandboxRunSourceId(objectId, name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!objectId || !slug) return null;
  return `sandbox:${objectId}:${slug}`;
}

function findSandboxRow(workspaceConfig, objectId, name) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const object = objects.find(
    (entry) => entry?.id === objectId && entry?.objectType === "sandbox-environment",
  );
  if (!object) return null;
  const wanted = String(name || "").trim();
  const row = (Array.isArray(object.rows) ? object.rows : []).find(
    (r) => String(r?.Name || "").trim() === wanted,
  );
  if (!row) return null;
  return { object, row };
}

/**
 * @param {object} workspaceConfig
 * @param {Record<string, { records?: unknown[] }>} sourceRecordsRoot — full sidecar map
 * @param {{ objectId: string, name: string, format: "sft" | "envelope", goldOnly?: boolean, exitZeroOnly?: boolean }} opts
 * @returns {{ lines: string[], sourceId: string | null, skipped: number }}
 */
export function buildGtmDistillationExport(workspaceConfig, sourceRecordsRoot, opts) {
  const objectId = String(opts.objectId || "").trim();
  const name = String(opts.name || "").trim();
  const format = opts.format === "envelope" ? "envelope" : "sft";
  const goldOnly = Boolean(opts.goldOnly);
  const exitZeroOnly = opts.exitZeroOnly !== false;

  const resolved = findSandboxRow(workspaceConfig, objectId, name);
  if (!resolved) {
    return { lines: [], sourceId: sandboxRunSourceId(objectId, name), skipped: 0, missingRow: true };
  }

  const { row } = resolved;
  const sourceId = sandboxRunSourceId(objectId, name);
  if (!sourceId) {
    return { lines: [], sourceId: null, skipped: 0, missingRow: true };
  }

  const ql = String(row.traceQualityLabel || "").trim().toLowerCase();
  if (goldOnly && ql !== "gold") {
    return {
      lines: [],
      sourceId,
      skipped: 0,
      rejectedReason: "goldOnly requested but row.traceQualityLabel is not gold",
    };
  }

  const bucket = sourceRecordsRoot && typeof sourceRecordsRoot === "object" ? sourceRecordsRoot[sourceId] : null;
  const records = Array.isArray(bucket?.records) ? bucket.records : [];
  const lines = [];
  let skipped = 0;

  for (const rec of records) {
    if (!rec || typeof rec !== "object") {
      skipped += 1;
      continue;
    }
    const exitCode = rec.exitCode;
    if (exitZeroOnly && exitCode !== 0) {
      skipped += 1;
      continue;
    }
    if (exitZeroOnly && rec.error) {
      skipped += 1;
      continue;
    }
    const system = String(rec.instructions ?? "");
    const user = String(rec.command ?? "");
    const assistant = String(rec.stdout ?? "");
    if (!user && !assistant) {
      skipped += 1;
      continue;
    }

    if (format === "sft") {
      lines.push(
        JSON.stringify({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
            { role: "assistant", content: assistant },
          ],
        }),
      );
    } else {
      const role = String(row.gtmAgentForm || "").trim() || "unspecified";
      lines.push(
        JSON.stringify({
          traceId: rec.runId || null,
          role,
          input: {
            instructions: system,
            command: user,
          },
          output: {
            stdout: assistant,
            stderr: String(rec.stderr ?? ""),
            exitCode: rec.exitCode ?? null,
          },
          teacherModel: row.localModel ? String(row.localModel).trim() || null : null,
          qualityLabel: ql === "" || ql === "unset" ? null : ql,
          adapter: rec.adapter || null,
          ranAt: rec.ranAt || null,
          sourceId,
        }),
      );
    }
  }

  return { lines, sourceId, skipped };
}

export { sandboxRunSourceId, findSandboxRow };
