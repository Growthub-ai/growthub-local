import { SettingsShell } from "../settings-shell.jsx";
import { GeneralSettingsForm } from "./general-settings-form.jsx";
import {
  describePersistenceMode,
  readWorkspaceConfig
} from "@/lib/workspace-config";

async function GeneralSettingsPage() {
  const workspaceConfig = await readWorkspaceConfig();
  const persistence = describePersistenceMode();
  return <SettingsShell active="/settings/general" eyebrow="Settings" title="General">
    <GeneralSettingsForm
      workspace={{
        id: workspaceConfig.id,
        name: workspaceConfig.name,
        branding: workspaceConfig.branding || {}
      }}
      persistence={persistence}
    />
  </SettingsShell>;
}

export {
  GeneralSettingsPage as default
};
