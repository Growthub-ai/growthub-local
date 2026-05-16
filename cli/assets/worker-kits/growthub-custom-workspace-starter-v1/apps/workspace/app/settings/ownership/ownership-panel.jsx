"use client";

/**
 * Ownership settings panel — the inspect-only "Management" surface that
 * previously lived behind a modal triggered from the nav rail. Moved here
 * as the 4th Workspace Settings tab so the rail can collapse its
 * Management item into the renamed "Management" link (formerly Data
 * Model) without losing the readiness/diagnostics surface.
 *
 * Pure presentational + one fetch effect for the live resolver list.
 * Workflow execution stays in `growthub workflow` / `growthub bridge`;
 * this panel never executes, never calls hosted endpoints, and never
 * exposes tokens.
 */

import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_PERSISTENCE = {
  mode: "unknown",
  canSave: false,
  reason: "Persistence mode could not be resolved.",
  guidance: "",
};

function ResolverManagementSection({ canSave, config }) {
  const [resolverData, setResolverData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch("/api/workspace/resolvers")
      .then((r) => (r.ok ? r.json() : { files: [], registeredIds: [], resolvers: [], canUpload: false }))
      .then(setResolverData)
      .catch(() => setResolverData({ files: [], registeredIds: [], resolvers: [], canUpload: false }));
  }, [uploadResult]);

  const dataModelObjects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];

  const linkedObjectsByResolver = useMemo(() => {
    const map = {};
    dataModelObjects.forEach((obj) => {
      const intId = obj.binding?.integrationId;
      if (!intId) return;
      if (!map[intId]) map[intId] = [];
      map[intId].push(obj);
    });
    return map;
  }, [dataModelObjects]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/workspace/register-resolver", { method: "POST", body: form });
      const data = await res.json();
      setUploadResult(res.ok ? { ok: true, ...data } : { ok: false, ...data });
    } catch {
      setUploadResult({ ok: false, error: "Network error" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const resolvers = resolverData?.resolvers || [];

  return (
    <article className="workspace-readiness-section">
      <h3>Source Resolvers</h3>
      <div className="workspace-readiness-row">
        <span>Files</span>
        <code>{resolverData ? resolverData.files.length : "…"}</code>
      </div>
      <div className="workspace-readiness-row">
        <span>Registered</span>
        <code>{resolverData ? resolvers.length : "…"}</code>
      </div>
      <div className="workspace-readiness-row">
        <span>Data Model objects</span>
        <code>{dataModelObjects.length}</code>
      </div>
      {canSave ? (
        <>
          <div className="workspace-readiness-row">
            <span>Upload resolver</span>
            <input ref={fileInputRef} type="file" accept=".js" style={{ display: "none" }} onChange={handleFileChange} />
            <button
              type="button"
              className="workspace-readiness-action"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload .js file"}
            </button>
          </div>
          {uploadResult && (
            <div className={`workspace-readiness-row resolver-upload-result ${uploadResult.ok ? "good" : "error"}`}>
              <span>{uploadResult.ok ? "Saved" : "Error"}</span>
              <em>{uploadResult.ok ? uploadResult.path : uploadResult.error}</em>
            </div>
          )}
          <p className="workspace-panel-hint">
            Upload a <code>.js</code> resolver file that calls <code>registerSourceResolver()</code>.
          </p>
        </>
      ) : (
        <div className="workspace-readiness-row">
          <span>Upload</span>
          <em>
            Requires <code>WORKSPACE_CONFIG_ALLOW_FS_WRITE=true</code> or add resolver files manually to{" "}
            <code>lib/adapters/integrations/resolvers/</code>.
          </em>
        </div>
      )}
    </article>
  );
}

export function OwnershipPanel({ config, persistence, adapterConfig }) {
  const persist = persistence || DEFAULT_PERSISTENCE;
  const pipelines = Array.isArray(config?.pipelines) ? config.pipelines : [];
  const integrations = Array.isArray(config?.integrations) ? config.integrations : [];
  const capabilities = Array.isArray(config?.capabilities) ? config.capabilities : [];
  return (
    <section className="workspace-settings-card workspace-ownership-card">
      <div className="workspace-settings-card-heading">
        <div>
          <h2>Ownership</h2>
          <p>
            Inspect-only readiness, persistence, integrations, workflows, and source resolvers for
            this governed workspace. Workflow execution stays in <code>growthub workflow</code> /
            <code> growthub bridge</code>; this panel never executes, never calls hosted endpoints, and
            never exposes tokens.
          </p>
        </div>
      </div>

      <div className="workspace-readiness">
        <article className="workspace-readiness-section">
          <h3>Workspace</h3>
          <div className="workspace-readiness-row"><span>ID</span><code>{config?.id || "Unknown"}</code></div>
          <div className="workspace-readiness-row"><span>Name</span><strong>{config?.name || "Workspace"}</strong></div>
          <div className="workspace-readiness-row">
            <span>Capabilities</span>
            <span>{capabilities.length ? capabilities.join(", ") : "none"}</span>
          </div>
        </article>

        <article className="workspace-readiness-section">
          <h3>API</h3>
          <div className="workspace-readiness-row"><span>PATCH allowlist</span><code>dashboards | widgetTypes | canvas | dataModel</code></div>
          <div className="workspace-readiness-row"><span>Unknown field</span><code>400</code></div>
          <div className="workspace-readiness-row"><span>Read-only runtime</span><code>409 + guidance</code></div>
          <div className="workspace-readiness-row">
            <span>Can save now</span>
            <span className={`workspace-readiness-badge ${persist.canSave ? "good" : "warn"}`}>
              {persist.canSave ? "yes" : "no"}
            </span>
          </div>
        </article>

        <article className="workspace-readiness-section">
          <h3>Workflows</h3>
          {pipelines.length === 0 ? (
            <div className="workspace-readiness-row workspace-readiness-empty">
              <em>
                No workflows declared in <code>growthub.config.json</code>. Connect via{" "}
                <code>growthub workflow</code> after Bridge auth.
              </em>
            </div>
          ) : (
            pipelines.map((pipeline, index) => (
              <div className="workspace-readiness-row" key={pipeline.id || index}>
                <span>{pipeline.id || `pipeline-${index}`}</span>
                <strong>{pipeline.name || "Untitled"}</strong>
              </div>
            ))
          )}
        </article>

        <article className="workspace-readiness-section">
          <h3>Integrations</h3>
          <div className="workspace-readiness-row"><span>Adapter</span><code>{adapterConfig?.integrationAdapter || "—"}</code></div>
          <div className="workspace-readiness-row"><span>Deploy target</span><code>{adapterConfig?.deployTarget || "—"}</code></div>
          {integrations.length === 0 ? (
            <div className="workspace-readiness-row workspace-readiness-empty">
              <em>
                No static integrations declared. Use <code>growthub bridge agents bind</code> for hosted bindings.
              </em>
            </div>
          ) : (
            integrations.map((integration, index) => (
              <div className="workspace-readiness-row" key={integration.id || index}>
                <span>{integration.id || `integration-${index}`}</span>
                <strong>{integration.name || "Untitled"}</strong>
              </div>
            ))
          )}
        </article>

        <article className="workspace-readiness-section">
          <h3>Persistence</h3>
          <div className="workspace-readiness-row">
            <span>Mode</span>
            <span className={`workspace-readiness-badge mode-${persist.mode}`}>{persist.mode}</span>
          </div>
          <div className="workspace-readiness-row"><span>Reason</span><em>{persist.reason}</em></div>
          {persist.guidance ? (
            <div className="workspace-readiness-row"><span>Guidance</span><em>{persist.guidance}</em></div>
          ) : null}
        </article>

        <ResolverManagementSection canSave={persist.canSave} config={config} />
      </div>
    </section>
  );
}
