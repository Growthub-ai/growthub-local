"use client";

/**
 * Distillation flywheel — the /training evidence strip for the teacher →
 * student loop. NOT a parallel system: every visible claim derives from the
 * SAME governed rows and derivers the 16-state journey and the
 * /custom-models cockpit prove — deriveCustomModelsState for the model's
 * evidence ladder, deriveProxyServingState (deriveEndpointVerification over
 * the api-registry row's stamped chat-completions response) for what serves
 * right now, deriveFlywheelState for the receipt-backed loop, and
 * buildAdaptiveStudentPlan over the stamped preflight for the machine plan.
 * Reuses the ledger's exact visual language (dm-swarm-card rows, tree dots)
 * — no new tokens, no decorative motion, no progress a receipt didn't prove.
 */

import { useEffect, useMemo, useState } from "react";
import { deriveFlywheelState, deriveProxyServingState } from "../../../lib/distillation-fleet.js";
import { buildAdaptiveStudentPlan } from "../../../lib/distillation-student-plan.js";
import { deriveTrainingRunState } from "../../../lib/training-run-receipts.js";
import { deriveCustomModelsState } from "../../../lib/custom-models-ledger.js";

function dotVariant(done, isNext) {
  if (done) return "ok";
  if (isNext) return "active";
  return "pending";
}

const ROUTE_LABELS = {
  "local-student": "your trained student (local)",
  "local-base": "the local base model",
  teacher: "the teacher model (remote)",
};

export default function DistillationFlywheel({ workspaceConfig: providedConfig = null, workspaceSourceRecords: providedRecords = null, slug = "workspace-local" }) {
  const [workspaceConfig, setWorkspaceConfig] = useState(providedConfig);
  const [workspaceSourceRecords, setWorkspaceSourceRecords] = useState(providedRecords);

  useEffect(() => {
    if (providedConfig && providedRecords) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace");
        const data = await res.json();
        if (cancelled) return;
        if (data?.workspaceConfig) setWorkspaceConfig(data.workspaceConfig);
        if (data?.workspaceSourceRecords) setWorkspaceSourceRecords(data.workspaceSourceRecords);
      } catch {
        /* the strip renders nothing without evidence — never a fake state */
      }
    })();
    return () => { cancelled = true; };
  }, [providedConfig, providedRecords]);

  const flywheel = useMemo(
    () => deriveFlywheelState({ workspaceConfig, workspaceSourceRecords, slug }),
    [workspaceConfig, workspaceSourceRecords, slug],
  );
  // The cockpit's OWN ladder — the flywheel strip reports it verbatim so the
  // two surfaces can never disagree about the model's state.
  const cockpit = useMemo(
    () => deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords }),
    [workspaceConfig, workspaceSourceRecords],
  );
  const model = cockpit.models.find((m) => m.id === slug) || cockpit.models[0] || null;
  // What serves right now — state-12 verification semantics over the real
  // registry row (base-model responses demote and fall back, honestly).
  const serving = useMemo(
    () => deriveProxyServingState({ workspaceConfig, baseModel: model?.baseModel || "" }),
    [workspaceConfig, model?.baseModel],
  );
  const runState = useMemo(
    () => deriveTrainingRunState({ workspaceConfig, workspaceSourceRecords, slug }),
    [workspaceConfig, workspaceSourceRecords, slug],
  );
  // Machine plan from the LAST stamped preflight receipt — unmeasured renders
  // the honest pending copy, never invented numbers.
  const plan = useMemo(() => buildAdaptiveStudentPlan({ preflight: runState?.preflight || null }), [runState?.preflight]);

  // Render only when the flywheel has begun (a proxy policy exists or
  // evidence accrued) — an empty workspace keeps the proven first-run
  // 16-state surface above untouched.
  if (!flywheel.hasProxy && flywheel.completed === 0) return null;

  return (
    <div className="dm-helper-toolcall dm-swarm-card" data-distillation-flywheel="" data-flywheel-completed={flywheel.completed} style={{ marginTop: 16 }}>
      <div className="dm-helper-toolcall-row">
        <span className="dm-run-console__tree-dot" data-variant={flywheel.completed === flywheel.total ? "ok" : "active"} aria-hidden="true" />
        <span className="dm-helper-toolcall-title">Model flywheel</span>
        <span className="dm-run-console__hint">
          {flywheel.completed} of {flywheel.total}
          {model ? ` · ${model.evidenceState}` : ""}
          {flywheel.generation >= 2 ? ` · generation ${flywheel.generation}` : ""}
        </span>
      </div>

      {serving.active ? (
        <div className="dm-helper-stream dm-swarm-card-desc" data-flywheel-route={serving.active.target}>
          Serving via {ROUTE_LABELS[serving.active.target] || serving.active.target}
          {serving.active.target === "local-student"
            ? ` — verified: response served ${serving.verification.servedModel}.`
            : " — every reply is harvested as training evidence for your model."}
        </div>
      ) : flywheel.hasProxy ? (
        <div className="dm-helper-stream dm-swarm-card-desc" data-flywheel-route="none">{serving.reason}</div>
      ) : null}

      {plan.mode === "harvest-only" ? (
        <div className="dm-helper-stream dm-swarm-card-desc" data-flywheel-plan="harvest-only">
          {runState?.preflight ? `This machine (${plan.tierLabel.toLowerCase()}) trains later — ` : "Machine not measured yet — "}
          harvesting continues meanwhile, so the corpus is ready the moment training fits.
        </div>
      ) : (
        <div className="dm-helper-stream dm-swarm-card-desc" data-flywheel-plan="train-local">
          Training plan sized to this machine: {plan.baseModel} · {plan.tierLabel.toLowerCase()}
          {plan.adjustments.length ? ` · ${plan.adjustments[0]}` : ""}
        </div>
      )}

      <div className="dm-run-console__tree" aria-label="Distillation flywheel steps">
        {flywheel.steps.map((step) => (
          <div key={step.id} className="dm-helper-toolcall-row" data-flywheel-step={step.id} data-flywheel-step-done={step.done ? "true" : "false"}>
            <span className="dm-run-console__tree-dot" data-variant={dotVariant(step.done, step.id === flywheel.nextStepId)} aria-hidden="true" />
            <span className="dm-helper-toolcall-title" style={{ fontWeight: step.id === flywheel.nextStepId ? 600 : 400 }}>{step.label}</span>
            {step.id === "traces-harvested" && flywheel.traceCount > 0 ? (
              <span className="dm-run-console__hint">{flywheel.traceCount} traces</span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="dm-helper-stream dm-swarm-card-desc" data-flywheel-next="">{flywheel.next}</div>
    </div>
  );
}
