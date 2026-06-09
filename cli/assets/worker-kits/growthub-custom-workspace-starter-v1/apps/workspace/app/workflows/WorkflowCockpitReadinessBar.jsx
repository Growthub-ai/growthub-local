"use client";

import Link from "next/link";
import { deriveCreationActivationChecks } from "@/lib/workspace-creation-readiness";

export function WorkflowCockpitReadinessBar({ workspaceConfig, workspaceSourceRecords, sandboxRow }) {
  const activation = deriveCreationActivationChecks({
    workspaceConfig,
    workspaceSourceRecords,
  });

  const relevant = ["auth-ref-resolves", "api-test-passed", "data-source-linked", "scheduler-configured", "last-run-succeeded", "workflow-published"];
  const checks = activation.checks.filter((c) => relevant.includes(c.id));

  return (
    <div className="dm-workflow-readiness-bar" aria-label="Workflow readiness">
      {checks.map((check) => (
        <Link
          key={check.id}
          href={check.href}
          className={`dm-workflow-readiness-chip is-${check.status}`}
          title={check.missing || check.label}
        >
          {check.label}
        </Link>
      ))}
      {sandboxRow?.Name ? <span className="dm-workflow-readiness-name">{sandboxRow.Name}</span> : null}
    </div>
  );
}
