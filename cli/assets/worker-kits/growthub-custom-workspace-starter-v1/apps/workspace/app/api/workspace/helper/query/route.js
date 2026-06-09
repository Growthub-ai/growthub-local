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
 *   3. Dispatch through the configured workspace-helper-sandbox adapter.
 *   4. Parse the helper JSON envelope.
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
  writeWorkspaceConfig,
  readWorkspaceSourceRecords,
  writeWorkspaceSourceRecords,
  describePersistenceMode,
} from "@/lib/workspace-config";
import {
  sanitizeWorkspaceSnapshot,
  buildChatMessages,
  inferIntentFromPrompt,
  parseHelperEnvelope,
  validateProposals,
} from "@/lib/workspace-helper";
import {
  ensureSandboxAdaptersLoaded,
  getSandboxAdapter,
} from "@/lib/adapters/sandboxes";
import {
  upsertHelperThreadRow,
  nextThreadId,
} from "@/lib/workspace-helper-apply";
import { buildHelperCreationResponse } from "@/lib/workspace-creation-proposals";

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
const HELPER_SANDBOX_OBJECT_ID = "workspace-helper-sandbox";

function helperSourceId(intent, runId) {
  return `${HELPER_SOURCE_KEY_PREFIX}:${intent}:${runId}`;
}

function findHelperSandboxRow(config) {
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  const helperObject = objects.find((o) => o?.id === HELPER_SANDBOX_OBJECT_ID && o?.objectType === "sandbox-environment");
  const rows = Array.isArray(helperObject?.rows) ? helperObject.rows : [];
  return rows[0] && typeof rows[0] === "object" ? rows[0] : null;
}

