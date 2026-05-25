import Link from "next/link";
import { Suspense } from "react";
import { describeNangoAdapter, getStatus } from "@/lib/adapters/integrations/nango";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { WorkspaceRail } from "../../../workspace-rail.jsx";

/**
 * Nango integration settings — inspect-only panel.
 *
 * Reads from the EXISTING `objectType: "api-registry"` rows in
 * `dataModel.objects[]`. Rows that declare `connectorKind: "nango"` are
 * Nango-backed; other connectorKinds (http, mcp, chrome, tool) are shown
 * here only for context — they keep going through their own resolvers.
 *
 * Secrets are not displayed. The Nango secret lives in env (default env-ref
 * name: NANGO_SECRET_KEY); the row's `authRef` column names the env-ref.
 */

function listApiRegistryObjects(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects;
  if (!Array.isArray(objects)) return [];
  return objects.filter((object) => object?.objectType === "api-registry");
}

function flattenNangoRows(apiRegistryObjects) {
  const rows = [];
  for (const object of apiRegistryObjects) {
    const objectRows = Array.isArray(object.rows) ? object.rows : [];
    for (const row of objectRows) {
      if (row?.connectorKind === "nango") {
        rows.push({ object, row });
      }
    }
  }
  return rows;
}

function summarizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function NangoRowCard({ object, row }) {
  const connectionIds = summarizeList(row.connectionIds);
  const enabledActions = summarizeList(row.enabledActions);
  const providerConfigKey = row.providerConfigKey || row.integrationId;
  return <article className="workspace-integration-row">
    <div className="workspace-provider-mark">{String(row.integrationId || "?").slice(0, 1).toUpperCase()}</div>
    <div className="workspace-integration-main">
      <strong>{row.integrationId}</strong>
      <p>providerConfigKey: <code>{providerConfigKey || "—"}</code></p>
      <div className="workspace-integration-meta">
        <span>object: <code>{object.id}</code></span>
        <span>{row.nangoMode || "cloud"}</span>
        <span>env: {row.nangoEnvironment || "dev"}</span>
        <span>{connectionIds.length} {connectionIds.length === 1 ? "connection" : "connections"}</span>
        <span>{enabledActions.length} {enabledActions.length === 1 ? "action" : "actions"}</span>
        {row.authRef ? <span><code>{row.authRef}</code></span> : null}
        {row.endpoint ? <span>endpoint: <code>{row.endpoint}</code></span> : null}
      </div>
    </div>
    <span className={`workspace-integration-status ${row.status || "configured"}`}>{row.status || "configured"}</span>
  </article>;
}

async function NangoIntegrationsSettingsPage() {
  const adapter = describeNangoAdapter();
  const workspaceConfig = await readWorkspaceConfig();
  const apiRegistryObjects = listApiRegistryObjects(workspaceConfig);
  const nangoRows = flattenNangoRows(apiRegistryObjects);

  let status;
  try {
    status = await getStatus();
  } catch (error) {
    status = { status: "disconnected", reason: error?.message || "status probe failed" };
  }

  return <main className="workspace-builder workspace-settings-page">
    <Suspense fallback={null}>
      <WorkspaceRail
        workspaceConfig={workspaceConfig}
        authority={adapter.authority}
        managementSlot={(
          <Link className="active" href="/settings/integrations">Integrations</Link>
        )}
      />
    </Suspense>

    <section className="workspace-surface">
      <header className="workspace-toolbar">
        <div>
          <p>Workspace settings &middot; Integrations</p>
          <h1>Nango</h1>
        </div>
        <div className="workspace-toolbar-actions">
          <Link href="/settings/integrations">All integrations</Link>
          <span>{adapter.id}</span>
          <span>{adapter.authority}</span>
        </div>
      </header>

      <section className="workspace-integration-summary" aria-label="Nango adapter summary">
        <article>
          <span>Adapter</span>
          <strong>{adapter.label}</strong>
          <div>
            <code>{adapter.secretEnvName}</code>
            <span> &middot; row-scoped via <code>connectorKind: "nango"</code></span>
          </div>
        </article>
        <article>
          <span>Mode</span>
          <strong>{adapter.mode}</strong>
          <div>{adapter.hostUrl ? <code>{adapter.hostUrl}</code> : <code>nango cloud</code>}</div>
        </article>
        <article>
          <span>Status</span>
          <strong>{status.status}</strong>
          <div>{status.reason ? <span>{status.reason}</span> : <span>environment: <code>{status.environment || adapter.environment}</code></span>}</div>
        </article>
      </section>

      <section className="workspace-integration-toolbar">
        <div>
          <strong>Nango-backed API Registry rows</strong>
          <p>Rows in <code>dataModel.objects[]</code> with <code>objectType: "api-registry"</code> and <code>connectorKind: "nango"</code>. Edit <code>growthub.config.json</code> to add or remove rows — secrets stay in env, referenced by the row's <code>authRef</code>.</p>
        </div>
      </section>

      <section className="workspace-integration-board">
        {nangoRows.length === 0
          ? <article className="workspace-integration-section">
            <div className="workspace-integration-section-heading">
              <div>
                <h2>No Nango-backed rows yet</h2>
                <p>Add a row to an <code>api-registry</code> object with <code>connectorKind: "nango"</code>, an <code>integrationId</code>, and an optional <code>providerConfigKey</code>. Apply the <code>nango</code> resolver template from the Data Model template picker for sensible defaults.</p>
              </div>
            </div>
          </article>
          : <article className="workspace-integration-section">
            <div className="workspace-integration-section-heading">
              <div>
                <h2>Nango providers</h2>
                <p>{nangoRows.length} row{nangoRows.length === 1 ? "" : "s"} across {apiRegistryObjects.length} API Registry object{apiRegistryObjects.length === 1 ? "" : "s"}.</p>
              </div>
              <span>{nangoRows.length}</span>
            </div>
            <div className="workspace-integration-list">
              {nangoRows.map(({ object, row }, index) => <NangoRowCard
                object={object}
                row={row}
                key={`${object.id}:${row.integrationId || index}`}
              />)}
            </div>
          </article>}
      </section>
    </section>
  </main>;
}

export {
  NangoIntegrationsSettingsPage as default
};
