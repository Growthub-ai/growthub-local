import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readWorkspaceConfig, readWorkspaceSourceRecords, writeWorkspaceConfig } from "@/lib/workspace-config";
import { sandboxRunSourceId } from "@/lib/workspace-data-model";
import { parseOrchestrationGraph, validateOrchestrationGraph } from "@/lib/orchestration-graph";
import { stableStringify } from "@/lib/workspace-patch-policy";
import { rowHasSuccessfulServerlessBindingProof } from "@/lib/workspace-add-ons";
import { scanServerlessReadiness, READINESS_KIND } from "@/lib/serverless-readiness";
import { resolveWorkflowFieldNames, getNodeDeltaRecords, normalizeDeltaTags, patchSandboxRowInConfig } from "@/lib/orchestration-publish";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireAppScope, checkScopedWorkflowAccess } from "@/lib/workspace-app-registry";

/**
 * POST /api/workspace/workflow/publish
 *
 * Server-authoritative publish for sandbox-environment workflow rows.
 * This route is the ONLY transition from draft to live: direct
 * `PATCH /api/workspace` is policy-blocked (workspace-patch-policy.js) from
 * changing `orchestrationGraph` / `orchestrationConfig` / `version` /
 * `orchestrationPublishedAt` / `orchestrationDeltas` or setting
 * `lifecycleStatus: "live"`.
 *
 * Publish gates (all server-verified against the persisted row — the client
 * cannot vouch for itself):
 *   1. The row exists (object id + objectType "sandbox-environment" +
 *      capital-N `Name`).
 *   2. A saved draft exists (`orchestrationDraftConfig` / `orchestrationDraftGraph`).
 *   3. The draft was test-run successfully: `orchestrationDraftTestPassed === true`
 *      (set by POST /api/workspace/sandbox-run with `useDraft: true`).
 *   4. The tested config is byte-identical to the saved draft
 *      (`orchestrationDraftTestedConfig` === draft) — a draft edited after
 *      its successful test must be re-tested.
 *   5. The draft parses as a structurally valid orchestration graph.
 *
 * On success: bumps `version`, moves the draft into the live field, clears
 * draft state, stamps `orchestrationPublishedAt`, appends an
 * `orchestrationDeltas` record (with the sha256 of the published config),
 * sets `lifecycleStatus: "live"`, and persists via writeWorkspaceConfig.
 *
 * Request:  { objectId: string, name: string }
 * Response: { ok, objectId, name, version, publishedAt, liveField,
 *             publishedSha256, workspaceConfig }
 *           or { ok: false, code, error, ... } with 4xx/5xx status.
 */









