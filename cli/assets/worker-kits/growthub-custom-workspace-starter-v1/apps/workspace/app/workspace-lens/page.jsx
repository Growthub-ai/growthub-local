import { Suspense } from "react";
import Link from "next/link";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describePersistenceMode, readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { deriveWorkspaceActivationState } from "@/lib/workspace-activation";
import { WorkspaceRail } from "../workspace-rail.jsx";
import { WorkspaceLensPanel } from "../components/WorkspaceLensPanel.jsx";
import { ActivationLensPanel } from "../components/ActivationLensPanel.jsx";

/**
 * /workspace-lens — the dedicated Workspace Lens surface.
 *
 * Server-rendered and force-dynamic so it always reflects the LIVE workspace
 * artifact (a live operating surface must not be statically baked). Reads the
 * same governed helpers the home page uses, assembles a safe runtime
 * descriptor (no secrets), and gates behind activation completeness:
 * onboarding first, operating surface second.
 */
export const dynamic = "force-dynamic";

async function WorkspaceLens() {
  const adapter = readAdapterConfig();
  const persistence = describePersistenceMode();
  const workspaceConfig = await readWorkspaceConfig();
  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch {
    workspaceSourceRecords = {};
  }

  const metadataGraph = {
    runtime: {
      persistenceMode: persistence?.mode || "",
      persistenceAdapter: persistence?.mode === "database" ? (adapter?.dataAdapter || null) : null,
      allowFsWrite: persistence?.mode === "filesystem" && persistence?.canSave === true,
      nangoConfigured: Boolean(adapter?.nango?.hasSecretKey),
      deploy: { target: adapter?.deployTarget || "" },
    },
  };

  const activationComplete = deriveWorkspaceActivationState({ workspaceConfig, workspaceSourceRecords }).complete;

  return (
    <main className="workspace-builder workspace-lens-page">
      <WorkspaceRail workspaceConfig={workspaceConfig || {}} />
      <section className="workspace-surface workspace-lens-surface">
        <div className="workspace-lens-shell">
          {activationComplete ? (
            <>
            <ActivationLensPanel
              workspaceConfig={workspaceConfig}
              workspaceSourceRecords={workspaceSourceRecords}
              persistence={persistence}
            />
            <WorkspaceLensPanel
              workspaceConfig={workspaceConfig}
              workspaceSourceRecords={workspaceSourceRecords}
              metadataGraph={metadataGraph}
            />
            </>
          ) : (
            <div className="workspace-lens-locked">
              <h1 className="workspace-lens-title">Workspace Lens is locked</h1>
              <p className="workspace-lens-subtitle">
                Finish workspace setup to unlock the live operating surface — state, blocked conditions,
                next actions, and agent-assignable work.
              </p>
              <Link href="/" className="workspace-lens-next-link">Finish setup in the Builder</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function WorkspaceLensPage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceLens />
    </Suspense>
  );
}
