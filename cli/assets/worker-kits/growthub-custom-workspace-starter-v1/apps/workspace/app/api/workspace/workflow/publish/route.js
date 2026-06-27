import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readWorkspaceConfig, readWorkspaceSourceRecords, writeWorkspaceConfig } from "@/lib/workspace-config";
import { sandboxRunSourceId } from "@/lib/workspace-data-model";
import { parseOrchestrationGraph, validateOrchestrationGraph } from "@/lib/orchestration-graph";
import { stableStringify } from "@/lib/workspace-patch-policy";
import { readTriggerScheduleBinding } from "@/lib/workspace-add-ons";
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
function rowHasSuccessfulServerlessSchedulerProof(row, draft) {
    const runLocality = String(row?.runLocality || "").trim().toLowerCase();
    const schedulerRegistryId = String(row?.schedulerRegistryId || "").trim();
    const scheduleId = String(row?.scheduleId || "").trim();
    const status = Number(String(row?.lastScheduledRunStatus || "").trim());
    const draftGraph = String(draft || "").trim();
    const testedConfig = String(row?.orchestrationDraftTestedConfig || "").trim();
    const liveGraph = String(row?.orchestrationGraph || row?.orchestrationConfig || "").trim();
    const binding = readTriggerScheduleBinding(row?.orchestrationGraph || row?.orchestrationConfig);
    return runLocality === "serverless" && Boolean(schedulerRegistryId) && Boolean(scheduleId) && Number.isFinite(status) && status >= 200 && status < 300 && binding?.enabled === true && binding?.scheduleId === scheduleId && binding?.schedulerRegistryId === schedulerRegistryId && (testedConfig === draftGraph || liveGraph === draftGraph);
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

//# sourceURL=[module]
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL3dvcmtzcGFjZS93b3JrZmxvdy9wdWJsaXNoL3JvdXRlLmpzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7O0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0ErQkMsR0FFMEM7QUFDRjtBQUtUO0FBQ2dDO0FBQ2dDO0FBQ2pDO0FBQ007QUFNaEM7QUFDbUM7QUFDa0I7QUFFMUYsU0FBU2lCLE9BQU9DLElBQUk7SUFDbEIsT0FBT2pCLHVEQUFVQSxDQUFDLFVBQVVrQixNQUFNLENBQUNDLE9BQU9GLE9BQU8sUUFBUUcsTUFBTSxDQUFDO0FBQ2xFO0FBRUEsU0FBU0MsZUFBZUMsZUFBZSxFQUFFQyxRQUFRLEVBQUVDLElBQUk7SUFDckQsTUFBTUMsVUFBVUMsTUFBTUMsT0FBTyxDQUFDTCxpQkFBaUJNLFdBQVdILFdBQVdILGdCQUFnQk0sU0FBUyxDQUFDSCxPQUFPLEdBQUcsRUFBRTtJQUMzRyxNQUFNSSxTQUFTSixRQUFRSyxJQUFJLENBQUMsQ0FBQ0MsUUFBVUEsT0FBT0MsT0FBT1QsWUFBWVEsT0FBT0UsZUFBZTtJQUN2RixJQUFJLENBQUNKLFFBQVEsT0FBTztRQUFFQSxRQUFRO1FBQU1LLEtBQUs7UUFBTUMsVUFBVSxDQUFDO0lBQUU7SUFDNUQsTUFBTUMsYUFBYWpCLE9BQU9LLFFBQVEsSUFBSWEsSUFBSTtJQUMxQyxNQUFNQyxPQUFPWixNQUFNQyxPQUFPLENBQUNFLE9BQU9TLElBQUksSUFBSVQsT0FBT1MsSUFBSSxHQUFHLEVBQUU7SUFDMUQsTUFBTUgsV0FBV0csS0FBS0MsU0FBUyxDQUFDLENBQUNMLE1BQVFmLE9BQU9lLEtBQUtNLFFBQVEsSUFBSUgsSUFBSSxPQUFPRDtJQUM1RSxJQUFJRCxhQUFhLENBQUMsR0FBRyxPQUFPO1FBQUVOO1FBQVFLLEtBQUs7UUFBTUMsVUFBVSxDQUFDO0lBQUU7SUFDOUQsT0FBTztRQUFFTjtRQUFRSyxLQUFLSSxJQUFJLENBQUNILFNBQVM7UUFBRUE7SUFBUztBQUNq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LE9BQU87Z0JBQ1BnRixVQUFVaEYsTUFBTWdGLFFBQVEsSUFBSTtZQUM5QixHQUNBO2dCQUFFdkcsUUFBUTtZQUFJO1FBRWxCO1FBQ0EsSUFBSXVCLE1BQU1ELElBQUksS0FBSyw0QkFBNEI7WUFDN0MsT0FBT3RFLHFEQUFZQSxDQUFDeUUsSUFBSSxDQUN0QjtnQkFBRUcsSUFBSTtnQkFBT04sTUFBTTtnQkFBa0JDLE9BQU9BLE1BQU1pRixPQUFPO2dCQUFFekMsU0FBU3hDLE1BQU13QyxPQUFPO1lBQUMsR0FDbEY7Z0JBQUUvRCxRQUFRO1lBQUk7UUFFbEI7UUFDQSxPQUFPaEQscURBQVlBLENBQUN5RSxJQUFJLENBQ3RCO1lBQUVHLElBQUk7WUFBT04sTUFBTTtZQUFnQkMsT0FBT0EsT0FBT2lGLFdBQVc7UUFBbUMsR0FDL0Y7WUFBRXhHLFFBQVE7UUFBSTtJQUVsQjtBQUNGO0FBRWdCIiwic291cmNlcyI6WyIvVXNlcnMvYW50b25pby9naC1hZ2VuY3ktcG9ydGFsL2FwcHMvYWdlbmN5LXBvcnRhbC9hcHAvYXBpL3dvcmtzcGFjZS93b3JrZmxvdy9wdWJsaXNoL3JvdXRlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUE9TVCAvYXBpL3dvcmtzcGFjZS93b3JrZmxvdy9wdWJsaXNoXG4gKlxuICogU2VydmVyLWF1dGhvcml0YXRpdmUgcHVibGlzaCBmb3Igc2FuZGJveC1lbnZpcm9ubWVudCB3b3JrZmxvdyByb3dzLlxuICogVGhpcyByb3V0ZSBpcyB0aGUgT05MWSB0cmFuc2l0aW9uIGZyb20gZHJhZnQgdG8gbGl2ZTogZGlyZWN0XG4gKiBgUEFUQ0ggL2FwaS93b3Jrc3BhY2VgIGlzIHBvbGljeS1ibG9ja2VkICh3b3Jrc3BhY2UtcGF0Y2gtcG9saWN5LmpzKSBmcm9tXG4gKiBjaGFuZ2luZyBgb3JjaGVzdHJhdGlvbkdyYXBoYCAvIGBvcmNoZXN0cmF0aW9uQ29uZmlnYCAvIGB2ZXJzaW9uYCAvXG4gKiBgb3JjaGVzdHJhdGlvblB1Ymxpc2hlZEF0YCAvIGBvcmNoZXN0cmF0aW9uRGVsdGFzYCBvciBzZXR0aW5nXG4gKiBgbGlmZWN5Y2xlU3RhdHVzOiBcImxpdmVcImAuXG4gKlxuICogUHVibGlzaCBnYXRlcyAoYWxsIHNlcnZlci12ZXJpZmllZCBhZ2FpbnN0IHRoZSBwZXJzaXN0ZWQgcm93IOKAlCB0aGUgY2xpZW50XG4gKiBjYW5ub3Qgdm91Y2ggZm9yIGl0c2VsZik6XG4gKiAgIDEuIFRoZSByb3cgZXhpc3RzIChvYmplY3QgaWQgKyBvYmplY3RUeXBlIFwic2FuZGJveC1lbnZpcm9ubWVudFwiICtcbiAqICAgICAgY2FwaXRhbC1OIGBOYW1lYCkuXG4gKiAgIDIuIEEgc2F2ZWQgZHJhZnQgZXhpc3RzIChgb3JjaGVzdHJhdGlvbkRyYWZ0Q29uZmlnYCAvIGBvcmNoZXN0cmF0aW9uRHJhZnRHcmFwaGApLlxuICogICAzLiBUaGUgZHJhZnQgd2FzIHRlc3QtcnVuIHN1Y2Nlc3NmdWxseTogYG9yY2hlc3RyYXRpb25EcmFmdFRlc3RQYXNzZWQgPT09IHRydWVgXG4gKiAgICAgIChzZXQgYnkgUE9TVCAvYXBpL3dvcmtzcGFjZS9zYW5kYm94LXJ1biB3aXRoIGB1c2VEcmFmdDogdHJ1ZWApLlxuICogICA0LiBUaGUgdGVzdGVkIGNvbmZpZyBpcyBieXRlLWlkZW50aWNhbCB0byB0aGUgc2F2ZWQgZHJhZnRcbiAqICAgICAgKGBvcmNoZXN0cmF0aW9uRHJhZnRUZXN0ZWRDb25maWdgID09PSBkcmFmdCkg4oCUIGEgZHJhZnQgZWRpdGVkIGFmdGVyXG4gKiAgICAgIGl0cyBzdWNjZXNzZnVsIHRlc3QgbXVzdCBiZSByZS10ZXN0ZWQuXG4gKiAgIDUuIFRoZSBkcmFmdCBwYXJzZXMgYXMgYSBzdHJ1Y3R1cmFsbHkgdmFsaWQgb3JjaGVzdHJhdGlvbiBncmFwaC5cbiAqXG4gKiBPbiBzdWNjZXNzOiBidW1wcyBgdmVyc2lvbmAsIG1vdmVzIHRoZSBkcmFmdCBpbnRvIHRoZSBsaXZlIGZpZWxkLCBjbGVhcnNcbiAqIGRyYWZ0IHN0YXRlLCBzdGFtcHMgYG9yY2hlc3RyYXRpb25QdWJsaXNoZWRBdGAsIGFwcGVuZHMgYW5cbiAqIGBvcmNoZXN0cmF0aW9uRGVsdGFzYCByZWNvcmQgKHdpdGggdGhlIHNoYTI1NiBvZiB0aGUgcHVibGlzaGVkIGNvbmZpZyksXG4gKiBzZXRzIGBsaWZlY3ljbGVTdGF0dXM6IFwibGl2ZVwiYCwgYW5kIHBlcnNpc3RzIHZpYSB3cml0ZVdvcmtzcGFjZUNvbmZpZy5cbiAqXG4gKiBSZXF1ZXN0OiAgeyBvYmplY3RJZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcgfVxuICogUmVzcG9uc2U6IHsgb2ssIG9iamVjdElkLCBuYW1lLCB2ZXJzaW9uLCBwdWJsaXNoZWRBdCwgbGl2ZUZpZWxkLFxuICogICAgICAgICAgICAgcHVibGlzaGVkU2hhMjU2LCB3b3Jrc3BhY2VDb25maWcgfVxuICogICAgICAgICAgIG9yIHsgb2s6IGZhbHNlLCBjb2RlLCBlcnJvciwgLi4uIH0gd2l0aCA0eHgvNXh4IHN0YXR1cy5cbiAqL1xuXG5pbXBvcnQgeyBOZXh0UmVzcG9uc2UgfSBmcm9tIFwibmV4dC9zZXJ2ZXJcIjtcbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tIFwibm9kZTpjcnlwdG9cIjtcbmltcG9ydCB7XG4gIHJlYWRXb3Jrc3BhY2VDb25maWcsXG4gIHJlYWRXb3Jrc3BhY2VTb3VyY2VSZWNvcmRzLFxuICB3cml0ZVdvcmtzcGFjZUNvbmZpZ1xufSBmcm9tIFwiQC9saWIvd29ya3NwYWNlLWNvbmZpZ1wiO1xuaW1wb3J0IHsgc2FuZGJveFJ1blNvdXJjZUlkIH0gZnJvbSBcIkAvbGliL3dvcmtzcGFjZS1kYXRhLW1vZGVsXCI7XG5pbXBvcnQgeyBwYXJzZU9yY2hlc3RyYXRpb25HcmFwaCwgdmFsaWRhdGVPcmNoZXN0cmF0aW9uR3JhcGggfSBmcm9tIFwiQC9saWIvb3JjaGVzdHJhdGlvbi1ncmFwaFwiO1xuaW1wb3J0IHsgc3RhYmxlU3RyaW5naWZ5IH0gZnJvbSBcIkAvbGliL3dvcmtzcGFjZS1wYXRjaC1wb2xpY3lcIjtcbmltcG9ydCB7IHJlYWRUcmlnZ2VyU2NoZWR1bGVCaW5kaW5nIH0gZnJvbSBcIkAvbGliL3dvcmtzcGFjZS1hZGQtb25zXCI7XG5pbXBvcnQge1xuICBnZXROb2RlRGVsdGFSZWNvcmRzLFxuICBub3JtYWxpemVEZWx0YVRhZ3MsXG4gIHBhdGNoU2FuZGJveFJvd0luQ29uZmlnLFxuICByZXNvbHZlV29ya2Zsb3dGaWVsZE5hbWVzXG59IGZyb20gXCJAL2xpYi9vcmNoZXN0cmF0aW9uLXB1Ymxpc2hcIjtcbmltcG9ydCB7IGFwcGVuZE91dGNvbWVSZWNlaXB0IH0gZnJvbSBcIkAvbGliL3dvcmtzcGFjZS1vdXRjb21lLXJlY2VpcHRzXCI7XG5pbXBvcnQgeyByZXF1aXJlQXBwU2NvcGUsIGNoZWNrU2NvcGVkV29ya2Zsb3dBY2Nlc3MgfSBmcm9tIFwiQC9saWIvd29ya3NwYWNlLWFwcC1yZWdpc3RyeVwiO1xuXG5mdW5jdGlvbiBzaGEyNTYodGV4dCkge1xuICByZXR1cm4gY3JlYXRlSGFzaChcInNoYTI1NlwiKS51cGRhdGUoU3RyaW5nKHRleHQpLCBcInV0ZjhcIikuZGlnZXN0KFwiaGV4XCIpO1xufVxuXG5mdW5jdGlvbiBmaW5kU2FuZGJveFJvdyh3b3Jrc3BhY2VDb25maWcsIG9iamVjdElkLCBuYW1lKSB7XG4gIGNvbnN0IG9iamVjdHMgPSBBcnJheS5pc0FycmF5KHdvcmtzcGFjZUNvbmZpZz8uZGF0YU1vZGVsPy5vYmplY3RzKSA/IHdvcmtzcGFjZUNvbmZpZy5kYXRhTW9kZWwub2JqZWN0cyA6IFtdO1xuICBjb25zdCBvYmplY3QgPSBvYmplY3RzLmZpbmQoKGVudHJ5KSA9PiBlbnRyeT8uaWQgPT09IG9iamVjdElkICYmIGVudHJ5Py5vYmplY3RUeXBlID09PSBcInNhbmRib3gtZW52aXJvbm1lbnRcIik7XG4gIGlmICghb2JqZWN0KSByZXR1cm4geyBvYmplY3Q6IG51bGwsIHJvdzogbnVsbCwgcm93SW5kZXg6IC0xIH07XG4gIGNvbnN0IHdhbnRlZE5hbWUgPSBTdHJpbmcobmFtZSB8fCBcIlwiKS50cmltKCk7XG4gIGNvbnN0IHJvd3MgPSBBcnJheS5pc0FycmF5KG9iamVjdC5yb3dzKSA/IG9iamVjdC5yb3dzIDogW107XG4gIGNvbnN0IHJvd0luZGV4ID0gcm93cy5maW5kSW5kZXgoKHJvdykgPT4gU3RyaW5nKHJvdz8uTmFtZSB8fCBcIlwiKS50cmltKCkgPT09IHdhbnRlZE5hbWUpO1xuICBpZiAocm93SW5kZXggPT09IC0xKSByZXR1cm4geyBvYmplY3QsIHJvdzogbnVsbCwgcm93SW5kZXg6IC0xIH07XG4gIHJldHVybiB7IG9iamVjdCwgcm93OiByb3dzW3Jvd0luZGV4XSwgcm93SW5kZXggfTtcbn1cblxuZnVuY3Rpb24gcm93SGFzU3VjY2Vzc2Z1bFNlcnZlcmxlc3NTY2hlZHVsZXJQcm9vZihyb3csIGRyYWZ0KSB7XG4gIGNvbnN0IHJ1bkxvY2FsaXR5ID0gU3RyaW5nKHJvdz8ucnVuTG9jYWxpdHkgfHwgXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIGNvbnN0IHNjaGVkdWxlclJlZ2lzdHJ5SWQgPSBTdHJpbmcocm93Py5zY2hlZHVsZXJSZWdpc3RyeUlkIHx8IFwiXCIpLnRyaW0oKTtcbiAgY29uc3Qgc2NoZWR1bGVJZCA9IFN0cmluZyhyb3c/LnNjaGVkdWxlSWQgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCBzdGF0dXMgPSBOdW1iZXIoU3RyaW5nKHJvdz8ubGFzdFNjaGVkdWxlZFJ1blN0YXR1cyB8fCBcIlwiKS50cmltKCkpO1xuICBjb25zdCBkcmFmdEdyYXBoID0gU3RyaW5nKGRyYWZ0IHx8IFwiXCIpLnRyaW0oKTtcbiAgY29uc3QgdGVzdGVkQ29uZmlnID0gU3RyaW5nKHJvdz8ub3JjaGVzdHJhdGlvbkRyYWZ0VGVzdGVkQ29uZmlnIHx8IFwiXCIpLnRyaW0oKTtcbiAgY29uc3QgbGl2ZUdyYXBoID0gU3RyaW5nKHJvdz8ub3JjaGVzdHJhdGlvbkdyYXBoIHx8IHJvdz8ub3JjaGVzdHJhdGlvbkNvbmZpZyB8fCBcIlwiKS50cmltKCk7XG4gIGNvbnN0IGJpbmRpbmcgPSByZWFkVHJpZ2dlclNjaGVkdWxlQmluZGluZyhyb3c/Lm9yY2hlc3RyYXRpb25HcmFwaCB8fCByb3c/Lm9yY2hlc3RyYXRpb25Db25maWcpO1xuICByZXR1cm4gcnVuTG9jYWxpdHkgPT09IFwic2VydmVybGVzc1wiXG4gICAgJiYgQm9vbGVhbihzY2hlZHVsZXJSZWdpc3RyeUlkKVxuICAgICYmIEJvb2xlYW4oc2NoZWR1bGVJZClcbiAgICAmJiBOdW1iZXIuaXNGaW5pdGUoc3RhdHVzKVxuICAgICYmIHN0YXR1cyA+PSAyMDBcbiAgICAmJiBzdGF0dXMgPCAzMDBcbiAgICAmJiBiaW5kaW5nPy5lbmFibGVkID09PSB0cnVlXG4gICAgJiYgYmluZGluZz8uc2NoZWR1bGVJZCA9PT0gc2NoZWR1bGVJZFxuICAgICYmIGJpbmRpbmc/LnNjaGVkdWxlclJlZ2lzdHJ5SWQgPT09IHNjaGVkdWxlclJlZ2lzdHJ5SWRcbiAgICAmJiAodGVzdGVkQ29uZmlnID09PSBkcmFmdEdyYXBoIHx8IGxpdmVHcmFwaCA9PT0gZHJhZnRHcmFwaCk7XG59XG5cbi8qKlxuICogR2F0ZSBmYWlsdXJlcyBhcmUgZ292ZXJuYW5jZSBzaWduYWw6IGVtaXQgYSBibG9ja2VkIG91dGNvbWUgcmVjZWlwdFxuICogKG5vbi1mYXRhbCkgYW5kIHJldHVybiB0aGUgc3RydWN0dXJlZCBmYWlsdXJlIGVudmVsb3BlLlxuICovXG5hc3luYyBmdW5jdGlvbiBwdWJsaXNoQmxvY2tlZChodHRwU3RhdHVzLCBib2R5LCByZWZzKSB7XG4gIGF3YWl0IGFwcGVuZE91dGNvbWVSZWNlaXB0KHtcbiAgICBraW5kOiBcIndvcmtmbG93LXB1Ymxpc2hcIixcbiAgICBsYW5lOiBcInNlcnZlci1hdXRob3JpdGF0aXZlXCIsXG4gICAgb3V0Y29tZVN0YXR1czogXCJibG9ja2VkXCIsXG4gICAgLi4uKHJlZnMgPyB7IG9iamVjdFJlZnM6IFtyZWZzXSB9IDoge30pLFxuICAgIHN1bW1hcnk6IGBwdWJsaXNoIGJsb2NrZWQgKCR7Ym9keS5jb2RlfSk6ICR7Ym9keS5lcnJvcn1gLFxuICAgIG5leHRBY3Rpb25zOiBib2R5LmNvZGUgPT09IFwibm9fZHJhZnRcIiB8fCBib2R5LmNvZGUgPT09IFwiZHJhZnRfbm90X3Rlc3RlZFwiIHx8IGJvZHkuY29kZSA9PT0gXCJkcmFmdF9ydW5fbm90X3ZlcmlmaWVkXCIgfHwgYm9keS5jb2RlID09PSBcImRyYWZ0X2NoYW5nZWRfYWZ0ZXJfdGVzdFwiXG4gICAgICA/IFtcIlNhdmUgdGhlIGRyYWZ0LCBydW4gUE9TVCAvYXBpL3dvcmtzcGFjZS9zYW5kYm94LXJ1biB7dXNlRHJhZnQ6dHJ1ZX0gdG8gYSBwYXNzaW5nIHJlc3VsdCwgYXR0ZXN0LCB0aGVuIHB1Ymxpc2hcIl1cbiAgICAgIDogW11cbiAgfSk7XG4gIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihib2R5LCB7IHN0YXR1czogaHR0cFN0YXR1cyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gUE9TVChyZXF1ZXN0KSB7XG4gIGxldCBib2R5O1xuICB0cnkge1xuICAgIGJvZHkgPSBhd2FpdCByZXF1ZXN0Lmpzb24oKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgb2s6IGZhbHNlLCBjb2RlOiBcImludmFsaWRfYm9keVwiLCBlcnJvcjogXCJpbnZhbGlkIGpzb24gYm9keVwiIH0sIHsgc3RhdHVzOiA0MDAgfSk7XG4gIH1cbiAgY29uc3Qgb2JqZWN0SWQgPSB0eXBlb2YgYm9keT8ub2JqZWN0SWQgPT09IFwic3RyaW5nXCIgPyBib2R5Lm9iamVjdElkLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IG5hbWUgPSB0eXBlb2YgYm9keT8ubmFtZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubmFtZS50cmltKCkgOiBcIlwiO1xuICBjb25zdCByZXF1ZXN0ZWRGaWVsZCA9IHR5cGVvZiBib2R5Py5maWVsZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuZmllbGQudHJpbSgpIDogXCJcIjtcbiAgaWYgKCFvYmplY3RJZCB8fCAhbmFtZSkge1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihcbiAgICAgIHsgb2s6IGZhbHNlLCBjb2RlOiBcImludmFsaWRfYm9keVwiLCBlcnJvcjogXCJvYmplY3RJZCBhbmQgbmFtZSBhcmUgcmVxdWlyZWRcIiB9LFxuICAgICAgeyBzdGF0dXM6IDQwMCB9XG4gICAgKTtcbiAgfVxuICBpZiAocmVxdWVzdGVkRmllbGQgJiYgcmVxdWVzdGVkRmllbGQgIT09IFwib3JjaGVzdHJhdGlvbkNvbmZpZ1wiICYmIHJlcXVlc3RlZEZpZWxkICE9PSBcIm9yY2hlc3RyYXRpb25HcmFwaFwiKSB7XG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKFxuICAgICAgeyBvazogZmFsc2UsIGNvZGU6IFwiaW52YWxpZF9ib2R5XCIsIGVycm9yOiAnZmllbGQgbXVzdCBiZSBcIm9yY2hlc3RyYXRpb25Db25maWdcIiBvciBcIm9yY2hlc3RyYXRpb25HcmFwaFwiIHdoZW4gcHJvdmlkZWQnIH0sXG4gICAgICB7IHN0YXR1czogNDAwIH1cbiAgICApO1xuICB9XG5cbiAgY29uc3Qgd29ya3NwYWNlQ29uZmlnID0gYXdhaXQgcmVhZFdvcmtzcGFjZUNvbmZpZygpO1xuXG4gIC8vIFVuaWZpZWQgYXBwLXNjb3BlIGdhdGUgKHJvdXRlLXNob3BwaW5nIGNsb3NlZCk6IHdpdGggeC1ncm93dGh1Yi1hcHAtc2NvcGUsXG4gIC8vIHB1Ymxpc2ggbWF5IG9ubHkgcHJvbW90ZSBhIHdvcmtmbG93IGluc2lkZSB0aGUgYXBwJ3MgZ292ZXJuZWQgc2NvcGUuXG4gIC8vIE5COiBwdWJsaXNoIGlzIGRlbGliZXJhdGVseSBOT1QgYmxvY2tlZCB3aGVuIHRoZSBhcHAncyBoZWFsdGggaXNcbiAgLy8gXCJibG9ja2VkXCIg4oCUIHB1Ymxpc2hpbmcgaXMgaG93IHRoZSBcIndvcmtmbG93IG5vdCBsaXZlXCIgYmxvY2tlciBpcyBjbGVhcmVkLlxuICBjb25zdCBzY29wZSA9IHJlcXVpcmVBcHBTY29wZShyZXF1ZXN0LCB3b3Jrc3BhY2VDb25maWcpO1xuICBpZiAoc2NvcGUuc2NvcGVkKSB7XG4gICAgY29uc3QgdmlvbGF0aW9uID0gc2NvcGUudmlvbGF0aW9uIHx8IGNoZWNrU2NvcGVkV29ya2Zsb3dBY2Nlc3Moc2NvcGUuY29udGV4dCwgb2JqZWN0SWQsIG5hbWUpO1xuICAgIGlmICh2aW9sYXRpb24pIHtcbiAgICAgIGF3YWl0IGFwcGVuZE91dGNvbWVSZWNlaXB0KHtcbiAgICAgICAga2luZDogXCJ3b3JrZmxvdy1wdWJsaXNoXCIsIGxhbmU6IFwic2VydmVyLWF1dGhvcml0YXRpdmVcIiwgb3V0Y29tZVN0YXR1czogXCJibG9ja2VkXCIsXG4gICAgICAgIGFwcElkOiB2aW9sYXRpb24uYXBwU2NvcGUgfHwgc2NvcGUuYXBwSWQsXG4gICAgICAgIHN1bW1hcnk6IGBwdWJsaXNoIHJlamVjdGVkICg0MjIgYXBwIHNjb3BlKTogJHt2aW9sYXRpb24udmlvbGF0aW9uVHlwZX1gLFxuICAgICAgICBuZXh0QWN0aW9uczogdmlvbGF0aW9uLnJlcGFpclBsYW5cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHZpb2xhdGlvbiwgeyBzdGF0dXM6IDQyMiB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCB7IG9iamVjdCwgcm93LCByb3dJbmRleCB9ID0gZmluZFNhbmRib3hSb3cod29ya3NwYWNlQ29uZmlnLCBvYmplY3RJZCwgbmFtZSk7XG4gIGlmICghb2JqZWN0KSB7XG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKFxuICAgICAgeyBvazogZmFsc2UsIGNvZGU6IFwib2JqZWN0X25vdF9mb3VuZFwiLCBlcnJvcjogYG5vIHNhbmRib3gtZW52aXJvbm1lbnQgb2JqZWN0IHdpdGggaWQgJHtvYmplY3RJZH1gIH0sXG4gICAgICB7IHN0YXR1czogNDA0IH1cbiAgICApO1xuICB9XG4gIGlmICghcm93KSB7XG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKFxuICAgICAgeyBvazogZmFsc2UsIGNvZGU6IFwicm93X25vdF9mb3VuZFwiLCBlcnJvcjogYG5vIHNhbmRib3ggcm93IG5hbWVkICR7bmFtZX0gaW4gb2JqZWN0ICR7b2JqZWN0SWR9YCB9LFxuICAgICAgeyBzdGF0dXM6IDQwNCB9XG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IHsgbGl2ZUZpZWxkLCBkcmFmdEZpZWxkIH0gPSByZXNvbHZlV29ya2Zsb3dGaWVsZE5hbWVzKHJvdywgcmVxdWVzdGVkRmllbGQgfHwgdW5kZWZpbmVkKTtcbiAgY29uc3QgZHJhZnQgPSBTdHJpbmcocm93W2RyYWZ0RmllbGRdID8/IFwiXCIpLnRyaW0oKTtcbiAgaWYgKCFkcmFmdCkge1xuICAgIHJldHVybiBwdWJsaXNoQmxvY2tlZCg0MDksIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIGNvZGU6IFwibm9fZHJhZnRcIixcbiAgICAgIGVycm9yOiBgbm8gc2F2ZWQgZHJhZnQgaW4gJHtkcmFmdEZpZWxkfSDigJQgc2F2ZSB0aGUgZHJhZnQsIHRlc3QgaXQgd2l0aCBzYW5kYm94LXJ1biB1c2VEcmFmdDp0cnVlLCB0aGVuIHB1Ymxpc2hgXG4gICAgfSwgeyBvYmplY3RJZCwgcm93TmFtZTogbmFtZSwgb2JqZWN0VHlwZTogXCJzYW5kYm94LWVudmlyb25tZW50XCIgfSk7XG4gIH1cblxuICBjb25zdCBkcmFmdFBhc3NlZCA9IHJvdy5vcmNoZXN0cmF0aW9uRHJhZnRUZXN0UGFzc2VkID09PSB0cnVlXG4gICAgfHwgU3RyaW5nKHJvdy5vcmNoZXN0cmF0aW9uRHJhZnRUZXN0UGFzc2VkID8/IFwiXCIpID09PSBcInRydWVcIjtcbiAgY29uc3Qgc2VydmVybGVzc1NjaGVkdWxlclByb29mUGFzc2VkID0gcm93SGFzU3VjY2Vzc2Z1bFNlcnZlcmxlc3NTY2hlZHVsZXJQcm9vZihyb3csIGRyYWZ0KTtcbiAgaWYgKCFkcmFmdFBhc3NlZCAmJiAhc2VydmVybGVzc1NjaGVkdWxlclByb29mUGFzc2VkKSB7XG4gICAgcmV0dXJuIHB1Ymxpc2hCbG9ja2VkKDQwOSwge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgY29kZTogXCJkcmFmdF9ub3RfdGVzdGVkXCIsXG4gICAgICBlcnJvcjogXCJwdWJsaXNoIGJsb2NrZWQg4oCUIHRoZSBzYXZlZCBkcmFmdCBoYXMgbm8gc3VjY2Vzc2Z1bCB0ZXN0IHJ1bjsgXCIgK1xuICAgICAgICBcInJ1biBQT1NUIC9hcGkvd29ya3NwYWNlL3NhbmRib3gtcnVuIHdpdGggdXNlRHJhZnQ6dHJ1ZSBvciB0aGUgaW5zdGFsbGVkIHNlcnZlcmxlc3Mgc2NoZWR1bGVyIHdpdGggYSBwYXNzaW5nIHJlc3VsdCBmaXJzdFwiXG4gICAgfSwgeyBvYmplY3RJZCwgcm93TmFtZTogbmFtZSwgb2JqZWN0VHlwZTogXCJzYW5kYm94LWVudmlyb25tZW50XCIgfSk7XG4gIH1cblxuICBjb25zdCB0ZXN0ZWRDb25maWcgPSBTdHJpbmcocm93Lm9yY2hlc3RyYXRpb25EcmFmdFRlc3RlZENvbmZpZyA/PyBcIlwiKTtcbiAgaWYgKCFzZXJ2ZXJsZXNzU2NoZWR1bGVyUHJvb2ZQYXNzZWQgJiYgdGVzdGVkQ29uZmlnICE9PSBkcmFmdCkge1xuICAgIHJldHVybiBwdWJsaXNoQmxvY2tlZCg0MDksIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIGNvZGU6IFwiZHJhZnRfY2hhbmdlZF9hZnRlcl90ZXN0XCIsXG4gICAgICBlcnJvcjogXCJwdWJsaXNoIGJsb2NrZWQg4oCUIHRoZSBkcmFmdCBjaGFuZ2VkIGFmdGVyIGl0cyBzdWNjZXNzZnVsIHRlc3Q7IHJlLXRlc3QgdGhpcyBleGFjdCBkcmFmdFwiLFxuICAgICAgLy8gRGlhZ25vc3RpYyByYXctU1RSSU5HIGhhc2hlcyAodGhlIGVxdWFsaXR5IGFib3ZlIGlzIGJ5dGUtbGV2ZWwpO1xuICAgICAgLy8gdGhlIGNhbm9uaWNhbCBncmFwaCBoYXNoIGV2ZXJ5d2hlcmUgZWxzZSBpcyBzaGEyNTYoc3RhYmxlU3RyaW5naWZ5KHBhcnNlZEdyYXBoKSkuXG4gICAgICBkcmFmdFN0cmluZ1NoYTI1Njogc2hhMjU2KGRyYWZ0KSxcbiAgICAgIHRlc3RlZFN0cmluZ1NoYTI1Njogc2hhMjU2KHRlc3RlZENvbmZpZylcbiAgICB9LCB7IG9iamVjdElkLCByb3dOYW1lOiBuYW1lLCBvYmplY3RUeXBlOiBcInNhbmRib3gtZW52aXJvbm1lbnRcIiB9KTtcbiAgfVxuXG4gIC8vIExpbmVhZ2UgZ2F0ZSDigJQgdGhlIGRyYWZ0LWZpZWxkIGF0dGVzdGF0aW9uIChgb3JjaGVzdHJhdGlvbkRyYWZ0VGVzdFBhc3NlZGAsXG4gIC8vIGBvcmNoZXN0cmF0aW9uRHJhZnRUZXN0ZWRDb25maWdgKSBpcyBQQVRDSC13cml0YWJsZSwgc28gaXQgaXMgbm90IHRydXN0ZWRcbiAgLy8gYWxvbmUuIFRoZSBjbGFpbWVkIGRyYWZ0IHJ1biBtdXN0IGV4aXN0IGluIHRoZSBzb3VyY2UtcmVjb3JkIHJ1biBoaXN0b3J5XG4gIC8vICh3aGljaCBvbmx5IHNhbmRib3gtcnVuIHdyaXRlczsgUEFUQ0ggaXMgcG9saWN5LWJsb2NrZWQgZnJvbSBzaWRlY2FyXG4gIC8vIHdyaXRlcyksIG11c3QgaGF2ZSBwYXNzZWQgKGV4aXRDb2RlIDAsIG5vIGVycm9yKSwgYW5kIHRoZSBncmFwaCBpdFxuICAvLyBhY3R1YWxseSBleGVjdXRlZCBtdXN0IGVxdWFsIHRoaXMgZHJhZnQuXG4gIGNvbnN0IGRyYWZ0UnVuSWQgPSBTdHJpbmcocm93Lm9yY2hlc3RyYXRpb25EcmFmdExhc3RSdW5JZCA/PyBcIlwiKS50cmltKCk7XG4gIGlmICghc2VydmVybGVzc1NjaGVkdWxlclByb29mUGFzc2VkICYmICFkcmFmdFJ1bklkKSB7XG4gICAgcmV0dXJuIHB1Ymxpc2hCbG9ja2VkKDQwOSwge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgY29kZTogXCJkcmFmdF9ydW5fbm90X3ZlcmlmaWVkXCIsXG4gICAgICBlcnJvcjogXCJwdWJsaXNoIGJsb2NrZWQg4oCUIG5vIHNlcnZlci1yZWNvcmRlZCBkcmFmdCBydW4gb24gdGhpcyByb3c7IFwiICtcbiAgICAgICAgXCJydW4gUE9TVCAvYXBpL3dvcmtzcGFjZS9zYW5kYm94LXJ1biB3aXRoIHVzZURyYWZ0OnRydWUgZmlyc3RcIlxuICAgIH0sIHsgb2JqZWN0SWQsIHJvd05hbWU6IG5hbWUsIG9iamVjdFR5cGU6IFwic2FuZGJveC1lbnZpcm9ubWVudFwiIH0pO1xuICB9XG4gIGNvbnN0IHNvdXJjZUlkID0gc2FuZGJveFJ1blNvdXJjZUlkKG9iamVjdElkLCByb3cuTmFtZSB8fCBuYW1lKTtcbiAgY29uc3QgaGlzdG9yeSA9ICFzZXJ2ZXJsZXNzU2NoZWR1bGVyUHJvb2ZQYXNzZWQgJiYgc291cmNlSWQgPyBhd2FpdCByZWFkV29ya3NwYWNlU291cmNlUmVjb3Jkcyhzb3VyY2VJZCkgOiBudWxsO1xuICBjb25zdCByZWNvcmRzID0gQXJyYXkuaXNBcnJheShoaXN0b3J5Py5yZWNvcmRzKSA/IGhpc3RvcnkucmVjb3JkcyA6IFtdO1xuICBjb25zdCBydW5SZWNvcmQgPSBzZXJ2ZXJsZXNzU2NoZWR1bGVyUHJvb2ZQYXNzZWRcbiAgICA/IG51bGxcbiAgICA6IHJlY29yZHMuZmluZCgocmVjb3JkKSA9PiBTdHJpbmcocmVjb3JkPy5ydW5JZCA/PyBcIlwiKSA9PT0gZHJhZnRSdW5JZCk7XG4gIGlmICghc2VydmVybGVzc1NjaGVkdWxlclByb29mUGFzc2VkKSB7XG4gICAgaWYgKCFydW5SZWNvcmQpIHtcbiAgICAgIHJldHVybiBwdWJsaXNoQmxvY2tlZCg0MDksIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBjb2RlOiBcImRyYWZ0X3J1bl9ub3RfdmVyaWZpZWRcIixcbiAgICAgICAgZXJyb3I6IGBwdWJsaXNoIGJsb2NrZWQg4oCUIGRyYWZ0IHJ1biAke2RyYWZ0UnVuSWR9IGhhcyBubyByZWNvcmQgaW4gdGhlIHNhbmRib3ggcnVuIGhpc3RvcnkgKCR7c291cmNlSWR9KWBcbiAgICAgIH0sIHsgb2JqZWN0SWQsIHJvd05hbWU6IG5hbWUsIG9iamVjdFR5cGU6IFwic2FuZGJveC1lbnZpcm9ubWVudFwiIH0pO1xuICAgIH1cbiAgICBpZiAocnVuUmVjb3JkLmV4aXRDb2RlICE9PSAwIHx8IHJ1blJlY29yZC5lcnJvcikge1xuICAgICAgcmV0dXJuIHB1Ymxpc2hCbG9ja2VkKDQwOSwge1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIGNvZGU6IFwiZHJhZnRfcnVuX25vdF92ZXJpZmllZFwiLFxuICAgICAgICBlcnJvcjogYHB1Ymxpc2ggYmxvY2tlZCDigJQgZHJhZnQgcnVuICR7ZHJhZnRSdW5JZH0gZGlkIG5vdCBwYXNzIChleGl0Q29kZSAke3J1blJlY29yZC5leGl0Q29kZX0pYFxuICAgICAgfSwgeyBvYmplY3RJZCwgcm93TmFtZTogbmFtZSwgb2JqZWN0VHlwZTogXCJzYW5kYm94LWVudmlyb25tZW50XCIgfSk7XG4gICAgfVxuICB9XG4gIC8vIFRoZSByZWNvcmQncyBkcmFmdFNoYTI1NiBpcyBzdGFtcGVkIGJ5IHNhbmRib3gtcnVuIGZyb20gdGhlIGV4YWN0IGdyYXBoXG4gIC8vIGl0IGV4ZWN1dGVkLCBiZWZvcmUgZXhlY3V0aW9uLiBJdCBtdXN0IG1hdGNoIHRoaXMgc2F2ZWQgZHJhZnQuXG4gIGNvbnN0IGRyYWZ0R3JhcGhQYXJzZWQgPSBwYXJzZU9yY2hlc3RyYXRpb25HcmFwaChkcmFmdCk7XG4gIGNvbnN0IGV4cGVjdGVkU2hhMjU2ID0gY3JlYXRlSGFzaChcInNoYTI1NlwiKVxuICAgIC51cGRhdGUoc3RhYmxlU3RyaW5naWZ5KGRyYWZ0R3JhcGhQYXJzZWQpLCBcInV0ZjhcIilcbiAgICAuZGlnZXN0KFwiaGV4XCIpO1xuICBpZiAoIXNlcnZlcmxlc3NTY2hlZHVsZXJQcm9vZlBhc3NlZCAmJiAocnVuUmVjb3JkLnVzZURyYWZ0ICE9PSB0cnVlIHx8IHJ1blJlY29yZC5kcmFmdFNoYTI1NiAhPT0gZXhwZWN0ZWRTaGEyNTYpKSB7XG4gICAgcmV0dXJuIHB1Ymxpc2hCbG9ja2VkKDQwOSwge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgY29kZTogXCJkcmFmdF9ydW5fbm90X3ZlcmlmaWVkXCIsXG4gICAgICBlcnJvcjogYHB1Ymxpc2ggYmxvY2tlZCDigJQgZHJhZnQgcnVuICR7ZHJhZnRSdW5JZH0gZXhlY3V0ZWQgYSBkaWZmZXJlbnQgZ3JhcGggdGhhbiB0aGUgc2F2ZWQgZHJhZnQgYCArXG4gICAgICAgIFwiKG9yIHdhcyBub3QgYSBkcmFmdCBydW4pOyByZS10ZXN0IHRoaXMgZXhhY3QgZHJhZnQgd2l0aCBzYW5kYm94LXJ1biB1c2VEcmFmdDp0cnVlXCJcbiAgICB9LCB7IG9iamVjdElkLCByb3dOYW1lOiBuYW1lLCBvYmplY3RUeXBlOiBcInNhbmRib3gtZW52aXJvbm1lbnRcIiB9KTtcbiAgfVxuXG4gIGNvbnN0IHBhcnNlZERyYWZ0ID0gZHJhZnRHcmFwaFBhcnNlZDtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlT3JjaGVzdHJhdGlvbkdyYXBoKHBhcnNlZERyYWZ0KTtcbiAgaWYgKCF2YWxpZGF0aW9uPy5vaykge1xuICAgIHJldHVybiBwdWJsaXNoQmxvY2tlZCg0MDAsIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIGNvZGU6IFwiaW52YWxpZF9ncmFwaFwiLFxuICAgICAgZXJyb3I6IFwicHVibGlzaCBibG9ja2VkIOKAlCB0aGUgZHJhZnQgZG9lcyBub3QgcGFyc2UgYXMgYSB2YWxpZCBvcmNoZXN0cmF0aW9uIGdyYXBoXCIsXG4gICAgICBkZXRhaWxzOiB2YWxpZGF0aW9uPy5lcnJvcnMgPz8gW11cbiAgICB9LCB7IG9iamVjdElkLCByb3dOYW1lOiBuYW1lLCBvYmplY3RUeXBlOiBcInNhbmRib3gtZW52aXJvbm1lbnRcIiB9KTtcbiAgfVxuXG4gIGNvbnN0IHB1Ymxpc2hlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBjb25zdCBjdXJyZW50VmVyc2lvbiA9IE51bWJlcihyb3cudmVyc2lvbiB8fCAxKTtcbiAgY29uc3QgbmV4dFZlcnNpb24gPSBOdW1iZXIuaXNGaW5pdGUoY3VycmVudFZlcnNpb24pID8gU3RyaW5nKGN1cnJlbnRWZXJzaW9uICsgMSkgOiBcIjFcIjtcbiAgY29uc3QgcHJldmlvdXNEZWx0YXMgPSBBcnJheS5pc0FycmF5KHJvdy5vcmNoZXN0cmF0aW9uRGVsdGFzKSA/IHJvdy5vcmNoZXN0cmF0aW9uRGVsdGFzIDogW107XG4gIGNvbnN0IHByZXZpb3VzUHVibGlzaGVkR3JhcGggPSBwYXJzZU9yY2hlc3RyYXRpb25HcmFwaChyb3dbbGl2ZUZpZWxkXSk7XG4gIGNvbnN0IG5vZGVEZWx0YXMgPSBnZXROb2RlRGVsdGFSZWNvcmRzKHByZXZpb3VzUHVibGlzaGVkR3JhcGgsIHBhcnNlZERyYWZ0KTtcbiAgY29uc3QgZGVsdGFUYWdzID0gbm9ybWFsaXplRGVsdGFUYWdzKG5vZGVEZWx0YXMuZmxhdE1hcCgoZGVsdGEpID0+IGRlbHRhLmRlbHRhVGFncykpO1xuICBjb25zdCBjaGFuZ2VSZWFzb24gPSBub2RlRGVsdGFzLm1hcCgoZGVsdGEpID0+IGRlbHRhLmNoYW5nZVJlYXNvbikuZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCJcXG5cIik7XG4gIC8vIE9uZSBjYW5vbmljYWwgZHJhZnQvZ3JhcGggaGFzaCBldmVyeXdoZXJlOiBzaGEyNTYoc3RhYmxlU3RyaW5naWZ5KHBhcnNlZEdyYXBoKSkuXG4gIC8vIFRoaXMgaXMgdGhlIHNhbWUgdmFsdWUgc2FuZGJveC1ydW4gc3RhbXBlZCBhcyB0aGUgcmVjb3JkJ3MgZHJhZnRTaGEyNTYsXG4gIC8vIHNvIHRoZSBsaW5lYWdlIHJlY29yZCBhbmQgdGhlIHB1Ymxpc2ggZGVsdGEgYXJlIGRpcmVjdGx5IGNvbXBhcmFibGUuXG4gIGNvbnN0IHB1Ymxpc2hlZFNoYTI1NiA9IGV4cGVjdGVkU2hhMjU2O1xuXG4gIGNvbnN0IG5leHQgPSBwYXRjaFNhbmRib3hSb3dJbkNvbmZpZyh3b3Jrc3BhY2VDb25maWcsIG9iamVjdElkLCByb3dJbmRleCwge1xuICAgIFtsaXZlRmllbGRdOiBkcmFmdCxcbiAgICBbZHJhZnRGaWVsZF06IFwiXCIsXG4gICAgdmVyc2lvbjogbmV4dFZlcnNpb24sXG4gICAgbGlmZWN5Y2xlU3RhdHVzOiBcImxpdmVcIixcbiAgICBvcmNoZXN0cmF0aW9uRHJhZnRTdGF0dXM6IFwicHVibGlzaGVkXCIsXG4gICAgb3JjaGVzdHJhdGlvbkRyYWZ0VGVzdFBhc3NlZDogZmFsc2UsXG4gICAgb3JjaGVzdHJhdGlvbkRyYWZ0VGVzdGVkQ29uZmlnOiBcIlwiLFxuICAgIG9yY2hlc3RyYXRpb25QdWJsaXNoZWRBdDogcHVibGlzaGVkQXQsXG4gICAgb3JjaGVzdHJhdGlvbkRlbHRhczogW1xuICAgICAgLi4ucHJldmlvdXNEZWx0YXMsXG4gICAgICB7XG4gICAgICAgIGF0OiBwdWJsaXNoZWRBdCxcbiAgICAgICAgdmVyc2lvbjogbmV4dFZlcnNpb24sXG4gICAgICAgIGZpZWxkOiBsaXZlRmllbGQsXG4gICAgICAgIGFjdGlvbjogXCJwdWJsaXNoXCIsXG4gICAgICAgIHByZXZpb3VzVmVyc2lvbjogU3RyaW5nKHJvdy52ZXJzaW9uIHx8IFwiMVwiKSxcbiAgICAgICAgZHJhZnRUZXN0ZWRBdDogcm93Lm9yY2hlc3RyYXRpb25EcmFmdExhc3RUZXN0ZWQgfHwgXCJcIixcbiAgICAgICAgZHJhZnRSdW5JZDogcm93Lm9yY2hlc3RyYXRpb25EcmFmdExhc3RSdW5JZCB8fCBcIlwiLFxuICAgICAgICBwdWJsaXNoZWRTaGEyNTYsXG4gICAgICAgIGNoYW5nZVJlYXNvbixcbiAgICAgICAgZGVsdGFUYWdzLFxuICAgICAgICBub2RlRGVsdGFzLFxuICAgICAgICBub2RlQ291bnQ6IEFycmF5LmlzQXJyYXkocGFyc2VkRHJhZnQ/Lm5vZGVzKSA/IHBhcnNlZERyYWZ0Lm5vZGVzLmxlbmd0aCA6IDAsXG4gICAgICAgIGVkZ2VDb3VudDogQXJyYXkuaXNBcnJheShwYXJzZWREcmFmdD8uZWRnZXMpID8gcGFyc2VkRHJhZnQuZWRnZXMubGVuZ3RoIDogMFxuICAgICAgfVxuICAgIF1cbiAgfSk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwZXJzaXN0ZWQgPSBhd2FpdCB3cml0ZVdvcmtzcGFjZUNvbmZpZyh7IGRhdGFNb2RlbDogbmV4dC5kYXRhTW9kZWwgfSk7XG4gICAgY29uc3QgeyByZWNlaXB0IH0gPSBhd2FpdCBhcHBlbmRPdXRjb21lUmVjZWlwdCh7XG4gICAgICBraW5kOiBcIndvcmtmbG93LXB1Ymxpc2hcIixcbiAgICAgIGxhbmU6IFwic2VydmVyLWF1dGhvcml0YXRpdmVcIixcbiAgICAgIG91dGNvbWVTdGF0dXM6IFwicHVibGlzaGVkXCIsXG4gICAgICAuLi4oc2NvcGUuc2NvcGVkID8geyBhcHBJZDogc2NvcGUuYXBwSWQgfSA6IHt9KSxcbiAgICAgIG9iamVjdFJlZnM6IFt7IG9iamVjdElkLCByb3dOYW1lOiBuYW1lLCBvYmplY3RUeXBlOiBcInNhbmRib3gtZW52aXJvbm1lbnRcIiB9XSxcbiAgICAgIGNoYW5nZWRGaWVsZHM6IFtcImRhdGFNb2RlbFwiXSxcbiAgICAgIHJ1bklkOiBkcmFmdFJ1bklkLFxuICAgICAgc291cmNlSWQsXG4gICAgICBkcmFmdFNoYTI1NjogZXhwZWN0ZWRTaGEyNTYsXG4gICAgICBwdWJsaXNoZWRTaGEyNTYsXG4gICAgICB2ZXJzaW9uOiBuZXh0VmVyc2lvbixcbiAgICAgIHN1bW1hcnk6IGBwdWJsaXNoZWQgJHtsaXZlRmllbGR9IHYke25leHRWZXJzaW9ufSBmb3IgJHtvYmplY3RJZH0vJHtuYW1lfSAoJHtub2RlRGVsdGFzLmxlbmd0aH0gbm9kZSBkZWx0YShzKSwgdmVyaWZpZWQgZHJhZnQgcnVuICR7ZHJhZnRSdW5JZH0pYCxcbiAgICAgIHJvbGxiYWNrUmVmOiB7XG4gICAgICAgIG9iamVjdElkLFxuICAgICAgICByb3dOYW1lOiBuYW1lLFxuICAgICAgICBsaXZlRmllbGQsXG4gICAgICAgIHByZXZpb3VzVmVyc2lvbjogU3RyaW5nKHJvdy52ZXJzaW9uIHx8IFwiMVwiKSxcbiAgICAgICAgZGVsdGFJbmRleDogcHJldmlvdXNEZWx0YXMubGVuZ3RoLFxuICAgICAgICBzb3VyY2VJZFxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7XG4gICAgICBvazogdHJ1ZSxcbiAgICAgIG9iamVjdElkLFxuICAgICAgbmFtZSxcbiAgICAgIHZlcnNpb246IG5leHRWZXJzaW9uLFxuICAgICAgcHVibGlzaGVkQXQsXG4gICAgICBsaXZlRmllbGQsXG4gICAgICBwdWJsaXNoZWRTaGEyNTYsXG4gICAgICByZWNlaXB0SWQ6IHJlY2VpcHQucmVjZWlwdElkLFxuICAgICAgd29ya3NwYWNlQ29uZmlnOiBwZXJzaXN0ZWRcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IuY29kZSA9PT0gXCJXT1JLU1BBQ0VfUEVSU0lTVEVOQ0VfUkVBRF9PTkxZXCIpIHtcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihcbiAgICAgICAge1xuICAgICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgICBjb2RlOiBcInJlYWRfb25seVwiLFxuICAgICAgICAgIGVycm9yOiBcIndvcmtzcGFjZSBjb25maWcgaXMgcmVhZC1vbmx5IGluIHRoaXMgcnVudGltZVwiLFxuICAgICAgICAgIGd1aWRhbmNlOiBlcnJvci5ndWlkYW5jZSB8fCBudWxsXG4gICAgICAgIH0sXG4gICAgICAgIHsgc3RhdHVzOiA0MDkgfVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKGVycm9yLmNvZGUgPT09IFwiSU5WQUxJRF9XT1JLU1BBQ0VfQ09ORklHXCIpIHtcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihcbiAgICAgICAgeyBvazogZmFsc2UsIGNvZGU6IFwiaW52YWxpZF9jb25maWdcIiwgZXJyb3I6IGVycm9yLm1lc3NhZ2UsIGRldGFpbHM6IGVycm9yLmRldGFpbHMgfSxcbiAgICAgICAgeyBzdGF0dXM6IDQwMCB9XG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oXG4gICAgICB7IG9rOiBmYWxzZSwgY29kZTogXCJ3cml0ZV9mYWlsZWRcIiwgZXJyb3I6IGVycm9yPy5tZXNzYWdlIHx8IFwiZmFpbGVkIHRvIHdyaXRlIHdvcmtzcGFjZSBjb25maWdcIiB9LFxuICAgICAgeyBzdGF0dXM6IDUwMCB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgeyBQT1NUIH07XG4iXSwibmFtZXMiOlsiTmV4dFJlc3BvbnNlIiwiY3JlYXRlSGFzaCIsInJlYWRXb3Jrc3BhY2VDb25maWciLCJyZWFkV29ya3NwYWNlU291cmNlUmVjb3JkcyIsIndyaXRlV29ya3NwYWNlQ29uZmlnIiwic2FuZGJveFJ1blNvdXJjZUlkIiwicGFyc2VPcmNoZXN0cmF0aW9uR3JhcGgiLCJ2YWxpZGF0ZU9yY2hlc3RyYXRpb25HcmFwaCIsInN0YWJsZVN0cmluZ2lmeSIsInJlYWRUcmlnZ2VyU2NoZWR1bGVCaW5kaW5nIiwiZ2V0Tm9kZURlbHRhUmVjb3JkcyIsIm5vcm1hbGl6ZURlbHRhVGFncyIsInBhdGNoU2FuZGJveFJvd0luQ29uZmlnIiwicmVzb2x2ZVdvcmtmbG93RmllbGROYW1lcyIsImFwcGVuZE91dGNvbWVSZWNlaXB0IiwicmVxdWlyZUFwcFNjb3BlIiwiY2hlY2tTY29wZWRXb3JrZmxvd0FjY2VzcyIsInNoYTI1NiIsInRleHQiLCJ1cGRhdGUiLCJTdHJpbmciLCJkaWdlc3QiLCJmaW5kU2FuZGJveFJvdyIsIndvcmtzcGFjZUNvbmZpZyIsIm9iamVjdElkIiwibmFtZSIsIm9iamVjdHMiLCJBcnJheSIsImlzQXJyYXkiLCJkYXRhTW9kZWwiLCJvYmplY3QiLCJmaW5kIiwiZW50cnkiLCJpZCIsIm9iamVjdFR5cGUiLCJyb3ciLCJyb3dJbmRleCIsIndhbnRlZE5hbWUiLCJ0cmltIiwicm93cyIsImZpbmRJbmRleCIsIk5hbWUiLCJyb3dIYXNTdWNjZXNzZnVsU2VydmVybGVzc1NjaGVkdWxlclByb29mIiwiZHJhZnQiLCJydW5Mb2NhbGl0eSIsInRvTG93ZXJDYXNlIiwic2NoZWR1bGVyUmVnaXN0cnlJZCIsInNjaGVkdWxlSWQiLCJzdGF0dXMiLCJOdW1iZXIiLCJsYXN0U2NoZWR1bGVkUnVuU3RhdHVzIiwiZHJhZnRHcmFwaCIsInRlc3RlZENvbmZpZyIsIm9yY2hlc3RyYXRpb25EcmFmdFRlc3RlZENvbmZpZyIsImxpdmVHcmFwaCIsIm9yY2hlc3RyYXRpb25HcmFwaCIsIm9yY2hlc3RyYXRpb25Db25maWciLCJiaW5kaW5nIiwiQm9vbGVhbiIsImlzRmluaXRlIiwiZW5hYmxlZCIsInB1Ymxpc2hCbG9ja2VkIiwiaHR0cFN0YXR1cyIsImJvZHkiLCJyZWZzIiwia2luZCIsImxhbmUiLCJvdXRjb21lU3RhdHVzIiwib2JqZWN0UmVmcyIsInN1bW1hcnkiLCJjb2RlIiwiZXJyb3IiLCJuZXh0QWN0aW9ucyIsImpzb24iLCJQT1NUIiwicmVxdWVzdCIsIm9rIiwicmVxdWVzdGVkRmllbGQiLCJmaWVsZCIsInNjb3BlIiwic2NvcGVkIiwidmlvbGF0aW9uIiwiY29udGV4dCIsImFwcElkIiwiYXBwU2NvcGUiLCJ2aW9sYXRpb25UeXBlIiwicmVwYWlyUGxhbiIsImxpdmVGaWVsZCIsImRyYWZ0RmllbGQiLCJ1bmRlZmluZWQiLCJyb3dOYW1lIiwiZHJhZnRQYXNzZWQiLCJvcmNoZXN0cmF0aW9uRHJhZnRUZXN0UGFzc2VkIiwic2VydmVybGVzc1NjaGVkdWxlclByb29mUGFzc2VkIiwiZHJhZnRTdHJpbmdTaGEyNTYiLCJ0ZXN0ZWRTdHJpbmdTaGEyNTYiLCJkcmFmdFJ1bklkIiwib3JjaGVzdHJhdGlvbkRyYWZ0TGFzdFJ1bklkIiwic291cmNlSWQiLCJoaXN0b3J5IiwicmVjb3JkcyIsInJ1blJlY29yZCIsInJlY29yZCIsInJ1bklkIiwiZXhpdENvZGUiLCJkcmFmdEdyYXBoUGFyc2VkIiwiZXhwZWN0ZWRTaGEyNTYiLCJ1c2VEcmFmdCIsImRyYWZ0U2hhMjU2IiwicGFyc2VkRHJhZnQiLCJ2YWxpZGF0aW9uIiwiZGV0YWlscyIsImVycm9ycyIsInB1Ymxpc2hlZEF0IiwiRGF0ZSIsInRvSVNPU3RyaW5nIiwiY3VycmVudFZlcnNpb24iLCJ2ZXJzaW9uIiwibmV4dFZlcnNpb24iLCJwcmV2aW91c0RlbHRhcyIsIm9yY2hlc3RyYXRpb25EZWx0YXMiLCJwcmV2aW91c1B1Ymxpc2hlZEdyYXBoIiwibm9kZURlbHRhcyIsImRlbHRhVGFncyIsImZsYXRNYXAiLCJkZWx0YSIsImNoYW5nZVJlYXNvbiIsIm1hcCIsImZpbHRlciIsImpvaW4iLCJwdWJsaXNoZWRTaGEyNTYiLCJuZXh0IiwibGlmZWN5Y2xlU3RhdHVzIiwib3JjaGVzdHJhdGlvbkRyYWZ0U3RhdHVzIiwib3JjaGVzdHJhdGlvblB1Ymxpc2hlZEF0IiwiYXQiLCJhY3Rpb24iLCJwcmV2aW91c1ZlcnNpb24iLCJkcmFmdFRlc3RlZEF0Iiwib3JjaGVzdHJhdGlvbkRyYWZ0TGFzdFRlc3RlZCIsIm5vZGVDb3VudCIsIm5vZGVzIiwibGVuZ3RoIiwiZWRnZUNvdW50IiwiZWRnZXMiLCJwZXJzaXN0ZWQiLCJyZWNlaXB0IiwiY2hhbmdlZEZpZWxkcyIsInJvbGxiYWNrUmVmIiwiZGVsdGFJbmRleCIsInJlY2VpcHRJZCIsImd1aWRhbmNlIiwibWVzc2FnZSJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9
//# sourceURL=webpack-internal:///(rsc)/./app/api/workspace/workflow/publish/route.js

