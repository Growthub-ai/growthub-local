"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";

/**
 * Home / readiness surface — runtime capability, env resolution, registry health,
 * activation blockers, and next best action.
 */
export function WorkspaceReadinessPanel() {
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/readiness", { cache: "no-store" });
      setReadiness(await res.json());
    } catch {
      setReadiness(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading && !readiness) {
    return <article className="workspace-readiness-section"><p>Loading readiness…</p></article>;
  }
  if (!readiness) return null;

  const { persistence, env, apiRegistry, dataSource, sandbox, scheduler, activation, scenario, nextAction } = readiness;

  return (
    <div className="workspace-readiness workspace-readiness-home">
      <article className="workspace-readiness-section">
        <h3>Runtime readiness</h3>
        <div className="workspace-readiness-row">
          <span>Scenario</span>
          <strong>{scenario}</strong>
        </div>
        <div className="workspace-readiness-row">
          <span>Persistence</span>
          <span className={`workspace-readiness-badge mode-${persistence?.mode || "unknown"}`}>{persistence?.mode}</span>
        </div>
        <div className="workspace-readiness-row">
          <span>Can save config</span>
          <span className={`workspace-readiness-badge ${persistence?.canSave ? "good" : "warn"}`}>{persistence?.canSave ? "yes" : "no"}</span>
        </div>
        <div className="workspace-readiness-row">
          <span>Env keys</span>
          <strong>{env?.summary?.configured ?? 0}/{env?.summary?.total ?? 0} configured</strong>
        </div>
        {nextAction && (
          <Link href={nextAction.href} className="workspace-readiness-action">
            {nextAction.label} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
        <button type="button" className="workspace-link-button" onClick={load} disabled={loading}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
      </article>

      <article className="workspace-readiness-section">
        <h3>Integration health</h3>
        <div className="workspace-readiness-row"><span>API Registry</span><strong>{apiRegistry?.testedCount ?? 0}/{apiRegistry?.rowCount ?? 0} tested</strong></div>
        <div className="workspace-readiness-row"><span>Data Sources</span><strong>{dataSource?.withSourceRecords ?? 0}/{dataSource?.rowCount ?? 0} with records</strong></div>
        <div className="workspace-readiness-row"><span>Sandbox</span><strong>{sandbox?.runnableCount ?? 0}/{sandbox?.rowCount ?? 0} runnable</strong></div>
        <div className="workspace-readiness-row"><span>Scheduler</span><strong>{scheduler?.configured ?? 0}/{scheduler?.serverlessRows ?? 0} serverless ready</strong></div>
      </article>

      <article className="workspace-readiness-section">
        <h3>Activation</h3>
        <div className="workspace-readiness-row">
          <span>Progress</span>
          <strong>{activation?.completedCount ?? 0}/{activation?.totalCount ?? 0}</strong>
        </div>
        <div className="workspace-readiness-row">
          <span>Ready</span>
          <span className={`workspace-readiness-badge ${activation?.complete ? "good" : "warn"}`}>{activation?.complete ? "yes" : "no"}</span>
        </div>
        {(activation?.blockers || []).slice(0, 4).map((step) => (
          <div className="workspace-readiness-row warn" key={step.id}>
            <span>{step.label}</span>
            <Link href={step.href || "/workspace-lens"}>{step.cta || "Fix"}</Link>
          </div>
        ))}
      </article>
    </div>
  );
}
