"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileCode, X } from "lucide-react";
import { buildResolverFileProposal } from "@/lib/workspace-creation-proposals";

export function ResolverProposalStudio({ open, onClose, registryRow, onApplied }) {
  const [proposal, setProposal] = useState(null);
  const [applying, setApplying] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !registryRow) return;
    const draft = {
      integrationId: registryRow.integrationId,
      name: registryRow.Name || registryRow.integrationId,
      baseUrl: registryRow.baseUrl,
      method: registryRow.method,
    };
    setProposal(buildResolverFileProposal(draft));
    setReceipt(null);
    setError("");
  }, [open, registryRow]);

  async function applyResolver() {
    if (!proposal) return;
    setApplying(true);
    setError("");
    try {
      const bundle = {
        kind: "growthub-creation-proposal-bundle-v1",
        businessGoal: `Write resolver for ${registryRow?.integrationId}`,
        proposals: [proposal],
        warnings: [],
      };
      const res = await fetch("/api/workspace/creation-proposal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply", bundle }),
      });
      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.error || payload.guidance || "Resolver write failed");
        return;
      }
      setReceipt(payload.fileReceipts?.[0] || null);
      onApplied?.(payload);
    } catch (err) {
      setError(err.message || "Resolver write failed");
    } finally {
      setApplying(false);
    }
  }

  if (!open || !registryRow) return null;

  return (
    <div className="dm-json-modal-backdrop" onClick={onClose}>
      <section className="dm-json-modal dm-resolver-studio" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <p>Resolver Proposal Studio</p>
            <h2>{registryRow.integrationId || registryRow.Name}</h2>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="dm-resolver-studio-body">
          <p><FileCode size={14} /> Target: <code>{proposal?.payload?.targetPath}</code></p>
          <p>Why: normalizes API output into source records. Secrets read from <code>process.env</code> only.</p>
          <pre className="dm-resolver-studio-code">{proposal?.payload?.code}</pre>
          {proposal?.meta?.securityWarnings?.length > 0 && (
            <ul className="dm-wizard-warnings">{proposal.meta.securityWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          {receipt ? (
            <p className="dm-env-status is-ready">Written: {receipt.targetPath}</p>
          ) : (
            <button type="button" className="dm-btn-primary-sm" disabled={applying} onClick={applyResolver}>
              {applying ? "Writing…" : "Apply resolver file"}
            </button>
          )}
          {error && <p className="dm-wizard-error">{error}</p>}
          <p className="dm-resolver-studio-hint">
            After apply, <Link href="/data-model">test the API</Link> and refresh the linked Data Source.
          </p>
        </div>
      </section>
    </div>
  );
}
