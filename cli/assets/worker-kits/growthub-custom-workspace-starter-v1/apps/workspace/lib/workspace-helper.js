/**
 * Workspace Helper — grammar-aware planning engine.
 *
 * This module provides three public functions:
 *
 *   sanitizeWorkspaceSnapshot(workspaceConfig)
 *     Strip credentials, envRefs values, and source-record contents from the
 *     live config so only schema shape enters the inference prompt. Never
 *     let secret-adjacent fields travel to a local model.
 *
 *   buildHelperSystemPrompt(snapshot, intent)
 *     Return a workspace-grammar-injected system prompt. The prompt teaches
 *     the local model about the PATCH allowlist, known widget kinds, known
 *     object types, and proposal shape — so its JSON output maps cleanly to
 *     the apply step without heuristic translation.
 *
 *   parseHelperEnvelope(rawEnvelope, intent)
 *     Unwrap the growthub-local-model-sandbox-v1 envelope returned by the
 *     local-intelligence adapter and extract typed proposals[].
 *
 *   validateProposals(proposals)
 *     Check each proposal type against WORKSPACE_HELPER_PROPOSAL_TYPES and
 *     confirm affectedField is consistent with PROPOSAL_TYPE_TO_PATCH_FIELD.
 *
 * The local-intelligence adapter is the only execution backend used here.
 * No tool execution, no credential access, no direct workspace writes.
 */

const WORKSPACE_HELPER_PROPOSAL_TYPES = [
  "dashboard.create",
  "dashboard.update",
  "widgetType.bind",
  "canvas.widget.add",
  "canvas.tab.create",
  "dataModel.object.create",
  "dataModel.object.update",
  "dataModel.row.add",
  "repair.binding",
  "explain.object",
];

const PROPOSAL_TYPE_TO_PATCH_FIELD = {
  "dashboard.create": "dashboards",
  "dashboard.update": "dashboards",
  "widgetType.bind": "widgetTypes",
  "canvas.widget.add": "canvas",
  "canvas.tab.create": "canvas",
  "dataModel.object.create": "dataModel",
  "dataModel.object.update": "dataModel",
  "dataModel.row.add": "dataModel",
  "repair.binding": "dataModel",
  "explain.object": "dataModel",
};

const KNOWN_WIDGET_KINDS = ["chart", "view", "iframe", "rich-text"];
const KNOWN_OBJECT_TYPES = ["data-source", "api-registry", "people", "tasks", "sandbox-environment", "custom"];
const PATCH_ALLOWLIST = ["dashboards", "widgetTypes", "canvas", "dataModel"];

const INTENT_DESCRIPTIONS = {
  build_dashboard:
    "Draft one or more dashboard objects and the widget layout to populate them. Propose new dashboards with starter sections and widget placements that match the user's business brief.",
  create_widget:
    "Suggest which widgetTypes belong on the workspace based on the object schema and target KPIs. Propose widgetType entries and canvas widget placements.",
  register_api:
    "Draft API Registry rows (dataModel object of objectType api-registry) including integration labels, credential prompts, base URL, endpoint, auth header, and method.",
  create_object:
    "Translate the user's domain language into a new dataModel object: objectType, label, columns, starter rows, and field settings that make sense for their business.",
  edit_view:
    "Propose updates to an existing dashboard or canvas configuration to improve the view layout, widget bindings, or tab structure.",
  repair:
    "Inspect the workspace snapshot for broken references, missing bindings, empty objects, or incomplete views. Propose the minimum changes needed to repair each issue.",
  explain:
    "Return a clear explanation of what one or more workspace objects, widgets, or configurations do. Use the explain.object proposal type — payload is { explanation: string }.",
};

/**
 * Strip envRefs values, credentials, and row data from the live config.
 * Only schema shape (column names, object types, dashboard ids/names) travels
 * into the inference prompt.
 *
 * Accepts both shapes:
 *   - a full workspaceConfig (with `dataModel.objects`, `dashboards`, `canvas`).
 *   - an already-sanitized snapshot (with `dataModelObjects`, `canvasSummary`).
 * In both cases the output is a fresh snapshot containing only schema shape.
 */
