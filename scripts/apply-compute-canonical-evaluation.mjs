#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[canonical-eval] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[canonical-eval] ambiguous anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceOrSkip(source, before, after, alreadyMarker, label) {
  if (source.includes(before)) return replaceOnce(source, before, after, label);
  if (alreadyMarker && source.includes(alreadyMarker)) return source;
  throw new Error(`[canonical-eval] neither old nor wired form found: ${label}`);
}

const routePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js";
let route = read(routePath);
route = replaceOrSkip(
  route,
  `import {
  createGovernedComputeFetchJson,
  verifyGovernedComputeArtifact
} from "@/lib/compute-network-policy";`,
  `import {
  createGovernedComputeFetchJson,
  verifyGovernedComputeArtifact
} from "@/lib/compute-network-policy";
import { runCanonicalComputeEvaluation } from "@/lib/compute-canonical-evaluation";`,
  `from "@/lib/compute-canonical-evaluation"`,
  "canonical evaluator route import",
);
route = replaceOrSkip(
  route,
  `          verifyArtifact: (artifact, workSpec) => verifyGovernedComputeArtifact({ artifact, workSpec }),
          // Bound remote observation to the row's own timeout budget.`,
  `          verifyArtifact: (artifact, workSpec) => verifyGovernedComputeArtifact({ artifact, workSpec }),
          // Only the existing workspace-owned eval-vs-base workflow may mint
          // benchmarkWins. It receives a fresh config snapshot, the verified
          // artifact/work-spec identity, and this sandbox's governed network
          // and secret-reference context.
          evaluateArtifact: async ({ artifact, workSpec, trainingRunId }) => runCanonicalComputeEvaluation({
            workspaceConfig: await readWorkspaceConfig(),
            artifact,
            workSpec,
            trainingRunId,
            fetchImpl: fetch,
            networkPolicy: { networkAllow, allowList },
            resolvedEnv: resolvedSecretsByRef,
            allowedEnvRefs: envRefSlugs,
            signal,
            timeoutMs: Math.min(timeoutMs, 120000),
          }),
          // Bound remote observation to the row's own timeout budget.`,
  `evaluateArtifact: async ({ artifact, workSpec, trainingRunId }) => runCanonicalComputeEvaluation`,
  "canonical evaluator route IO",
);
write(routePath, route);

const inferencePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/custom-model-inference.js";
let inference = read(inferencePath);
inference = replaceOrSkip(
  inference,
  `      ancestorReceiptIds: Array.isArray(options.ancestorReceiptIds) ? options.ancestorReceiptIds : ancestorReceiptIds,
    });`,
  `      ancestorReceiptIds: Array.isArray(options.ancestorReceiptIds) ? options.ancestorReceiptIds : ancestorReceiptIds,
      // The canonical evaluator itself is the tuned-endpoint verification
      // probe. Only its explicitly marked tuned step may bypass a prior
      // lastResponse verification stamp; base/teacher calls remain unchanged.
      verificationProbe: options.verificationProbe === true,
    });`,
  `verificationProbe: options.verificationProbe === true`,
  "workflow call verification probe option",
);
inference = replaceOrSkip(
  inference,
  `    const tuned = await call({ messages: [{ role: "user", content: prompt }] }, { allowedTargets: ["local-student"] });`,
  `    const tuned = await call({ messages: [{ role: "user", content: prompt }] }, { allowedTargets: ["local-student"], verificationProbe: true });`,
  `allowedTargets: ["local-student"], verificationProbe: true`,
  "eval tuned verification probe",
);
write(inferencePath, inference);

const executionPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js";
let execution = read(executionPath);
execution = replaceOrSkip(
  execution,
  `  const honesty = deriveComputeArtifactHonesty({ lifecycle, artifact });
  const evaluation = null;

  events.push(workspaceEvent(io, "compute-release-requested", runRef, "governed release of provider capacity"));`,
  `  const honesty = deriveComputeArtifactHonesty({ lifecycle, artifact });
  let evaluation = null;
  let evaluationPendingReason = "";
  if (honesty.promotable && typeof io.evaluateArtifact === "function") {
    const evaluated = await safeCall(() => io.evaluateArtifact({ artifact, workSpec, intent, trainingRunId }));
    if (!evaluated?.__error && evaluated?.ok === true && evaluated?.evaluation?.source === "workspace-canonical") {
      evaluation = evaluated.evaluation;
    } else {
      evaluationPendingReason = str(evaluated?.reason || evaluated?.__error || "canonical evaluator returned no authoritative result");
    }
  } else if (honesty.promotable) {
    evaluationPendingReason = "workspace canonical evaluator is unavailable";
  }

  events.push(workspaceEvent(io, "compute-release-requested", runRef, "governed release of provider capacity"));`,
  `evaluationPendingReason`,
  "canonical evaluator invocation",
);
execution = replaceOrSkip(
  execution,
  `    canonicalEvaluationPending: lifecycle.terminal === "completed" && honesty.promotable,
    releaseConfirmed: lifecycle.releaseConfirmed,`,
  `    canonicalEvaluationPending: lifecycle.terminal === "completed" && honesty.promotable && !evaluation,
    canonicalEvaluationPromoted: evaluation?.benchmarkWins?.promoted === true,
    evaluationPendingReason,
    releaseConfirmed: lifecycle.releaseConfirmed,`,
  `canonicalEvaluationPromoted`,
  "canonical evaluation summary",
);
write(executionPath, execution);

const certificationPath = "scripts/run-compute-certification.mjs";
let certification = read(certificationPath);
if (!certification.includes("scripts/unit-compute-canonical-evaluation.test.mjs")) {
  certification = replaceOnce(
    certification,
    `  "scripts/unit-compute-customer-state.test.mjs",
`,
    `  "scripts/unit-compute-customer-state.test.mjs",
  "scripts/unit-compute-canonical-evaluation.test.mjs",
`,
    "canonical evaluation certification suite",
  );
}
write(certificationPath, certification);

console.log("[canonical-eval] existing eval-vs-base workflow wired to verified compute artifacts");
