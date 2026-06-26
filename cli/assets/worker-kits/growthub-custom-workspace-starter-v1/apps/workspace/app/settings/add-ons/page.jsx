import { SettingsShell } from "../settings-shell.jsx";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { computeConfiguredEnvRefs, listPersistenceAdapterReadiness } from "@/lib/env-status";
import { listUpstashProductReadiness } from "@/lib/workspace-add-ons";
import { AddOnsSettingsClient } from "./add-ons-client.jsx";

async function AddOnsSettingsPage() {
  const workspaceConfig = await readWorkspaceConfig();
  const envSignals = {
    configuredEnvRefs: computeConfiguredEnvRefs(workspaceConfig, process.env),
    persistenceAdapters: listPersistenceAdapterReadiness(process.env),
    upstashProducts: listUpstashProductReadiness(process.env),
  };
  return <SettingsShell active="/settings/add-ons" eyebrow="Settings" title="Add-ons">
    <AddOnsSettingsClient initialWorkspaceConfig={workspaceConfig} envSignals={envSignals} />
  </SettingsShell>;
}

export {
  AddOnsSettingsPage as default
};
