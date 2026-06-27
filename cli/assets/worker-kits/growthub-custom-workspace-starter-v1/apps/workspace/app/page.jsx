import { Suspense } from "react";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { describePersistenceMode, readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import WorkspaceBuilder from "./workspace-builder.jsx";

async function Home() {
  const adapterConfig = readAdapterConfig();
  const integrationAdapter = describeIntegrationAdapter();
  const integrations = await listGovernedWorkspaceIntegrations();
  const persistence = describePersistenceMode();
  const workspaceConfig = await readWorkspaceConfig();
  let initialSourceRecords = {};
  try {
    initialSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch {
    initialSourceRecords = {};
  }
  return (
    <Suspense fallback={null}>
      <WorkspaceBuilder
        initialConfig={workspaceConfig}
        initialSourceRecords={initialSourceRecords}
        adapterConfig={adapterConfig}
        integrationAdapter={integrationAdapter}
        integrationSettings={{ integrations: groupIntegrationsByLane(integrations) }}
        persistence={persistence}
      />
    </Suspense>
  );
}

export {
  Home as default
};
