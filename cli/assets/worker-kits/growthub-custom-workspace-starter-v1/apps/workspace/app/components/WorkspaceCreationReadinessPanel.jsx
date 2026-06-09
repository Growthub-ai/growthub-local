"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";

export function WorkspaceCreationReadinessPanel({ workspaceConfig, workspaceSourceRecords, persistence, compact = false }) {
  const [readiness, setReadiness] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams();
    fetch(`/api/workspace/creation-readiness?${params}`)
      .then((r) => r.json())
      .then((data) => setReadiness(data))
      .catch(() => setReadiness(null));
  }, [workspaceConfig, workspaceSourceRecords, persistence]);

  if (!readiness) return null;

  const { scenario, surfaces, activation, nextAction, persistence: p } = readiness;

  return (
    <section className={`workspace-creation-readiness${compact ? " is-compact" : ""}`} aria-label="Creation readiness">
      <header>
        <p className="workspace-activation-eyebrow">Governed creation</p>
        <h2>{scenario.replace(/-/g, " ")}</h2>
        {nextAction ? (
          <Link href={nextAction.href} className="workspace-creation-next-action">
            {nextAction.label}
            <ArrowRight size={14} />
          </Link>
        ) : null}
      </header>

      <div className="workspace-creation-readiness-grid">
        <article>
          <h3>Runtime</h3>
          <p>Mode: <code>{p?.mode}</code></p>
          <p>Can save: {p?.canSave ? "yes" : "no"}</p>
          <p>Can write env: {p?.canWriteEnv ? "yes" : "no"}</p>
        </article>
        <article>
          <h3>Surfaces</h3>
          <p>API rows: {surfaces?.apiRegistry?.count ?? 0} ({surfaces?.apiRegistry?.tested ?? 0} tested)</p>
          <p>Data sources: {surfaces?.dataSource?.count ?? 0}</p>
          <p>Workflows: {surfaces?.sandbox?.count ?? 0}</p>
          <p>Env keys: {surfaces?.env?.configured ?? 0}/{surfaces?.env?.total ?? 0} configured</p>
        </article>
        {!compact && activation?.checks ? (
          <article className="workspace-creation-checks">
            <h3>Activation ({activation.summary?.ready}/{activation.summary?.total} ready)</h3>
            <ul>
              {activation.checks.slice(0, 8).map((check) => (
                <li key={check.id} className={`is-${check.status}`}>
                  {check.status === "ready" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  <span>{check.label}</span>
                  {check.nextAction && check.status !== "ready" ? (
                    <Link href={check.href}>{check.nextAction}</Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </article>
        ) : null}
      </div>
    </section>
  );
}
