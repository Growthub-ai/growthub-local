#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-canonical-evaluation.js");
let source = fs.readFileSync(file, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[evaluation-runtime-binding] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[evaluation-runtime-binding] ambiguous anchor: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

if (!source.includes("export function verifyCanonicalEvaluationRuntimeBinding")) {
  replaceOnce(
    `/**
 * Execute the canonical evaluator. \`executeWorkflow\` is injectable only for
 * deterministic certification; production defaults to the shipped workflow.
 */`,
    `/**
 * Prove that the tuned inference call actually executed the candidate artifact.
 * A matching model tag is insufficient: only a runtime verification receipt
 * whose independently resolved base/adapter SHA equals the imported artifact
 * may contribute a benchmark verdict. Generic OpenAI-compatible endpoints
 * therefore remain pending until they are rebound through a proof-gated
 * runtime such as the supervised llama.cpp pool.
 */
export function verifyCanonicalEvaluationRuntimeBinding({ execution = null, artifactSha256 = "" } = {}) {
  const expected = str(artifactSha256).toLowerCase();
  const tuned = (Array.isArray(execution?.invocations) ? execution.invocations : [])
    .filter((invocation) => str(invocation?.route) === "local-student");
  if (tuned.length !== 1) {
    return { ok: false, reason: \`canonical evaluation requires exactly one tuned invocation; observed \${tuned.length}\` };
  }
  const receipt = tuned[0]?.verificationReceipt;
  const identity = receipt?.identity;
  if (receipt?.status !== "verified" || identity?.status !== "verified") {
    return { ok: false, reason: "tuned endpoint did not independently verify its artifact identity" };
  }
  if (str(receipt?.cache?.cache_status) === "HIT") {
    return { ok: false, reason: "canonical evaluation cannot rely on a cached tuned response" };
  }
  const baseSha = str(identity?.base_model_sha256).toLowerCase();
  const adapterSha = str(identity?.adapter_sha256).toLowerCase();
  const identityKind = expected && expected === adapterSha ? "adapter" : expected && expected === baseSha ? "base-model" : "";
  if (!identityKind) {
    return {
      ok: false,
      reason: \`runtime identity does not match candidate artifact \${expected || "(missing)"}\`,
    };
  }
  return {
    ok: true,
    binding: {
      status: "verified",
      artifactSha256: expected,
      identityKind,
      receiptId: str(receipt?.receipt_id),
      receiptSha256: str(tuned[0]?.receiptSha256),
      runtimeInstanceId: str(receipt?.routing?.phases?.find((phase) => phase?.pool_ref?.instance_id)?.pool_ref?.instance_id),
    },
  };
}

/**
 * Execute the canonical evaluator. \`executeWorkflow\` is injectable only for
 * deterministic certification; production defaults to the shipped workflow.
 */`,
    "runtime binding helper",
  );
}

if (!source.includes('cache_policy: { mode: "bypass" }')) {
  replaceOnce(
    `      inputPayload: { prompt: task.prompt },`,
    `      // Each score must execute the currently bound candidate runtime. A
      // completion-cache replay cannot prove that the imported bytes served it.
      inputPayload: { prompt: task.prompt, inference: { cache_policy: { mode: "bypass" } } },`,
    "canonical cache bypass",
  );
}

if (!source.includes("evaluation-runtime-unbound")) {
  replaceOnce(
    `    const verdict = execution.evaluation.verdict;
    const pair = qualityPair(verdict);`,
    `    const runtimeBinding = verifyCanonicalEvaluationRuntimeBinding({ execution, artifactSha256: verifiedSha256 });
    if (!runtimeBinding.ok) {
      return {
        ok: false,
        pending: true,
        reasonCode: "evaluation-runtime-unbound",
        reason: \`holdout task \${task.taskId} cannot grade an unbound candidate runtime: \${runtimeBinding.reason}\`,
        taskSet: taskSet.manifest,
        measuredCount: measured.length,
      };
    }
    const verdict = execution.evaluation.verdict;
    const pair = qualityPair(verdict);`,
    "runtime binding gate",
  );
  replaceOnce(
    `      ...compactExecutionEvidence(execution),`,
    `      ...compactExecutionEvidence(execution),
      runtimeBinding: runtimeBinding.binding,`,
    "compact runtime binding evidence",
  );
  replaceOnce(
    `    benchmarkWins: buildBenchmarkReceiptFields(winRecord),
    reason: winRecord.reason,`,
    `    benchmarkWins: buildBenchmarkReceiptFields(winRecord),
    runtimeBindingHash: hashComputeValue(compactEvidence.map((entry) => entry.runtimeBinding)),
    reason: winRecord.reason,`,
    "runtime binding hash",
  );
}

fs.writeFileSync(file, source);
console.log("[evaluation-runtime-binding] canonical promotion now requires live runtime proof of the exact artifact SHA");
