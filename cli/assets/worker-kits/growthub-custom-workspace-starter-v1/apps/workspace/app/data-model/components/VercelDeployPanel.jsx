"use client";

import { useState } from "react";
import { ExternalLink, Rocket } from "lucide-react";
import { StatusPill } from "./StatusPill.jsx";

/**
 * One-click deploy bar for rows of the governed `vercel-projects` object.
 * Mirrors SourceTestPanel/SandboxRunPanel: a thin trigger over the governed
 * server route (POST /api/workspace/add-ons/vercel/deploy) — the row is
 * patched server-side with receipt-backed proof; this panel only reflects it.
 */
export function VercelDeployPanel({ row, disabled = false, onPatchDraft }) {
  const projectId = String(row?.projectId || "").trim();
  const [deploying, setDeploying] = useState(false);
  const [message, setMessage] = useState("");
  if (!projectId) return null;

  const deploymentUrl = String(row?.latestDeploymentUrl || "").trim();
  const deployState = String(row?.lastDeployStatus || row?.latestDeploymentState || "").trim();

  async function deployNow() {
    setDeploying(true);
    setMessage("");
    try {
      const response = await fetch("/api/workspace/add-ons/vercel/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload?.error || "Deploy failed.");
        return;
      }
      const deployment = payload?.deployment || {};
      setMessage(`Deployment ${deployment.deploymentId || ""} ${deployment.readyState || "QUEUED"}${deployment.url ? ` → ${deployment.url}` : ""}`.trim());
      onPatchDraft?.({
        lastDeployStatus: deployment.readyState || "QUEUED",
        ...(deployment.deploymentId ? { latestDeploymentId: deployment.deploymentId } : {}),
        ...(deployment.url ? { latestDeploymentUrl: deployment.url } : {}),
        ...(deployment.readyState ? { latestDeploymentState: deployment.readyState } : {}),
      });
    } catch (error) {
      setMessage(error?.message || "Deploy failed.");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="dm-record-testbar">
      <StatusPill value={deployState || row?.status} />
      <button type="button" className="dm-btn-primary-sm" disabled={deploying || disabled} onClick={deployNow}>
        {deploying ? "Deploying…" : (<><Rocket size={13} aria-hidden /> Deploy to Vercel</>)}
      </button>
      {deploymentUrl ? (
        <a className="dm-btn-outline" href={deploymentUrl} target="_blank" rel="noreferrer">
          Open deployment <ExternalLink size={12} aria-hidden />
        </a>
      ) : null}
      {message && <span>{message}</span>}
    </div>
  );
}
