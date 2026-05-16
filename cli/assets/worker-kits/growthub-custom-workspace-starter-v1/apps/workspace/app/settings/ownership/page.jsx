import { SettingsShell } from "../settings-shell.jsx";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describePersistenceMode, readWorkspaceConfig } from "@/lib/workspace-config";
import { OwnershipPanel } from "./ownership-panel.jsx";

async function OwnershipSettingsPage() {
  const config = await readWorkspaceConfig();
  const adapterConfig = readAdapterConfig();
  const persistence = describePersistenceMode();
  return (
    <SettingsShell active="/settings/ownership" eyebrow="Settings" title="Ownership">
      <OwnershipPanel config={config} persistence={persistence} adapterConfig={adapterConfig} />
    </SettingsShell>
  );
}

export {
  OwnershipSettingsPage as default,
};
