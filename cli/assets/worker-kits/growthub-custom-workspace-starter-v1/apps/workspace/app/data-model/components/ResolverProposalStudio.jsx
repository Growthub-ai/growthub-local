"use client";

import { AlertTriangle, FileCode } from "lucide-react";

export function ResolverProposalStudio({ proposal, compact = false }) {
  if (!proposal?.payload) return null;
  const { targetPath, code, why, inputContract, outputContract, linkedRegistryId, pathValidation, securityWarnings } = proposal.payload;

  return (
    <section className={`dm-resolver-studio${compact ? " is-compact" : ""}`} aria-label="Resolver proposal studio">
      <header className="dm-resolver-studio-head">
        <FileCode size={16} aria-hidden="true" />
        <div>
          <p>Server file</p>
          <h3>Resolver proposal</h3>
        </div>
        <span className={`dm-creation-status-chip is-${pathValidation?.ok ? "good" : "bad"}`}>
          {pathValidation?.ok ? "Path valid" : "Invalid path"}
        </span>
      </header>

      <dl className="dm-resolver-studio-meta">
        <div><dt>Target path</dt><dd><code>{targetPath}</code></dd></div>
        <div><dt>Linked registry</dt><dd><code>{linkedRegistryId}</code></dd></div>
        <div><dt>Why</dt><dd>{why}</dd></div>
        {!compact ? (
          <>
            <div><dt>Input</dt><dd><code>{JSON.stringify(inputContract)}</code></dd></div>
            <div><dt>Output</dt><dd><code>{JSON.stringify(outputContract)}</code></div>
          </>
        ) : null}
      </dl>

      {Array.isArray(securityWarnings) && securityWarnings.length ? (
        <ul className="dm-resolver-studio-warnings">
          {securityWarnings.map((w) => (
            <li key={w}><AlertTriangle size={12} /> {w}</li>
          ))}
        </ul>
      ) : null}

      <pre className="dm-run-console__output dm-resolver-studio-code">{code}</pre>

      {!pathValidation?.ok ? (
        <p className="dm-creation-error" role="alert">{pathValidation?.error}</p>
      ) : null}
    </section>
  );
}
