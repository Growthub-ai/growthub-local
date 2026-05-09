import { SettingsShell } from "../settings-shell.jsx";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describePersistenceMode, readWorkspaceConfig } from "@/lib/workspace-config";
import { ApisWebhooksForm } from "./apis-webhooks-form.jsx";

async function ApisWebhooksSettingsPage() {
  const config = readAdapterConfig();
  const workspaceConfig = await readWorkspaceConfig();
  const integrations = Array.isArray(workspaceConfig.integrations) ? workspaceConfig.integrations : [];
  const refs = integrations.filter((item) => item?.sourceType === "custom-api-webhooks");

  return <SettingsShell active="/settings/apis-webhooks" eyebrow="Settings" title="APIs & Webhooks">
    <ApisWebhooksForm adapter={config.integrationAdapter} persistence={describePersistenceMode()} refs={refs} />
  </SettingsShell>;
}

export {
  ApisWebhooksSettingsPage as default
};