function sanitizeWorkspaceSnapshot(input) {
  if (!input || typeof input !== "object") return {};

  const isSnapshotShape =
    Array.isArray(input.dataModelObjects) ||
    typeof input.canvasSummary === "object";

  const dashboards = Array.isArray(input.dashboards)
    ? input.dashboards.map((d) => ({
        id: typeof d?.id === "string" ? d.id : undefined,
        name: typeof d?.name === "string" ? d.name : undefined,
        status: typeof d?.status === "string" ? d.status : undefined,
      }))
    : [];

  const widgetTypes = Array.isArray(input.widgetTypes)
    ? input.widgetTypes.map((w) => ({
        kind: typeof w?.kind === "string" ? w.kind : undefined,
        label: typeof w?.label === "string" ? w.label : undefined,
      }))
    : [];

  let canvasSummary;
  if (isSnapshotShape && input.canvasSummary && typeof input.canvasSummary === "object") {
    canvasSummary = {
      widgetCount: Number.isFinite(input.canvasSummary.widgetCount) ? input.canvasSummary.widgetCount : 0,
      tabCount: Number.isFinite(input.canvasSummary.tabCount) ? input.canvasSummary.tabCount : 1,
      activeTabId: typeof input.canvasSummary.activeTabId === "string" ? input.canvasSummary.activeTabId : undefined,
    };
  } else if (input.canvas && typeof input.canvas === "object") {
    canvasSummary = {
      widgetCount: Array.isArray(input.canvas.widgets) ? input.canvas.widgets.length : 0,
      tabCount: Array.isArray(input.canvas.tabs) ? input.canvas.tabs.length : 1,
      activeTabId: typeof input.canvas.activeTabId === "string" ? input.canvas.activeTabId : undefined,
    };
  } else {
    canvasSummary = { widgetCount: 0, tabCount: 1 };
  }

  const rawObjects = isSnapshotShape
    ? (Array.isArray(input.dataModelObjects) ? input.dataModelObjects : [])
    : (Array.isArray(input.dataModel?.objects) ? input.dataModel.objects : []);
  const dataModelObjects = rawObjects.map((obj) => ({
    id: typeof obj?.id === "string" ? obj.id : undefined,
    label: typeof obj?.label === "string" ? obj.label : undefined,
    objectType: typeof obj?.objectType === "string" ? obj.objectType : undefined,
    columns: Array.isArray(obj?.columns) ? obj.columns.filter((c) => typeof c === "string") : [],
    rowCount: Number.isFinite(obj?.rowCount)
      ? obj.rowCount
      : (Array.isArray(obj?.rows) ? obj.rows.length : 0),
  }));

  return {
    workspaceId: typeof input.workspaceId === "string" ? input.workspaceId : (typeof input.id === "string" ? input.id : undefined),
    workspaceName: typeof input.workspaceName === "string" ? input.workspaceName : (typeof input.name === "string" ? input.name : undefined),
    dashboards,
    widgetTypes,
    canvasSummary,
    dataModelObjects,
  };
}

/**
 * Build the workspace-grammar-injected system prompt for a given intent.
 * The prompt teaches the model the exact proposal shape, PATCH allowlist,
 * and schema constraints so output maps cleanly to the apply step.
 */
