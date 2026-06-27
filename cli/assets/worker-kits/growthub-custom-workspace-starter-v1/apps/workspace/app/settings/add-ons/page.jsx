import { SettingsShell } from "../settings-shell.jsx";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { computeConfiguredEnvRefs, listPersistenceAdapterReadiness } from "@/lib/env-status";
import { listAllProviderProductReadiness } from "@/lib/workspace-add-ons";
import { AddOnsSettingsClient } from "./add-ons-client.jsx";

async function AddOnsSettingsPage() {
  const workspaceConfig = await readWorkspaceConfig();
  const envSignals = {
    configuredEnvRefs: computeConfiguredEnvRefs(workspaceConfig, process.env),
    persistenceAdapters: listPersistenceAdapterReadiness(process.env),
    // Key MUST match what add-ons-client.jsx normalizes (`providerProductReadiness`).
    // Provider-keyed so every marketplace provider's per-product readiness renders.
    providerProductReadiness: listAllProviderProductReadiness(process.env),
  };
  return <SettingsShell active="/settings/add-ons" eyebrow="Settings" title="Marketplace">
    <AddOnsSettingsClient initialWorkspaceConfig={workspaceConfig} envSignals={envSignals} />
  </SettingsShell>;
}

export {
  AddOnsSettingsPage as default
};
