#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executionPath = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js");
let source = fs.readFileSync(executionPath, "utf8");

const start = source.indexOf("  const honesty = deriveComputeArtifactHonesty({ lifecycle, artifact });");
const end = source.indexOf("\n  const ok = lifecycle.terminal === \"completed\"", start);
if (start < 0 || end < 0) throw new Error("[evaluation-order] canonical artifact/release section not found");

const replacement = `  const honesty = deriveComputeArtifactHonesty({ lifecycle, artifact });
  let evaluation = prior?.evaluation?.source === "workspace-canonical" ? prior.evaluation : null;
  let evaluationPendingReason = "";

  // Paid training capacity is released before any workspace benchmark work.
  // Evaluation can take many model calls and must never extend provider billing.
  events.push(workspaceEvent(io, "compute-release-requested", runRef, "governed release of provider capacity"));
  await persist({ allocation, artifact, evaluation, dataset: dataEvidence });
  const released = await safeCall(() => adapter.release(ctx()));
  if (released?.__error) {
    events.push(workspaceEvent(io, "compute-release-failed", runRef, \`release failed: \${released.__error} — capacity may still exist and cost may accrue\`));
  } else {
    for (const event of Array.isArray(released) ? released : []) events.push(event);
  }
  let computeBlock = await persist({ allocation, artifact, evaluation, dataset: dataEvidence });
  lifecycle = deriveComputeLifecycle({
    events: computeBlock?.events,
    allocation: computeBlock?.allocation,
    checkpoints: computeBlock?.checkpoints,
  });

  if (honesty.promotable && !evaluation) {
    if (!lifecycle.releaseConfirmed) {
      evaluationPendingReason = "canonical evaluation waits until provider capacity release is confirmed";
    } else if (typeof io.evaluateArtifact === "function") {
      const evaluated = await safeCall(() => io.evaluateArtifact({ artifact, workSpec, intent, trainingRunId }));
      if (!evaluated?.__error && evaluated?.ok === true && evaluated?.evaluation?.source === "workspace-canonical") {
        evaluation = evaluated.evaluation;
      } else {
        evaluationPendingReason = str(evaluated?.reason || evaluated?.__error || "canonical evaluator returned no authoritative result");
      }
    } else {
      evaluationPendingReason = "workspace canonical evaluator is unavailable";
    }
    computeBlock = await persistMerged(io, computeBlock, {
      ...computeBlock,
      evaluation,
      evidenceObservedAt: nowIso(io),
    });
  }
`;

source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
fs.writeFileSync(executionPath, source);
console.log("[evaluation-order] provider capacity release now precedes canonical evaluation");
