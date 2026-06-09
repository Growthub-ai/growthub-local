"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function WorkflowCockpitReadinessBar({ sandboxRow }) {
  const [lens, setLens] = useState(null);

  useEffect(() => {
    fetch("/api/workspace/activation-summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setLens(data.lens))
      .catch(() => setLens(null));
  }, [sandboxRow?.Name, sandboxRow?.status]);

  if (!lens) return null;

  const name = String(sandboxRow?.Name || "").trim();
  const relevant = lens.checks.filter((c) => !name || c.id.includes(name) || c.label.toLowerCase().includes("env") || c.label.toLowerCase().includes("scheduler"));
  const blocked = relevant.filter((c) => c.status === "blocked" || c.status === "failed");

  return (
    <section className="workflow-cockpit-readiness" aria-label="Workflow readiness">
      <div className="workflow-cockpit-readiness-summary">
        <span>{lens.summary.ready}/{lens.summary.total} checks ready</span>
        {blocked.length > 0 && lens.nextAction && (
          <Link href={lens.nextAction.href}>{lens.nextAction.label}</Link>
        )}
      </div>
      <ul>
        {relevant.slice(0, 6).map((check) => (
          <li key={check.id} className={`is-${check.status}`}>{check.label}: {check.status}</li>
        ))}
      </ul>
    </section>
  );
}
