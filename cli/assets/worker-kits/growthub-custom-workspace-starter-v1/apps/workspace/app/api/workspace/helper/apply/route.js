/**
 * POST /api/workspace/helper/apply
 *
 * Governed mutation endpoint for workspace helper proposals.
 *
 * Takes accepted WorkspaceHelperProposal objects from a prior query response,
 * validates each against the PATCH allowlist + validateWorkspaceConfig, writes
 * the merged config, and persists a durable receipt per applied proposal.
 *
 * The apply step is always explicit and human-reviewed. The helper never
 * calls this route on its own — it is a separate governed action.
 *
 * Request body (WorkspaceHelperApplyRequest):
 *   {
 *     proposals: WorkspaceHelperProposal[],
 *     reviewedBy?: string,
 *     sessionId?: string,
 *   }
 *
 * Response (WorkspaceHelperApplyResponse):
 *   {
 *     ok: boolean,
 *     applied: WorkspaceHelperApplyReceipt[],
 *     skipped: { proposal, reason }[],
 *     workspaceConfig?: object,
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
  applyProposalToConfig,
  validateProposalForApply,
  buildApplyReceipt,
  upsertHelperThreadRow,
} from "@/lib/workspace-helper-apply";
import { RESOLVER_PROPOSAL_TYPE, validateResolverProposal } from "@/lib/workspace-resolver-proposal";
import { writeResolverProposalFile } from "@/lib/server-resolver-write";

const HELPER_APPLY_SOURCE_KEY = "helper:apply:receipts";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body?.proposals) || body.proposals.length === 0) {
    return NextResponse.json(
      { ok: false, error: "proposals must be a non-empty array" },
      { status: 400 }
    );
  }

  const reviewedBy = typeof body.reviewedBy === "string" ? body.reviewedBy.trim() : "user";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : null;
  const threadId = typeof body.threadId === "string" && body.threadId.trim() ? body.threadId.trim() : null;
  const appliedAt = new Date().toISOString();

  let currentConfig;
  try {
    currentConfig = await readWorkspaceConfig();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || "failed to read workspace config" },
      { status: 500 }
    );
  }

  const applied = [];
  const skipped = [];
  let workingConfig = currentConfig;

  // Resolver-file lane (AWaC: server file, NOT a config PATCH field). Handled
  // separately so it never touches writeWorkspaceConfig and never widens the
  // PATCH allowlist. Gated by filesystem/read-only; emits a receipt either way.
  const resolverProposals = body.proposals.filter((p) => p?.type === RESOLVER_PROPOSAL_TYPE);
  const configProposals = body.proposals.filter((p) => p?.type !== RESOLVER_PROPOSAL_TYPE);

  for (const proposal of resolverProposals) {
    const validation = validateResolverProposal(proposal);
    if (!validation.ok) {
      skipped.push({ proposal, reason: validation.error || "invalid resolver proposal" });
      continue;
    }
    try {
      const result = await writeResolverProposalFile(proposal);
      applied.push({
        ...buildApplyReceipt(proposal, appliedAt, reviewedBy, sessionId),
        resolverPath: result.path,
        resolverFilename: result.filename,
      });
    } catch (err) {
      if (err?.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
        skipped.push({ proposal, reason: `read-only runtime — ${err.guidance || "resolver not written"}` });
      } else {
        skipped.push({ proposal, reason: err?.message || "resolver write failed" });
      }
    }
  }

  for (const proposal of configProposals) {
    if (
      !proposal ||
      typeof proposal.type !== "string" ||
      typeof proposal.affectedField !== "string" ||
      !proposal.payload ||
      typeof proposal.payload !== "object"
    ) {
      skipped.push({ proposal, reason: "malformed proposal: missing type, affectedField, or payload" });
      continue;
    }

    // explain.object proposals are informational — no config write needed
    if (proposal.type === "explain.object") {
      applied.push(buildApplyReceipt(proposal, appliedAt, reviewedBy, sessionId));
      continue;
    }

    const validation = validateProposalForApply(proposal, workingConfig);
    if (!validation.ok) {
      skipped.push({ proposal, reason: validation.error || "failed validation" });
      continue;
    }

    try {
      workingConfig = applyProposalToConfig(workingConfig, proposal);
      applied.push(buildApplyReceipt(proposal, appliedAt, reviewedBy, sessionId));
    } catch (err) {
      skipped.push({ proposal, reason: err?.message || "apply threw" });
    }
  }

  // Patch — collect every affected field from accepted proposals AND
  // append the thread row update (so the user-visible Helper Threads object
  // refreshes in the same atomic write as the proposed mutations).
  // resolver.create writes a server file (affectedField "server-file"), so it
  // must NOT contribute a field to the config PATCH — exclude it here.
  const mutatingApplied = applied.filter((r) => r.type !== "explain.object" && r.affectedField !== "server-file");

  // Upsert the thread row so audit history reflects this apply turn even
  // when nothing mutated (all skipped / explain-only) and even when the
  // CLI flow applies a proposals.json that carries a fresh threadId
  // (no prior in-session query). Both query and apply land on the same
  // governed object so the user sees one row per conversation.
  //
  // Apply outcomes are also appended to the row's messages[] as a
  // `system` turn so the conversation captures both proposals and their
  // governed apply receipts. The conversation tail stays under the cap
  // (~40 entries) via upsertHelperThreadRow's slicing.
  if (threadId) {
    try {
      const existingRows = (workingConfig?.dataModel?.objects || []).find((o) => o?.id === "helper-threads")?.rows || [];
      const existingRow = existingRows.find((r) => r?.id === threadId) || {};
      const firstProposal = body.proposals?.[0];
      const seedTitle = existingRow.title
        || (firstProposal?.rationale ? String(firstProposal.rationale).slice(0, 72) : "Helper thread");

      // Build a short, plain-language system message describing the apply
      // outcome. This is what the user sees in the conversation panel
      // after their accepted proposals are written.
      const applyLines = [];
      if (applied.length > 0) {
        const summary = applied
          .map((a) => `${a.type}${a.affectedField ? ` → ${a.affectedField}` : ""}`)
          .join(", ");
        applyLines.push(`Applied ${applied.length} change${applied.length === 1 ? "" : "s"}: ${summary}.`);
      }
      if (skipped.length > 0) {
        const skipSummary = skipped
          .slice(0, 4)
          .map((s) => `${s.proposal?.type || "unknown"} (${s.reason || "no reason"})`)
          .join("; ");
        applyLines.push(`Skipped ${skipped.length}: ${skipSummary}${skipped.length > 4 ? "; …" : ""}.`);
      }
      if (applyLines.length === 0) {
        applyLines.push("Apply completed with no changes.");
      }
      const applySystemMessage = {
        role: "system",
        content: applyLines.join(" "),
        ts: appliedAt,
        kind: "apply-receipt",
        appliedCount: applied.length,
        skippedCount: skipped.length,
      };
      const priorMessages = Array.isArray(existingRow.messages) ? existingRow.messages : [];
      // Effectively unlimited cap — keeps the full multi-turn dashboard
      // construction history. The user explicitly removed the 40-turn
      // arbitrary limit so the helper can do complex multi-step real-data
      // builds without losing context.
      const nextMessages = [...priorMessages, applySystemMessage].slice(-400);

      // Intent fallback — affectedField is in the PATCH-allowlist vocabulary
      // (dashboards | widgetTypes | canvas | dataModel) and is NOT a member
      // of the 7-intent vocabulary. Never assign it as a thread intent.
      // Walk the proposal type back to its intent only when it's safe.
      const TYPE_TO_INTENT_HINT = {
        "dashboard.create": "build_dashboard",
        "dashboard.update": "edit_view",
        "widgetType.bind": "create_widget",
        "canvas.widget.add": "create_widget",
        "canvas.tab.create": "edit_view",
        "dataModel.object.create": "create_object",
        "dataModel.object.update": "edit_view",
        "dataModel.row.add": "create_object",
        "repair.binding": "repair",
        "explain.object": "explain",
      };
      const proposalIntent = firstProposal?.type ? TYPE_TO_INTENT_HINT[firstProposal.type] : null;
      const safeIntent = existingRow.intent || proposalIntent || "explain";
      workingConfig = upsertHelperThreadRow(workingConfig, {
        id: threadId,
        title: seedTitle,
        intent: safeIntent,
        prompt: existingRow.prompt || "",
        summary: existingRow.summary || "",
        proposals: existingRow.proposals || body.proposals || [],
        warnings: existingRow.warnings || [],
        receipts: existingRow.receipts || null,
        model: existingRow.model || "external-apply",
        applied: (existingRow.applied || 0) + applied.length,
        skipped: (existingRow.skipped || 0) + skipped.length,
        // Persist the full proposal payload alongside the receipt so the
        // sidecar can rehydrate ToolCallCard rows (icon + title + JSON
        // metadata + Open link) on page refresh — without this the
        // chevron-accordion would show nothing useful after a reload.
        lastApplied: applied.map((a, idx) => ({
          type: a.type,
          affectedField: a.affectedField,
          rationale: a.rationale,
          confidence: a.confidence,
          payload: body.proposals?.[idx]?.payload ?? null,
        })),
        lastSkipped: skipped.map((s) => ({
          type: s.proposal?.type,
          affectedField: s.proposal?.affectedField,
          reason: s.reason,
          payload: s.proposal?.payload ?? null,
        })),
        turnCount: (existingRow.turnCount || 0) + 1,
        messages: nextMessages,
        updatedAt: appliedAt,
      });
    } catch {
      // Non-fatal — thread row update failures do not block the apply response.
    }
  }

  // Build PATCH from affected fields. If the thread row was updated above,
  // dataModel will already reflect it. Otherwise only mutating proposals
  // contribute fields.
  const threadTouched = threadId && mutatingApplied.every((r) => r.affectedField !== "dataModel");
  if (mutatingApplied.length > 0 || threadTouched) {
    const patchFields = new Set(mutatingApplied.map((r) => r.affectedField));
    if (threadId) patchFields.add("dataModel");
    const patch = {};
    for (const field of patchFields) {
      patch[field] = workingConfig[field];
    }

    try {
      const next = await writeWorkspaceConfig(patch);
      workingConfig = next;
    } catch (err) {
      if (err.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
        return NextResponse.json(
          {
            ok: false,
            error: "workspace config is read-only in this runtime",
            reason: err.message,
            guidance:
              err.guidance ||
              "Edit growthub.config.json locally, or set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime.",
          },
          { status: 409 }
        );
      }
      if (err.code === "INVALID_WORKSPACE_CONFIG") {
        return NextResponse.json({ ok: false, error: err.message, details: err.details }, { status: 400 });
      }
      return NextResponse.json(
        { ok: false, error: err?.message || "failed to write workspace config" },
        { status: 500 }
      );
    }
  }

  // Persist receipts to source-records for fine-tune loop seeding
  const persistence = describePersistenceMode();
  if (persistence.canSave && applied.length > 0) {
    try {
      const existing = await readWorkspaceSourceRecords(HELPER_APPLY_SOURCE_KEY);
      const priorRecords = Array.isArray(existing?.records) ? existing.records : [];
      const newRecords = applied.map((receipt) => ({
        ...receipt,
        sessionId: sessionId || null,
        reviewedBy,
      }));
      await writeWorkspaceSourceRecords(
        HELPER_APPLY_SOURCE_KEY,
        [...priorRecords, ...newRecords].slice(-200),
        { integrationId: HELPER_APPLY_SOURCE_KEY, fetchedAt: appliedAt }
      );
    } catch {
      // Non-fatal
    }
  }

  // If we updated a thread row, return the new conversation tail so the
  // sidecar can render the apply-receipt system message in-place without
  // a separate fetch.
  let messagesAfterApply;
  if (threadId) {
    const ht = (workingConfig?.dataModel?.objects || []).find((o) => o?.id === "helper-threads");
    const row = ht?.rows?.find((r) => r?.id === threadId);
    if (row && Array.isArray(row.messages)) messagesAfterApply = row.messages;
  }

  return NextResponse.json({
    ok: true,
    threadId,
    applied,
    skipped,
    workspaceConfig: workingConfig,
    messages: messagesAfterApply,
  });
}

export { POST };
