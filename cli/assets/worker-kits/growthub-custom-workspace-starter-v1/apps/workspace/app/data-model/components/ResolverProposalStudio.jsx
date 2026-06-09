"use client";

import { useState } from "react";
import { FileCode2, ShieldAlert } from "lucide-react";

/**
 * Read-only or review resolver file proposal — target path, generated code,
 * contracts, and security warnings. Apply happens via creation-proposals/apply
 * or register-resolver upload.
 */
export function ResolverProposalStudio({ proposal, readOnly = true, onApplyFile }) {
  const [showCode, setShowCode] = useState(false);
  if (!proposal) return null;

  return (
    <section className="dm-resolver-studio" aria-label="Resolver proposal">
      <header className="dm-resolver-studio-header">
        <FileCode2 size={18} aria-hidden="true" />
        <div>
          <p className="dm-api-action-card-eyebrow">Resolver Proposal Studio</p>
          <h3>{proposal.integrationId || "resolver"}</h3>
          <code>{proposal.relativePath}</code>
        </div>
      </header>

      <p className="dm-resolver-studio-why">{proposal.why}</p>

      <div className="workspace-readiness-row">
        <span>Input contract</span>
        <code>{JSON.stringify(proposal.inputContract || {})}</code>
      </div>
      <div className="workspace-readiness-row">
        <span>Output contract</span>
        <code>{JSON.stringify(proposal.outputContract || {})}</code>
      </div>

      {!proposal.valid && (
        <div className="workspace-readiness-row warn">
          <span>Path validation</span>
          <em>{(proposal.errors || []).join("; ")}</em>
        </div>
      )}

      <ul className="dm-resolver-warnings">
        {(proposal.securityWarnings || []).map((w) => (
          <li key={w}><ShieldAlert size={14} aria-hidden="true" /> {w}</li>
        ))}
      </ul>

      <button type="button" className="dm-btn-outline dm-btn-sm" onClick={() => setShowCode((v) => !v)}>
        {showCode ? "Hide generated code" : "Preview generated code"}
      </button>
      {showCode && (
        <pre className="dm-resolver-code-preview">{proposal.code}</pre>
      )}

      {!readOnly && onApplyFile && proposal.valid && (
        <button type="button" className="dm-btn-primary-sm" onClick={() => onApplyFile(proposal)}>
          Write resolver file
        </button>
      )}
    </section>
  );
}