function sha256(text) {
    return createHash("sha256").update(String(text), "utf8").digest("hex");
}
function findSandboxRow(workspaceConfig, objectId, name) {
    const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
    const object = objects.find((entry)=>entry?.id === objectId && entry?.objectType === "sandbox-environment");
    if (!object) return {
        object: null,
        row: null,
        rowIndex: -1
    };
    const wantedName = String(name || "").trim();
    const rows = Array.isArray(object.rows) ? object.rows : [];
    const rowIndex = rows.findIndex((row)=>String(row?.Name || "").trim() === wantedName);
    if (rowIndex === -1) return {
        object,
        row: null,
        rowIndex: -1
    };
    return {
        object,
        row: rows[rowIndex],
        rowIndex
    };
}
// Serverless binding proof — the strict, method-consistent, all-nodes-succeeded
// invocation proof (2xx + succeededAt + node-trace completion + trigger-kind
// agreement + graph identity with the promoted bytes). Lives in
// lib/workspace-add-ons.js beside readTriggerScheduleBinding so it is
// offline-testable; binding alone is never proof.
function rowHasSuccessfulServerlessSchedulerProof(row, draft) {
    return rowHasSuccessfulServerlessBindingProof(row, draft);
}
/**
 * Gate failures are governance signal: emit a blocked outcome receipt
 * (non-fatal) and return the structured failure envelope.
 */ async function publishBlocked(httpStatus, body, refs) {
    await appendOutcomeReceipt({
        kind: "workflow-publish",
        lane: "server-authoritative",
        outcomeStatus: "blocked",
        ...refs ? {
            objectRefs: [
                refs
            ]
        } : {},
        summary: `publish blocked (${body.code}): ${body.error}`,
        nextActions: body.code === "no_draft" || body.code === "draft_not_tested" || body.code === "draft_run_not_verified" || body.code === "draft_changed_after_test" ? [
            "Save the draft, run POST /api/workspace/sandbox-run {useDraft:true} to a passing result, attest, then publish"
        ] : []
    });
    return NextResponse.json(body, {
        status: httpStatus
    });
}
async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch  {
        return NextResponse.json({
            ok: false,
            code: "invalid_body",
            error: "invalid json body"
        }, {
            status: 400
        });
    }
    const objectId = typeof body?.objectId === "string" ? body.objectId.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const requestedField = typeof body?.field === "string" ? body.field.trim() : "";
    if (!objectId || !name) {
        return NextResponse.json({
            ok: false,
            code: "invalid_body",
            error: "objectId and name are required"
        }, {
            status: 400
        });
    }
    if (requestedField && requestedField !== "orchestrationConfig" && requestedField !== "orchestrationGraph") {
        return NextResponse.json({
            ok: false,
            code: "invalid_body",
            error: 'field must be "orchestrationConfig" or "orchestrationGraph" when provided'
        }, {
            status: 400
        });
    }
    const workspaceConfig = await readWorkspaceConfig();
    // Unified app-scope gate (route-shopping closed): with x-growthub-app-scope,
    // publish may only promote a workflow inside the app's governed scope.
    // NB: publish is deliberately NOT blocked when the app's health is
    // "blocked" — publishing is how the "workflow not live" blocker is cleared.
    const scope = requireAppScope(request, workspaceConfig);
    if (scope.scoped) {
        const violation = scope.violation || checkScopedWorkflowAccess(scope.context, objectId, name);
        if (violation) {
            await appendOutcomeReceipt({
                kind: "workflow-publish",
                lane: "server-authoritative",
                outcomeStatus: "blocked",
                appId: violation.appScope || scope.appId,
                summary: `publish rejected (422 app scope): ${violation.violationType}`,
                nextActions: violation.repairPlan
            });
            return NextResponse.json(violation, {
                status: 422
            });
        }
    }
    const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
    if (!object) {
        return NextResponse.json({
            ok: false,
            code: "object_not_found",
            error: `no sandbox-environment object with id ${objectId}`
        }, {
            status: 404
        });
    }
    if (!row) {
        return NextResponse.json({
            ok: false,
            code: "row_not_found",
            error: `no sandbox row named ${name} in object ${objectId}`
        }, {
            status: 404
        });
    }
    const { liveField, draftField } = resolveWorkflowFieldNames(row, requestedField || undefined);
    const draft = String(row[draftField] ?? "").trim();
    if (!draft) {
        return publishBlocked(409, {
            ok: false,
            code: "no_draft",
            error: `no saved draft in ${draftField} — save the draft, test it with sandbox-run useDraft:true, then publish`
        }, {
            objectId,
            rowName: name,
            objectType: "sandbox-environment"
        });
    }
    const draftPassed = row.orchestrationDraftTestPassed === true || String(row.orchestrationDraftTestPassed ?? "") === "true";
    const serverlessSchedulerProofPassed = rowHasSuccessfulServerlessSchedulerProof(row, draft);
    // Causality gate: a serverless-bound row may only publish when its WHOLE
    // downstream graph is still serverless-ready (binding valid ≠ graph runnable).
    // The graph can drift after install — a downstream node, API Registry row,
    // credential ref, or input template may have changed. Block publish until the
    // compatibility proof is clean; keep the published graph unchanged.
    if (serverlessSchedulerProofPassed) {
        const readiness = scanServerlessReadiness({
            row,
            workspaceConfig,
            env: process.env,
            phase: "bound",
            expected: {
                scheduleId: String(row?.scheduleId || "").trim(),
                schedulerRegistryId: String(row?.schedulerRegistryId || "").trim(),
                providerId: String(row?.schedulerProviderId || "").trim(),
                productId: String(row?.schedulerProductId || "").trim(),
            },
        });
        if (!readiness.ok) {
            await appendOutcomeReceipt({
                kind: READINESS_KIND,
                lane: "server-authoritative",
                outcomeStatus: "blocked",
                objectRefs: [{ objectId, rowName: name, objectType: "sandbox-environment" }],
                policyVerdict: { ok: false, violationCodes: readiness.deltaTags },
                summary: `publish blocked: ${name} is no longer serverless-ready (${readiness.blockingNodes.length} blocking node(s)).`,
                nextActions: readiness.blockingNodes.map((nbl) => nbl.helperAction).filter(Boolean),
            });
            return NextResponse.json({
                ok: false,
                code: "serverless_not_ready",
                error: "publish blocked — the serverless-bound graph is not compatible; resolve the flagged nodes before publishing",
                readiness,
            }, { status: 409 });
        }
    }
    if (!draftPassed && !serverlessSchedulerProofPassed) {
        return publishBlocked(409, {
            ok: false,
            code: "draft_not_tested",
            error: "publish blocked — the saved draft has no successful test run; " + "run POST /api/workspace/sandbox-run with useDraft:true or the installed serverless scheduler with a passing result first"
        }, {
            objectId,
            rowName: name,
            objectType: "sandbox-environment"
        });
    }
    const testedConfig = String(row.orchestrationDraftTestedConfig ?? "");
    if (!serverlessSchedulerProofPassed && testedConfig !== draft) {
        return publishBlocked(409, {
            ok: false,
            code: "draft_changed_after_test",
            error: "publish blocked — the draft changed after its successful test; re-test this exact draft",
            // Diagnostic raw-STRING hashes (the equality above is byte-level);
            // the canonical graph hash everywhere else is sha256(stableStringify(parsedGraph)).
            draftStringSha256: sha256(draft),
            testedStringSha256: sha256(testedConfig)
        }, {
            objectId,
            rowName: name,
            objectType: "sandbox-environment"
        });
    }
    // Lineage gate — the draft-field attestation (`orchestrationDraftTestPassed`,
    // `orchestrationDraftTestedConfig`) is PATCH-writable, so it is not trusted
    // alone. The claimed draft run must exist in the source-record run history
    // (which only sandbox-run writes; PATCH is policy-blocked from sidecar
    // writes), must have passed (exitCode 0, no error), and the graph it
    // actually executed must equal this draft.
    const draftRunId = String(row.orchestrationDraftLastRunId ?? "").trim();
    if (!serverlessSchedulerProofPassed && !draftRunId) {
        return publishBlocked(409, {
            ok: false,
            code: "draft_run_not_verified",
            error: "publish blocked — no server-recorded draft run on this row; " + "run POST /api/workspace/sandbox-run with useDraft:true first"
        }, {
            objectId,
            rowName: name,
            objectType: "sandbox-environment"
        });
    }
    const sourceId = sandboxRunSourceId(objectId, row.Name || name);
    const history = !serverlessSchedulerProofPassed && sourceId ? await readWorkspaceSourceRecords(sourceId) : null;
    const records = Array.isArray(history?.records) ? history.records : [];
    const runRecord = serverlessSchedulerProofPassed ? null : records.find((record)=>String(record?.runId ?? "") === draftRunId);
    if (!serverlessSchedulerProofPassed) {
        if (!runRecord) {
            return publishBlocked(409, {
                ok: false,
                code: "draft_run_not_verified",
                error: `publish blocked — draft run ${draftRunId} has no record in the sandbox run history (${sourceId})`
            }, {
                objectId,
                rowName: name,
                objectType: "sandbox-environment"
            });
        }
        if (runRecord.exitCode !== 0 || runRecord.error) {
            return publishBlocked(409, {
                ok: false,
                code: "draft_run_not_verified",
                error: `publish blocked — draft run ${draftRunId} did not pass (exitCode ${runRecord.exitCode})`
            }, {
                objectId,
                rowName: name,
                objectType: "sandbox-environment"
            });
        }
    }
    // The record's draftSha256 is stamped by sandbox-run from the exact graph
    // it executed, before execution. It must match this saved draft.
    const draftGraphParsed = parseOrchestrationGraph(draft);
    const expectedSha256 = createHash("sha256").update(stableStringify(draftGraphParsed), "utf8").digest("hex");
    if (!serverlessSchedulerProofPassed && (runRecord.useDraft !== true || runRecord.draftSha256 !== expectedSha256)) {
        return publishBlocked(409, {
            ok: false,
            code: "draft_run_not_verified",
            error: `publish blocked — draft run ${draftRunId} executed a different graph than the saved draft ` + "(or was not a draft run); re-test this exact draft with sandbox-run useDraft:true"
        }, {
            objectId,
            rowName: name,
            objectType: "sandbox-environment"
        });
    }
    const parsedDraft = draftGraphParsed;
    const validation = validateOrchestrationGraph(parsedDraft);
    if (!validation?.ok) {
        return publishBlocked(400, {
            ok: false,
            code: "invalid_graph",
            error: "publish blocked — the draft does not parse as a valid orchestration graph",
            details: validation?.errors ?? []
        }, {
            objectId,
            rowName: name,
            objectType: "sandbox-environment"
        });
    }
    const publishedAt = new Date().toISOString();
    const currentVersion = Number(row.version || 1);
    const nextVersion = Number.isFinite(currentVersion) ? String(currentVersion + 1) : "1";
    const previousDeltas = Array.isArray(row.orchestrationDeltas) ? row.orchestrationDeltas : [];
    const previousPublishedGraph = parseOrchestrationGraph(row[liveField]);
    const nodeDeltas = getNodeDeltaRecords(previousPublishedGraph, parsedDraft);
    const deltaTags = normalizeDeltaTags(nodeDeltas.flatMap((delta)=>delta.deltaTags));
    const changeReason = nodeDeltas.map((delta)=>delta.changeReason).filter(Boolean).join("\n");
    // One canonical draft/graph hash everywhere: sha256(stableStringify(parsedGraph)).
    // This is the same value sandbox-run stamped as the record's draftSha256,
    // so the lineage record and the publish delta are directly comparable.
    const publishedSha256 = expectedSha256;
    const next = patchSandboxRowInConfig(workspaceConfig, objectId, rowIndex, {
        [liveField]: draft,
        [draftField]: "",
        version: nextVersion,
        lifecycleStatus: "live",
        orchestrationDraftStatus: "published",
        orchestrationDraftTestPassed: false,
        orchestrationDraftTestedConfig: "",
        orchestrationPublishedAt: publishedAt,
        orchestrationDeltas: [
            ...previousDeltas,
            {
                at: publishedAt,
                version: nextVersion,
                field: liveField,
                action: "publish",
                previousVersion: String(row.version || "1"),
                draftTestedAt: row.orchestrationDraftLastTested || "",
                draftRunId: row.orchestrationDraftLastRunId || "",
                publishedSha256,
                changeReason,
                deltaTags,
                nodeDeltas,
                nodeCount: Array.isArray(parsedDraft?.nodes) ? parsedDraft.nodes.length : 0,
                edgeCount: Array.isArray(parsedDraft?.edges) ? parsedDraft.edges.length : 0
            }
        ]
    });
    try {
        const persisted = await writeWorkspaceConfig({
            dataModel: next.dataModel
        });
        const { receipt } = await appendOutcomeReceipt({
            kind: "workflow-publish",
            lane: "server-authoritative",
            outcomeStatus: "published",
            ...scope.scoped ? {
                appId: scope.appId
            } : {},
            objectRefs: [
                {
                    objectId,
                    rowName: name,
                    objectType: "sandbox-environment"
                }
            ],
            changedFields: [
                "dataModel"
            ],
            runId: draftRunId,
            sourceId,
            draftSha256: expectedSha256,
            publishedSha256,
            version: nextVersion,
            summary: `published ${liveField} v${nextVersion} for ${objectId}/${name} (${nodeDeltas.length} node delta(s), verified draft run ${draftRunId})`,
            rollbackRef: {
                objectId,
                rowName: name,
                liveField,
                previousVersion: String(row.version || "1"),
                deltaIndex: previousDeltas.length,
                sourceId
            }
        });
        return NextResponse.json({
            ok: true,
            objectId,
            name,
            version: nextVersion,
            publishedAt,
            liveField,
            publishedSha256,
            receiptId: receipt.receiptId,
            workspaceConfig: persisted
        });
    } catch (error) {
        if (error.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
            return NextResponse.json({
                ok: false,
                code: "read_only",
                error: "workspace config is read-only in this runtime",
                guidance: error.guidance || null
            }, {
                status: 409
            });
        }
        if (error.code === "INVALID_WORKSPACE_CONFIG") {
            return NextResponse.json({
                ok: false,
                code: "invalid_config",
                error: error.message,
                details: error.details
            }, {
                status: 400
            });
        }
        return NextResponse.json({
            ok: false,
            code: "write_failed",
            error: error?.message || "failed to write workspace config"
        }, {
            status: 500
        });
    }
}

export { POST };
