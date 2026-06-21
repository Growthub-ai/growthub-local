/**
 * Scheduler Artifact Guard V1 — provenance + drift guard for generated scheduler
 * endpoint files (finding 12). Generated artifacts are a PROJECTION, never the
 * source of truth; this guard lets a human or a background agent tell apart:
 *
 *   - generated      — banner present, matches a governed workflow + registry row
 *   - orphan         — generated file with no workflow row referencing it
 *   - stale          — banner metadata (provider/cron) disagrees with the row
 *   - hand-edited     — file present but banner missing/unparseable
 *   - missing-artifact — a provisioned row whose generated file is absent
 *
 * Pure: takes the artifact list + their sources + the workspace config. No fs.
 * The CLI/script wrapper (scripts/check-scheduler-artifacts.mjs) supplies inputs.
 */

import { parseArtifactBanner, resolveSchedulerFilePath } from "./workspace-scheduler-proposal.js";
import { normalizeProvider } from "./scheduler-providers.js";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function collectSchedulerWorkflows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rows = [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (clean(row?.schedulerRegistryId) || clean(row?.scheduleProvider)) {
        rows.push({ objectId: object.id, row });
      }
    }
  }
  return rows;
}

/**
 * @param {object} input
 * @param {object} input.workspaceConfig
 * @param {{ filename: string, source: string }[]} input.artifacts  generated files in the schedulers dir
 * @returns { ok, findings:[{ filename|integrationId, status, detail }] }
 */
function auditSchedulerArtifacts(input = {}) {
  const workspaceConfig = input.workspaceConfig || {};
  const artifacts = Array.isArray(input.artifacts) ? input.artifacts : [];
  const workflows = collectSchedulerWorkflows(workspaceConfig);
  const findings = [];

  // Map expected artifact filename → workflow row.
  const expected = new Map();
  for (const { objectId, row } of workflows) {
    const integrationId = clean(row.schedulerRegistryId);
    const provider = normalizeProvider(row.scheduleProvider);
    if (!integrationId) continue;
    const target = resolveSchedulerFilePath(integrationId, provider);
    if (target.ok) expected.set(target.filename, { objectId, row, integrationId, provider });
  }

  const byFilename = new Map(artifacts.map((a) => [a.filename, a]));

  // 1. Every generated artifact must map to a governed row + parse cleanly.
  for (const artifact of artifacts) {
    const banner = parseArtifactBanner(artifact.source);
    if (!banner) {
      findings.push({ filename: artifact.filename, status: "hand-edited", detail: "no parseable provenance banner — treat as hand-edited, do not trust as generated" });
      continue;
    }
    const match = expected.get(artifact.filename);
    if (!match) {
      findings.push({ filename: artifact.filename, status: "orphan", detail: "generated scheduler file with no workflow row referencing it" });
      continue;
    }
    const { row, provider } = match;
    const rowCron = clean(row.scheduleCron) || null;
    if (banner.provider !== provider) {
      findings.push({ filename: artifact.filename, status: "stale", detail: `banner provider "${banner.provider}" != row provider "${provider}"` });
    } else if (clean(banner.cron) !== clean(rowCron) && (banner.cron || rowCron)) {
      findings.push({ filename: artifact.filename, status: "stale", detail: `banner cron "${banner.cron}" != row cron "${rowCron}" — re-provision to regenerate` });
    } else {
      findings.push({ filename: artifact.filename, status: "generated", detail: "matches governed workflow + cron" });
    }
  }

  // 2. Every provisioned workflow must have its generated artifact present.
  for (const [filename, match] of expected.entries()) {
    if (!byFilename.has(filename)) {
      const status = clean(match.row.scheduleStatus).toLowerCase();
      const bearing = ["scaffolded", "endpoint-confirmed", "schedule-created", "scheduled", "paused", "needs-reconfirm"].includes(status);
      findings.push({ filename, integrationId: match.integrationId, status: bearing ? "missing-artifact" : "not-yet-generated", detail: bearing ? "provisioned workflow has no generated artifact on disk" : "workflow not provisioned yet" });
    }
  }

  const bad = findings.filter((f) => ["orphan", "stale", "hand-edited", "missing-artifact"].includes(f.status));
  return { ok: bad.length === 0, findings, problems: bad };
}

export { auditSchedulerArtifacts, collectSchedulerWorkflows };