function buildHelperSystemPrompt(snapshot, intent) {
  const intentDesc = INTENT_DESCRIPTIONS[intent] || INTENT_DESCRIPTIONS["explain"];

  const snapshotSummary = snapshot
    ? [
        snapshot.workspaceName ? `Workspace: "${snapshot.workspaceName}"` : null,
        snapshot.dashboards?.length
          ? `Dashboards: ${snapshot.dashboards.map((d) => `"${d.name}" (${d.status || "draft"})`).join(", ")}`
          : "Dashboards: none yet",
        snapshot.widgetTypes?.length
          ? `Widget types registered: ${snapshot.widgetTypes.map((w) => w.kind).join(", ")}`
          : "Widget types: none yet",
        snapshot.dataModelObjects?.length
          ? `Data model objects: ${snapshot.dataModelObjects.map((o) => `"${o.label}" [${o.objectType || "custom"}] (${o.rowCount} rows)`).join("; ")}`
          : "Data model objects: none yet",
        snapshot.canvasSummary
          ? `Canvas: ${snapshot.canvasSummary.widgetCount} widgets across ${snapshot.canvasSummary.tabCount} tab(s)`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "No existing workspace context provided.";

  return [
    "You are the Growthub Workspace Helper — a governed, workspace-grammar-aware planning engine.",
    "",
    "## Your task",
    intentDesc,
    "",
    "## Workspace context",
    snapshotSummary,
    "",
    "## Growthub workspace grammar",
    `Known widget kinds: ${KNOWN_WIDGET_KINDS.join(", ")}`,
    `Known object types: ${KNOWN_OBJECT_TYPES.join(", ")}`,
    `PATCH allowlist (only these keys can be mutated): ${PATCH_ALLOWLIST.join(", ")}`,
    "",
    "## Valid proposal types and their target patch field",
    WORKSPACE_HELPER_PROPOSAL_TYPES.map(
      (t) => `  ${t} → ${PROPOSAL_TYPE_TO_PATCH_FIELD[t]}`
    ).join("\n"),
    "",
    "## Output format — reply with a SINGLE JSON object only",
    JSON.stringify({
      summary: "One sentence: what you are proposing and why",
      proposals: [
        {
          type: "<proposal type from the list above>",
          affectedField: "<dashboards | widgetTypes | canvas | dataModel>",
          payload: { "...": "partial config fragment for this patch field" },
          rationale: "Why this change helps the user",
          confidence: 0.9,
        },
      ],
      warnings: ["any non-blocking issues or caveats"],
    }),
    "",
    "Rules:",
    "- Use only proposal types from the list above. Never invent new types.",
    "- affectedField must match PROPOSAL_TYPE_TO_PATCH_FIELD exactly.",
    "- payload must be a partial fragment valid for its affectedField, matching Growthub workspace schema.",
    "- Do NOT include envRefs values, API keys, or secrets in any payload.",
    "- toolIntents are not applicable here — the helper is propose-only.",
    "- If you cannot produce valid proposals for the given intent, return an empty proposals array with a clear warning.",
  ].join("\n");
}

/**
 * Unwrap the growthub-local-model-sandbox-v1 envelope from the
 * local-intelligence adapter and extract typed proposals.
 *
 * The adapter stdout is a stringified envelope object. Inside the envelope,
 * result.json should contain { summary, proposals, warnings }.
 */
function parseHelperEnvelope(rawEnvelope, intent) {
  let envelope;
  try {
    envelope = typeof rawEnvelope === "string" ? JSON.parse(rawEnvelope) : rawEnvelope;
  } catch {
    return {
      summary: "Failed to parse helper response.",
      proposals: [],
      warnings: ["Adapter returned non-JSON output."],
      confidence: 0,
      model: "unknown",
      adapterMode: "unknown",
      endpoint: "unknown",
      latencyMs: 0,
    };
  }

  const result = envelope?.result ?? {};
  const adapterMeta = envelope?.adapter ?? {};
  const latencyMs = typeof envelope?.latencyMs === "number" ? envelope.latencyMs : 0;

  let parsed;
  if (result.json && typeof result.json === "object") {
    parsed = result.json;
  } else if (typeof result.text === "string") {
    try {
      parsed = JSON.parse(result.text);
    } catch {
      parsed = null;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      summary: result.text || "No structured response from helper.",
      proposals: [],
      warnings: Array.isArray(result.warnings) ? result.warnings : ["Model did not return structured JSON proposals."],
      confidence: 0,
      model: adapterMeta.modelId || "unknown",
      adapterMode: adapterMeta.mode || "unknown",
      endpoint: adapterMeta.endpoint || "unknown",
      latencyMs,
    };
  }

  const rawProposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  const validProposals = rawProposals.filter(
    (p) =>
      p &&
      typeof p.type === "string" &&
      WORKSPACE_HELPER_PROPOSAL_TYPES.includes(p.type) &&
      p.payload &&
      typeof p.payload === "object"
  );
  const skippedCount = rawProposals.length - validProposals.length;

  const warnings = Array.isArray(parsed.warnings) ? [...parsed.warnings] : [];
  if (skippedCount > 0) {
    warnings.push(`${skippedCount} proposal(s) had unknown types and were removed.`);
  }

  const proposals = validProposals.map((p) => ({
    type: p.type,
    affectedField: PROPOSAL_TYPE_TO_PATCH_FIELD[p.type],
    payload: p.payload,
    rationale: typeof p.rationale === "string" ? p.rationale : "",
    confidence: typeof p.confidence === "number" ? p.confidence : undefined,
  }));

  const avgConfidence =
    proposals.length > 0
      ? proposals.reduce((sum, p) => sum + (p.confidence ?? 0.5), 0) / proposals.length
      : 0;

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : `Workspace helper response for intent: ${intent}`,
    proposals,
    warnings,
    confidence: avgConfidence,
    model: adapterMeta.modelId || "unknown",
    adapterMode: adapterMeta.mode || "unknown",
    endpoint: adapterMeta.endpoint || "unknown",
    latencyMs,
  };
}

/**
 * Validate proposals array before returning to the caller.
 * Returns { valid: WorkspaceHelperProposal[], errors: string[] }.
 */
function validateProposals(proposals) {
  if (!Array.isArray(proposals)) {
    return { valid: [], errors: ["proposals must be an array"] };
  }

  const valid = [];
  const errors = [];

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    if (!p || typeof p !== "object") {
      errors.push(`proposal[${i}]: must be an object`);
      continue;
    }
    if (!WORKSPACE_HELPER_PROPOSAL_TYPES.includes(p.type)) {
      errors.push(`proposal[${i}]: unknown type "${p.type}"`);
      continue;
    }
    if (!p.payload || typeof p.payload !== "object") {
      errors.push(`proposal[${i}]: payload must be an object`);
      continue;
    }
    const expectedField = PROPOSAL_TYPE_TO_PATCH_FIELD[p.type];
    if (p.affectedField && p.affectedField !== expectedField) {
      errors.push(
        `proposal[${i}]: affectedField "${p.affectedField}" does not match expected "${expectedField}" for type "${p.type}"`
      );
      continue;
    }
    valid.push({ ...p, affectedField: expectedField });
  }

  return { valid, errors };
}

export {
  sanitizeWorkspaceSnapshot,
  buildHelperSystemPrompt,
  parseHelperEnvelope,
  validateProposals,
  WORKSPACE_HELPER_PROPOSAL_TYPES,
  PROPOSAL_TYPE_TO_PATCH_FIELD,
  KNOWN_WIDGET_KINDS,
  KNOWN_OBJECT_TYPES,
  PATCH_ALLOWLIST,
};
