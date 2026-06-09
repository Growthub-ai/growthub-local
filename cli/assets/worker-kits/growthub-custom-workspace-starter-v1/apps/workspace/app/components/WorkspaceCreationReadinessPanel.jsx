"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

export function WorkspaceCreationReadinessPanel({ onRegisterApi }) {
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/workspace/creation/readiness", { cache: "no-store" });
        const payload = await res.json();
        if (!cancelled) setReadiness(payload);
      } catch {
        if (!cancelled) setReadiness(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="workspace-readiness"><p><Loader2 className="spin" size={14} /> Loading creation readiness…</p></div>;
  }
  if (!readiness) return null;

  return (
    <article className="workspace-readiness-section">
      <h3>Governed creation</h3>
      <p className="workspace-overlay-note">{readiness.headline}</p>
      <p className="workspace-overlay-note">{readiness.subheadline}</p>
      <div className="workspace-readiness-row">
        <span>Persistence</span>
        <code>{readiness.summary?.persistenceMode}</code>
      </div>
      <div className="workspace-readiness-row">
        <span>API rows</span>
        <strong>{readiness.summary?.apiRegistryRows}</strong>
      </div>
      <div className="workspace-readiness-row">
        <span>Tested APIs</span>
        <strong>{readiness.summary?.testedApis}</strong>
      </div>
      <div className="workspace-readiness-row">
        <span>Missing env</span>
        <strong>{readiness.summary?.missingEnv}</strong>
      </div>
      <ul className="dm-api-action-checklist">
        {(readiness.checks || []).map((check) => (
          <li key={check.id} className={check.status === "complete" ? "is-done" : "is-pending"}>
            <span>{check.label}</span>
            {check.status !== "complete" && check.href ? (
              <Link href={check.href}>{check.cta}</Link>
            ) : null}
          </li>
        ))}
      </ul>
      {readiness.nextAction ? (
        <div className="workspace-readiness-row">
          <button type="button" className="workspace-readiness-action" onClick={onRegisterApi}>
            Register API <ArrowRight size={14} />
          </button>
          {readiness.nextAction.href ? (
            <Link href={readiness.nextAction.href} className="workspace-readiness-action">
              {readiness.nextAction.cta}
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="dm-env-chip-row">
        {(readiness.envChips || []).filter((chip) => chip.inUse).map((chip) => (
          <span key={chip.slug} className={`dm-env-chip ${chip.configured ? "is-configured" : "is-missing"}`}>
            {chip.slug}
          </span>
        ))}
      </div>
    </article>
  );
}
