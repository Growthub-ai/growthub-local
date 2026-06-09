"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function WorkflowReadinessBar({ sandboxRow, registryRow }) {
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace/env-key-catalog", { cache: "no-store" });
        const payload = await res.json();
        if (!cancelled) setCatalog(payload);
      } catch {
        if (!cancelled) setCatalog(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const authRef = String(registryRow?.authRef || "").trim();
  const authConfigured = !authRef || catalog?.entries?.some((e) => e.slug === authRef && e.configured);
  const tested = ["connected", "ok", "success"].includes(String(registryRow?.testStatus || registryRow?.status || "").toLowerCase());
  const published = String(sandboxRow?.lifecycleStatus || "").toLowerCase() === "live";
  const serverless = String(sandboxRow?.runLocality || "").toLowerCase() === "serverless";
  const schedulerReady = !serverless || Boolean(String(sandboxRow?.schedulerRegistryId || "").trim());

  const items = [
    { id: "env", label: "Env ready", ok: authConfigured, href: "/settings/apis-webhooks" },
    { id: "api", label: "API tested", ok: tested, href: "/data-model" },
    { id: "scheduler", label: "Scheduler ready", ok: schedulerReady, href: "/workflows" },
    { id: "publish", label: published ? "Live" : "Draft", ok: published, href: null },
  ];

  return (
    <div className="dm-workflow-readiness" aria-label="Workflow readiness">
      {items.map((item) => (
        <span key={item.id} className={`dm-workflow-readiness__chip ${item.ok ? "is-ok" : "is-pending"}`}>
          {item.href && !item.ok ? <Link href={item.href}>{item.label}</Link> : item.label}
        </span>
      ))}
    </div>
  );
}
