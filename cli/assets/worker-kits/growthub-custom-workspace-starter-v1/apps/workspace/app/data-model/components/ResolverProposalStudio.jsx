"use client";

import { useState } from "react";
import { FileCode2, Save } from "lucide-react";

export function ResolverProposalStudio({ proposal, readOnly = false, canSave = true, onApplied }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  if (!proposal) return null;

  async function applyResolver() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/workspace/register-resolver", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: proposal.code, filename: proposal.filename }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Resolver write failed");
      setMessage(payload.conflict ? `Wrote ${payload.path} (replaced existing file).` : `Wrote ${payload.path}.`);
      onApplied?.(payload);
    } catch (err) {
      setMessage(err?.message || "Resolver write failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="dm-resolver-studio" aria-label="Resolver proposal studio">
      <header>
        <FileCode2 size={16} aria-hidden="true" />
        <div>
          <h4>Resolver Proposal Studio</h4>
          <p>{proposal.why}</p>
        </div>
        <span className={`dm-status-pill ${proposal.recommendation}`}>{proposal.recommendation}</span>
      </header>
      <div className="dm-run-console__meta">
        <div><strong>Target</strong> <code>{proposal.targetPath}</code></div>
        <div><strong>Integration</strong> <code>{proposal.integrationId}</code></div>
      </div>
      {(proposal.securityWarnings || []).map((warning) => (
        <p key={warning} className="dm-run-console__warn">{warning}</p>
      ))}
      <pre className="dm-run-console__output dm-resolver-studio__code">{proposal.code}</pre>
      {!readOnly && canSave ? (
        <button type="button" className="dm-btn-primary-sm" disabled={loading} onClick={applyResolver}>
          <Save size={14} />
          {loading ? "Writing…" : "Write resolver file"}
        </button>
      ) : null}
      {message ? <p className="dm-run-console__meta">{message}</p> : null}
    </section>
  );
}
