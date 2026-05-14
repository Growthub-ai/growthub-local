"use client";

import { StatusPill } from "./StatusPill.jsx";

export function SourceTestPanel({ status, testing, testMessage, onTest, disabled }) {
  return (
    <div className="dm-record-testbar">
      <StatusPill value={status} />
      <button type="button" className="dm-btn-primary-sm" disabled={testing || disabled} onClick={onTest}>
        {testing ? "Testing…" : "Test connection"}
      </button>
      {testMessage && <span>{testMessage}</span>}
    </div>
  );
}
