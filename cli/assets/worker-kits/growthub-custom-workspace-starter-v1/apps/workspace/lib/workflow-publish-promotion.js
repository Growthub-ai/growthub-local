/**
 * Draft → live promotion decision + assembly for workflow publish.
 *
 * This is the single pure seam the publish route
 * (app/api/workspace/workflow/publish/route.js) consults between "the row
 * and its verified draft run were loaded" and "the promoted config is
 * persisted". It performs NO I/O and produces the mutated workspace config
 * ONLY on `ok: true` — on any rejection there is no `next` config, so a
 * blocked publish structurally cannot mutate the workflow row. The
 * certification suite drives this exact function, so the enforcement the
 * HTTP route activates is executable test surface.
 *
 * Gates enforced here (all fail closed):
 * - graph identity: the run record must be a draft run of EXACTLY this
 *   saved draft (`draftSha256` lineage), unless the serverless binding proof
 *   lane vouched for the promoted bytes;
 * - structural validity of the draft graph;
 * - the inference manifest SET contract: every control-plane integration the
 *   promoted graph references must have produced exactly one valid SIGNED
 *   manifest during the verified draft run, still matching the live registry
 *   identity — missing, unsigned, unavailable, duplicate-conflicting, and
 *   unexpected manifests all block.
 */

import { createHash } from "node:crypto";
import { parseOrchestrationGraph, validateOrchestrationGraph } from "./orchestration-graph.js";
import { stableStringify } from "./workspace-patch-policy.js";
import { syncTriggerNodeForSchedule } from "./workspace-add-ons.js";
import { getNodeDeltaRecords, normalizeDeltaTags, patchSandboxRowInConfig } from "./orchestration-publish.js";
import { expectedManifestIntegrations, verifyWorkflowManifestsAtPublish } from "./adapters/inference/manifest.js";

export function evaluateDraftPromotion({
  workspaceConfig,
  objectId,
  rowIndex,
  row,
  draft,
  liveField,
  draftField,
  runRecord = null,
  serverlessSchedulerProofPassed = false,
  env = process.env,
  now = () => new Date(),
} = {}) {
  const draftRunId = String(row?.orchestrationDraftLastRunId ?? "").trim();
  // The record's draftSha256 is stamped by sandbox-run from the exact graph
  // it executed, before execution. It must match this saved draft.
  const draftGraphParsed = parseOrchestrationGraph(draft);
  const expectedSha256 = createHash("sha256").update(stableStringify(draftGraphParsed), "utf8").digest("hex");
  if (!serverlessSchedulerProofPassed && (runRecord?.useDraft !== true || runRecord?.draftSha256 !== expectedSha256)) {
    return {
      ok: false,
      httpStatus: 409,
      code: "draft_run_not_verified",
      error: `publish blocked — draft run ${draftRunId} executed a different graph than the saved draft `
        + "(or was not a draft run); re-test this exact draft with sandbox-run useDraft:true",
    };
  }
  const parsedDraft = draftGraphParsed;
  const validation = validateOrchestrationGraph(parsedDraft);
  if (!validation?.ok) {
    return {
      ok: false,
      httpStatus: 400,
      code: "invalid_graph",
      error: "publish blocked — the draft does not parse as a valid orchestration graph",
      details: validation?.errors ?? [],
    };
  }
  // Inference manifest handshake: the verified draft run persisted the
  // signed manifests its custom-model calls actually enforced. Publish
  // recompiles each referenced live API Registry identity and blocks with
  // a field-level diff when the live composite SHA no longer matches the
  // proven manifest — a workflow cannot go live bound to different bytes
  // than it was tested against. The expected set comes from the DRAFT GRAPH
  // being promoted, not from whichever invocations happen to carry a
  // manifest.
  const testedInvocations = runRecord?.adapterMeta?.customModel?.invocations
    || (runRecord?.adapterMeta?.customModel?.invocation ? [runRecord.adapterMeta.customModel.invocation] : []);
  const manifestVerification = verifyWorkflowManifestsAtPublish({
    workspaceConfig,
    invocations: testedInvocations,
    expectedIntegrationIds: expectedManifestIntegrations({ workspaceConfig, graph: parsedDraft }),
    env,
  });
  if (!manifestVerification.ok) {
    return {
      ok: false,
      httpStatus: 409,
      code: "inference_manifest_mismatch",
      error: "publish blocked — the live API Registry model identity no longer matches the inference manifest proven by the tested draft run; re-test the draft against the current registry state or repair the registry row",
      manifestMismatches: manifestVerification.mismatches,
    };
  }
  const publishedAt = new Date(now()).toISOString();
  const currentVersion = Number(row.version || 1);
  const nextVersion = Number.isFinite(currentVersion) ? String(currentVersion + 1) : "1";
  const previousDeltas = Array.isArray(row.orchestrationDeltas) ? row.orchestrationDeltas : [];
  const previousPublishedGraph = parseOrchestrationGraph(row[liveField]);
  const nodeDeltas = getNodeDeltaRecords(previousPublishedGraph, parsedDraft);
  const deltaTags = normalizeDeltaTags(nodeDeltas.flatMap((delta) => delta.deltaTags));
  const changeReason = nodeDeltas.map((delta) => delta.changeReason).filter(Boolean).join("\n");
  // One canonical draft/graph hash everywhere: sha256(stableStringify(parsedGraph)).
  // This is the same value sandbox-run stamped as the record's draftSha256,
  // so the lineage record and the publish delta are directly comparable.
  const publishedSha256 = expectedSha256;
  // A serverless-bound row's trigger binding is ROW authority — promoting
  // draft bytes must not sever it. Re-sync the trigger node into the
  // promoted live graph from the row's own binding fields (the exact writer
  // the bind uses); drafts themselves are never mutated by binds.
  const promotedLive = String(row.runLocality || "").trim() === "serverless" && String(row.scheduleId || "").trim()
    ? syncTriggerNodeForSchedule(draft, {
        triggerKind: row.schedulerTriggerKind,
        schedulerRegistryId: row.schedulerRegistryId,
        scheduleId: row.scheduleId,
        cron: row.schedulerCron,
        schedulerProviderId: row.schedulerProviderId,
        schedulerProductId: row.schedulerProductId,
        destinationUrl: row.schedulerDestination,
        callbackUrl: row.schedulerCallbackUrl,
        triggerInput: row.schedulerTriggerInput,
      }).value
    : draft;
  const next = patchSandboxRowInConfig(workspaceConfig, objectId, rowIndex, {
    [liveField]: promotedLive,
    [draftField]: "",
    // Rollback safety: manifests from earlier versions stay recorded in
    // orchestrationDeltas; this field always carries the manifests bound
    // to the CURRENT live version for runtime enforcement.
    ...(manifestVerification.manifests.length ? {
      inferenceManifests: manifestVerification.manifests,
    } : {}),
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
        edgeCount: Array.isArray(parsedDraft?.edges) ? parsedDraft.edges.length : 0,
        ...(manifestVerification.manifests.length ? {
          inferenceManifests: manifestVerification.manifests,
          inferenceManifestShas: manifestVerification.manifests.map((entry) => entry.manifest_sha256),
        } : {}),
      },
    ],
  });
  return {
    ok: true,
    next,
    parsedDraft,
    publishedAt,
    nextVersion,
    publishedSha256,
    previousDeltas,
    nodeDeltas,
    manifests: manifestVerification.manifests,
  };
}
