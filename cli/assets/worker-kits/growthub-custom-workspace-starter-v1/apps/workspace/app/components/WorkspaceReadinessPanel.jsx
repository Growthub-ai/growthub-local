"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, AlertCircle } from "lucide-react";

export function WorkspaceReadinessPanel({ compact = false }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/workspace/activation-summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <section className="workspace-readiness-panel is-loading">Loading readiness…</section>;
  if (!summary?.readiness) return null;

  const { readiness, lens } = summary;

  return (
    <section className={`workspace-readiness-panel${compact ? " is-compact" : ""}`} aria-label="Workspace readiness">
      <header>
        <h2>Runtime readiness</h2>
        <p className="workspace-readiness-scenario">{readiness.scenario.replace(/-/g, " ")}</p>
      </header>
      <ul className="workspace-readiness-checks">
        {(compact ? readiness.checks.slice(0, 4) : readiness.checks).map((check) => (
          <li key={check.id} className={`is-${check.status}`}>
            {check.status === "ready" ? <Check size={14} /> : <AlertCircle size={14} />}
            <div>
              <strong>{check.label}</strong>
              <span>{check.detail}</span>
              {check.nextAction && check.href && (
                <Link href={check.href}>{check.nextAction} <ArrowRight size={12} /></Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      {readiness.nextBestAction && (
        <footer>
          <Link className="dm-btn-primary-sm" href={readiness.nextBestAction.href}>
            {readiness.nextBestAction.label} <ArrowRight size={14} />
          </Link>
        </footer>
      )}
      {!compact && lens?.nextAction && (
        <p className="workspace-readiness-lens-next">
          Activation: <Link href={lens.nextAction.href}>{lens.nextAction.label}</Link>
        </p>
      )}
    </section>
  );
}
