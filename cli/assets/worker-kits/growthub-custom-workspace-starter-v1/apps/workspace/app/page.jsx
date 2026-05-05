import workspaceConfig from "../growthub.config.json";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter } from "@/lib/adapters/integrations";
import { describePersistenceMode } from "@/lib/workspace-config";
import WorkspaceBuilder from "./workspace-builder.jsx";

function Home() {
  const adapterConfig = readAdapterConfig();
  const integrationAdapter = describeIntegrationAdapter();
  const persistenceMode = describePersistenceMode();
  return (
    <WorkspaceBuilder
      initialConfig={workspaceConfig}
      adapterConfig={adapterConfig}
      integrationAdapter={integrationAdapter}
      persistenceMode={persistenceMode}
    />
  );
}

export {
  Home as default
};
