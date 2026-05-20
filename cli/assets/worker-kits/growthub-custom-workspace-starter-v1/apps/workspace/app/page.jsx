import { Suspense } from "react";
import workspaceConfig from "../growthub.config.json";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter, listGovernedWorkspaceIntegrations } from "@/lib/adapters/integrations";
import { groupIntegrationsByLane } from "@/lib/domain/integrations";
import { describePersistenceMode } from "@/lib/workspace-config";
import WorkspaceBuilder from "./workspace-builder.jsx";

async function Home() {
  const adapterConfig = readAdapterConfig();
  const integrationAdapter = describeIntegrationAdapter();
  const integrations = await listGovernedWorkspaceIntegrations();
  const persistence = describePersistenceMode();
  return (
    <Suspense fallback={null}>
      <WorkspaceBuilder
        initialConfig={workspaceConfig}
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