function buildAgentHostCommand(messages) {
  const transcript = messages
    .map((message) => {
      const role = typeof message?.role === "string" ? message.role.toUpperCase() : "MESSAGE";
      const content = typeof message?.content === "string" ? message.content : "";
      return `### ${role}\n${content}`;
    })
    .join("\n\n");

  return [
    "You are the Growthub Workspace Helper running through the user's selected local agent host.",
    "Use the full transcript below. Return only one JSON object with this exact shape:",
    JSON.stringify({ summary: "", proposals: [], warnings: [] }),
    "Do not wrap the JSON in markdown. Do not execute tools or mutate files.",
    "",
    transcript,
  ].join("\n");
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

  // Always sanitize the snapshot — even when supplied by the client — so
  // envRefs values, credentials, and row data can never travel into the
  // inference prompt regardless of how a caller frames the request.
  let snapshot;
  let liveConfigForThread = null;
  if (body?.workspaceSnapshot && typeof body.workspaceSnapshot === "object") {
    snapshot = sanitizeWorkspaceSnapshot(body.workspaceSnapshot);
  } else {
    const liveConfig = await readWorkspaceConfig();
    snapshot = sanitizeWorkspaceSnapshot(liveConfig);
    liveConfigForThread = liveConfig;
  }
  if (!liveConfigForThread) {
    try {
      liveConfigForThread = await readWorkspaceConfig();
    } catch {
      liveConfigForThread = null;
    }
  }

  // Thread continuity — pull prior messages from the governed helper-threads
  // row when the caller supplied a threadId so the chat completion gets the
  // full conversation context.
  const incomingThreadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
  let priorMessages = [];
  let priorThreadIntent = null;
  if (incomingThreadId) {
    try {
      if (!liveConfigForThread) liveConfigForThread = await readWorkspaceConfig();
      const ht = (liveConfigForThread?.dataModel?.objects || []).find((o) => o?.id === "helper-threads");
      const row = ht?.rows?.find((r) => r?.id === incomingThreadId);
      if (row) {
        priorMessages = Array.isArray(row.messages) ? row.messages : [];
        priorThreadIntent = typeof row.intent === "string" ? row.intent : null;
      }
    } catch {
      // Non-fatal — fall through with no prior context.
    }
  }

  // L3 heuristic intent routing.
  //
  // If the caller is continuing a thread, the original intent is locked
  // for the rest of the thread (the UI surfaces it as the active mode).
  // For a brand-new thread we only override the caller's chosen intent
  // when the prompt produces a strong, unambiguous signal that conflicts.
  let resolvedIntent = priorThreadIntent || intent;
  let intentInference = null;
  if (!priorThreadIntent) {
    intentInference = inferIntentFromPrompt(userPrompt, intent);
    if (
      intentInference.confidence >= 2 &&
      intentInference.intent !== intent &&
      // Only override the safest defaults — never blow away a deliberate pick.
      (intent === "create_object" || intent === "explain")
    ) {
      resolvedIntent = intentInference.intent;
    }
  }

  const chatMessages = buildChatMessages({
    snapshot,
    intent: resolvedIntent,
    priorMessages,
    newUserPrompt: userPrompt,
  });
  // Keep the userIntent fallback populated for adapter compatibility — the
  // adapter prefers `messages` when present and only reads `userIntent`
  // when `messages` is empty.
  const userIntent = userPrompt;

  await ensureSandboxAdaptersLoaded();
  const helperSandboxRow = findHelperSandboxRow(liveConfigForThread);
  const helperAdapterId = String(helperSandboxRow?.adapter || "").trim();
  const helperAgentHost = String(helperSandboxRow?.agentHost || "").trim();
  const useAgentHost = helperAdapterId === "local-agent-host" && helperAgentHost;
  const adapterId = useAgentHost ? "local-agent-host" : "local-intelligence";
  const adapter = getSandboxAdapter(adapterId);
  if (!adapter) {
    return NextResponse.json(
      {
        ok: false,
        error: `${adapterId} adapter not registered. Ensure sandbox adapters are loaded.`,
      },
      { status: 503 }
    );
  }

  const runId = `helper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ranAt = new Date().toISOString();

  let adapterResult;
  try {
    if (useAgentHost) {
      adapterResult = await adapter.run({
        runId,
        name: `workspace-helper-${resolvedIntent}`,
        runtime: "node",
        agentHost: helperAgentHost,
        command: buildAgentHostCommand(chatMessages),
        timeoutMs: Number(helperSandboxRow?.timeoutMs) || 120000,
        networkAllow: true,
        allowList: [],
        env: {},
        envRefSlugs: [],
        envRefsMissing: [],
        workdir: "/tmp",
        ranAt,
      });
    } else {
      adapterResult = await adapter.run({
        runId,
        name: `workspace-helper-${resolvedIntent}`,
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
          // Structured multi-turn message array — the adapter passes this
          // straight through to the chat completions endpoint so the model
          // sees the full conversation history with stable system prefix
          // (KV-cache friendly).
          messages: chatMessages,
          userIntent,
          localModel: modelOverride || process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL || process.env.OLLAMA_MODEL || "gemma3:4b",
          localEndpoint: localEndpointOverride || "",
          intelligenceAdapterMode: adapterModeOverride || "ollama",
        },
      });
    }
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
        error: adapterResult.error || `${adapterId} adapter returned error`,
        receipts: {
          model: useAgentHost ? helperAgentHost : "unknown",
          adapterMode: useAgentHost ? "agent-host" : (adapterModeOverride || "ollama"),
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

  const parsedInput = useAgentHost
    ? {
        result: { text: adapterResult.stdout },
        adapter: { mode: "agent-host", modelId: helperAgentHost, endpoint: "local-agent-host" },
        latencyMs: adapterResult.durationMs || 0,
      }
    : adapterResult.stdout;
  const parsed = parseHelperEnvelope(parsedInput, intent);
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

  // Thread row — every governed conversation turn lands here so the user
  // can reopen it from /data-model → Helper Threads. Either continue an
  // existing thread (when the caller supplies threadId) or start a new one.
  const threadId = incomingThreadId || nextThreadId();
  const turnCount = 1;

  // Build the new messages tail — one user turn (raw prompt) and one
  // assistant turn (the JSON envelope we just returned). This is the
  // conversation history that gets replayed on the next turn.
  const nowIso = new Date().toISOString();
  const assistantEnvelope = JSON.stringify({
    summary: parsed.summary,
    proposals: validProposals,
    warnings,
  });
  const newTurn = [
    { role: "user", content: userPrompt, ts: nowIso },
    { role: "assistant", content: assistantEnvelope, ts: nowIso, summary: parsed.summary, proposals: validProposals, warnings },
  ];
  const nextMessages = [...priorMessages, ...newTurn].slice(-40);

  let responseProposals = validProposals;
  let responseSummary = parsed.summary;
  let responseWarnings = warnings;
  let creationBundle = null;

  if (resolvedIntent === "register_api" && userPrompt.trim()) {
    const governed = buildHelperCreationResponse({
      name: userPrompt.slice(0, 80),
      businessPurpose: userPrompt,
      description: userPrompt,
      integrationId: userPrompt.match(/\b([a-z][a-z0-9-]{2,})\b/i)?.[1] || "api",
      outputMode: /source|records|leads/i.test(userPrompt) ? "data-source" : "normalized-rows",
    });
    creationBundle = governed.creationBundle;
    if (governed.proposals.length > 0) {
      responseProposals = governed.proposals;
      responseSummary = governed.summary || responseSummary;
      responseWarnings = [...responseWarnings, ...governed.warnings];
    }
  }

  const response = {
    ok: true,
    threadId,
    intent: resolvedIntent,
    intentInference,
    summary: responseSummary,
    proposals: responseProposals,
    warnings: responseWarnings,
    receipts,
    messages: nextMessages,
    ...(creationBundle ? { creationBundle, testPlan: creationBundle.testPlan, activationPlan: creationBundle.activationPlan } : {}),
  };

  const persistence = describePersistenceMode();
  if (persistence.canSave) {
    // Audit-trail (source-records) — preserved exactly as before for the
    // distillation pipeline.
    try {
      const sourceId = helperSourceId(resolvedIntent, runId);
      const existing = await readWorkspaceSourceRecords(sourceId);
      const priorRecords = Array.isArray(existing?.records) ? existing.records : [];
      const record = {
        runId,
        ranAt,
        intent: resolvedIntent,
        intentRequested: intent,
        userPrompt,
        summary: parsed.summary,
        proposalCount: validProposals.length,
        warningCount: warnings.length,
        model: parsed.model,
        adapterMode: parsed.adapterMode,
        confidence: parsed.confidence,
        latencyMs: parsed.latencyMs,
        threadId,
        turnIndex: priorMessages.filter((m) => m?.role === "user").length + 1,
      };
      await writeWorkspaceSourceRecords(sourceId, [...priorRecords, record].slice(-50), {
        integrationId: sourceId,
        fetchedAt: ranAt,
      });
    } catch {
      // Non-fatal — source record write failure does not block the response
    }

    // Governed thread row — visible to the user as a Data Model row with a
    // "Reopen" hyperlink that re-hydrates the sidecar. The row carries the
    // full multi-turn message history; the assistant's latest turn is also
    // surfaced as `summary` / `proposals` / `receipts` on the row for
    // quick triage from the Data Model surface.
    try {
      const liveConfig = liveConfigForThread || (await readWorkspaceConfig());
      const existingRows = (liveConfig?.dataModel?.objects || []).find((o) => o?.id === "helper-threads")?.rows || [];
      const existingRow = existingRows.find((r) => r?.id === threadId) || {};
      const merged = upsertHelperThreadRow(liveConfig, {
        id: threadId,
        title: existingRow.title || truncateRowTitle(userPrompt),
        intent: resolvedIntent,
        prompt: existingRow.prompt || userPrompt,
        summary: parsed.summary,
        proposals: validProposals,
        warnings,
        receipts,
        model: parsed.model || "unknown",
        applied: existingRow.applied || 0,
        skipped: existingRow.skipped || 0,
        turnCount: (existingRow.turnCount || 0) + turnCount,
        messages: nextMessages,
        updatedAt: ranAt,
      });
      await writeWorkspaceConfig({ dataModel: merged.dataModel });
    } catch (err) {
      // Non-fatal — the helper response is still returned even if the row
      // write fails (e.g. read-only runtime). The audit trail above is
      // unaffected.
      if (err && err.code !== "WORKSPACE_PERSISTENCE_READ_ONLY") {
        // swallow but do not propagate; users still receive the proposals
      }
    }
  }

  return NextResponse.json(response);
}

function truncateRowTitle(prompt, max = 72) {
  const text = String(prompt || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export { POST };
