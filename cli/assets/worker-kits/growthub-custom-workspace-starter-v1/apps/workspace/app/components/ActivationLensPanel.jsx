"use client";

import Link from "next/link";
import { Check, AlertCircle, CircleDot } from "lucide-react";
import { deriveCreationActivationChecks } from "@/lib/workspace-creation-readiness";

function StatusIcon({ status }) {
  if (status === "ready") return <Check size={14} />;
  if (status === "blocked") return <AlertCircle size={14} />;
  return <CircleDot size={14} />;
}

export function ActivationLensPanel({ workspaceConfig, workspaceSourceRecords, persistence }) {
  const state = deriveCreationActivationChecks({
    workspaceConfig,
    workspaceSourceRecords,
    persistence,
    canWriteEnv: persistence?.canSave === true,
  });

  return (
    <section className="workspace-activation-lens" aria-label="Activation lens">
      <header>
        <p className="workspace-activation-eyebrow">Activation lens</p>
        <h2>{state.summary.activationReady ? "Ready to activate" : "Activation in progress"}</h2>
        <p>{state.summary.ready} of {state.summary.total} checks pass</p>
      </header>
      <ul className="workspace-activation-lens-checks">
        {state.checks.map((check) => (
          <li key={check.id} className={`is-${check.status}`} data-surface={check.surface}>
            <StatusIcon status={check.status} />
            <div className="workspace-activation-lens-check-body">
              <strong>{check.label}</strong>
              <span className="workspace-activation-lens-source">{check.sourceOfTruth}</span>
              <span className="workspace-activation-lens-kind">{check.stateKind}</span>
              {check.missing ? <em>{check.missing}</em> : null}
              {check.nextAction && check.status !== "ready" ? (
                <Link href={check.href}>{check.nextAction}</Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
