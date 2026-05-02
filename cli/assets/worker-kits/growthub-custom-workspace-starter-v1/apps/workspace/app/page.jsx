import { readAdapterConfig } from "@/lib/adapters/env";
import { describeIntegrationAdapter } from "@/lib/adapters/integrations";
import { describePersistenceMode, readWorkspaceConfig } from "@/lib/workspace-config";
import WorkspaceBuilder from "@/components/WorkspaceBuilder";

async function Home() {
  const adapterConfig = readAdapterConfig();
  const integrationAdapter = describeIntegrationAdapter();
  const workspaceConfig = await readWorkspaceConfig();
  const persistence = describePersistenceMode();
  return (
    <WorkspaceBuilder
      initialConfig={workspaceConfig}
      integrationAdapter={integrationAdapter}
      adapterConfig={adapterConfig}
      persistence={persistence}
    />
  );
}

export {
  Home as default
};
