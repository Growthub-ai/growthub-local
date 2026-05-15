/**
 * POST /api/workspace/helper/query
 *
 * Workspace-native helper endpoint. Accepts a natural-language business brief
 * and returns structured proposals valid against the workspace PATCH allowlist.
 *
 * This route is propose-only. No workspace config is mutated here. Accepted
 * proposals are applied through POST /api/workspace/helper/apply, which
 * validates each proposal against validateWorkspaceConfig before writing.
 *
 * Execution model:
 *   1. Read and sanitize the live growthub.config.json (or accept a snapshot).
 *   2. Build a workspace-grammar-injected system prompt via workspace-helper.js.
 *   3. Dispatch through the local-intelligence sandbox adapter.
 *   4. Parse the growthub-local-model-sandbox-v1 envelope.
 *   5. Validate proposals, write a run record to source-records, return response.
 *
 * Request body (WorkspaceHelperQuery):
 *   {
 *     intent: "build_dashboard" | "create_widget" | "register_api" |
 *             "create_object" | "edit_view" | "repair" | "explain",
 *     workspaceSnapshot?: WorkspaceHelperSnapshot,  // optional — server reads live config if omitted
 *     userPrompt: string,
 *     mode?: "propose",
 *     model?: string,
 *     adapterMode?: string,
 *     localEndpoint?: string,
 *   }
 *
 * Response (WorkspaceHelperResponse):
 *   {
 *     ok: boolean,
 *     summary: string,
 *     proposals: WorkspaceHelperProposal[],
 *     warnings: string[],
 *     receipts: WorkspaceHelperReceipt,
 *     error?: string,
 *   }
 */

import { NextResponse } from "next/server";
import {
  readWorkspaceConfig,
  readWorkspaceSourceRecords,
  writeWorkspaceSourceRecords,
  describePersistenceMode,
} from "@/lib/workspace-config";
import {
  sanitizeWorkspaceSnapshot,
  buildHelperSystemPrompt,
  parseHelperEnvelope,
  validateProposals,
} from "@/lib/workspace-helper";
import {
  ensureSandboxAdaptersLoaded,
  getSandboxAdapter,
} from "@/lib/adapters/sandboxes";

const VALID_INTENTS = [
  "build_dashboard",
  "create_widget",
  "register_api",
  "create_object",
  "edit_view",
  "repair",
  "explain",
];

const HELPER_SOURCE_KEY_PREFIX = "helper";

function helperSourceId(intent, runId) {
  return `${HELPER_SOURCE_KEY_PREFIX}:${intent}:${runId}`;
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const intent = typeof body?.intent === "string" ? body.intent.trim() : "";
  if (!intent || !VALID_INTENTS.includes(intent)) {
    return NextResponse.json({
      ok: false,
      error: `intent must be one of: ${VALID_INTENTS.join(", ")}`,
      proposals: [],
      warnings: [],
    });
  }

  const userPrompt = typeof body?.userPrompt === "string" ? body.userPrompt.trim() : "";
  if (!userPrompt) {
    return NextResponse.json({ ok: false, error: "userPrompt is required", proposals: [], warnings: [] });
  }

  const modelOverride = typeof body?.model === "string" ? body.model.trim() : "";
  const adapterModeOverride = typeof body?.adapterMode === "string" ? body.adapterMode.trim() : "";
  const localEndpointOverride = typeof body?.localEndpoint === "string" ? body.localEndpoint.trim() : "";

  let snapshot;
  if (body?.workspaceSnapshot && typeof body.workspaceSnapshot === "object") {
    snapshot = body.workspaceSnapshot;
  } else {
    const liveConfig = await readWorkspaceConfig();
    snapshot = sanitizeWorkspaceSnapshot(liveConfig);
  }

  const systemPrompt = buildHelperSystemPrompt(snapshot, intent);
  const userIntent = [systemPrompt, "", "---", "", `User request: ${userPrompt}`].join("\n");

  await ensureSandboxAdaptersLoaded();
  const adapter = getSandboxAdapter("local-intelligence");
  if (!adapter) {
    return NextResponse.json(
      {
        ok: false,
        error: "local-intelligence adapter not registered. Ensure sandbox adapters are loaded.",
      },
      { status: 503 }
    );
  }

  const runId = `helper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ranAt = new Date().toISOString();

  let adapterResult;
  try {
    adapterResult = await adapter.run({
      runId,
      name: `workspace-helper-${intent}`,
      runtime: "node",
      agentHost: "",
      command: userIntent,
      timeoutMs: 90000,
      networkAllow: true,
      allowList: [],
      env: {},
      envRefSlugs: [],
      envRefsMissing: [],
      workdir: "/tmp",
      ranAt,
      intelligenceSandbox: {
        userIntent,
        localModel: modelOverride || process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL || process.env.OLLAMA_MODEL || "gemma3:4b",
        localEndpoint: localEndpointOverride || "",
        intelligenceAdapterMode: adapterModeOverride || "ollama",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "adapter threw during helper query",
      },
      { status: 500 }
    );
  }

  if (!adapterResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: adapterResult.error || "local-intelligence adapter returned error",
        receipts: {
          model: "unknown",
          adapterMode: adapterModeOverride || "ollama",
          endpoint: "",
          confidence: 0,
          latencyMs: adapterResult.durationMs || 0,
          ranAt,
          runId,
        },
      },
      { status: 502 }
    );
  }

  const parsed = parseHelperEnvelope(adapterResult.stdout, intent);
  const { valid: validProposals, errors: validationErrors } = validateProposals(parsed.proposals);

  const warnings = [...parsed.warnings];
  if (validationErrors.length > 0) {
    warnings.push(...validationErrors);
  }

  const receipts = {
    model: parsed.model,
    adapterMode: parsed.adapterMode,
    endpoint: parsed.endpoint,
    confidence: parsed.confidence,
    latencyMs: parsed.latencyMs,
    ranAt,
    runId,
  };

  const response = {
    ok: true,
    summary: parsed.summary,
    proposals: validProposals,
    warnings,
    receipts,
  };

  const persistence = describePersistenceMode();
  if (persistence.canSave) {
    try {
      const sourceId = helperSourceId(intent, runId);
      const existing = await readWorkspaceSourceRecords(sourceId);
      const priorRecords = Array.isArray(existing?.records) ? existing.records : [];
      const record = {
        runId,
        ranAt,
        intent,
        userPrompt,
        summary: parsed.summary,
        proposalCount: validProposals.length,
        warningCount: warnings.length,
        model: parsed.model,
        adapterMode: parsed.adapterMode,
        confidence: parsed.confidence,
        latencyMs: parsed.latencyMs,
      };
      await writeWorkspaceSourceRecords(sourceId, [...priorRecords, record].slice(-50), {
        integrationId: sourceId,
        fetchedAt: ranAt,
      });
    } catch {
      // Non-fatal — source record write failure does not block the response
    }
  }

  return NextResponse.json(response);
}

export { POST };
