import { SettingsShell } from "../settings-shell.jsx";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { AppsList } from "./apps-list.jsx";
import { CodexSitesDataModelCard } from "./codex-sites-data-model-card.jsx";
import { SettingsAccordionGroup, SettingsAccordionSection } from "./settings-accordion-section.jsx";

async function readForkMetadata() {
  try {
    const forkPath = path.resolve(process.cwd(), "../..", ".growthub-fork", "fork.json");
    return JSON.parse(await fs.readFile(forkPath, "utf8"));
  } catch {
    return null;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readWorkspaceDirectoryApps() {
  const appsRoot = path.dirname(process.cwd());
  let entries = [];
  try {
    entries = await fs.readdir(appsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const apps = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const appPath = path.join(appsRoot, entry.name);
    const [hasPackage, hasNext, hasVite] = await Promise.all([
      pathExists(path.join(appPath, "package.json")),
      pathExists(path.join(appPath, "next.config.js")),
      pathExists(path.join(appPath, "vite.config.js"))
    ]);
    if (!hasPackage && !hasNext && !hasVite) continue;
    let packageName = "";
    if (hasPackage) {
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(appPath, "package.json"), "utf8"));
        packageName = pkg.name || "";
      } catch {
        packageName = "";
      }
    }
    apps.push({
      id: entry.name,
      name: entry.name === "workspace" ? "Workspace" : entry.name,
      description: entry.name === "workspace" ? "Default Growthub workspace app." : "Workspace app discovered from the apps directory.",
      provider: packageName || "local",
      source: `apps/${entry.name}`,
      authority: "directory",
      status: "available"
    });
  }
  return apps.sort((a, b) => a.id.localeCompare(b.id));
}

async function AppsSettingsPage() {
  const workspaceConfig = await readWorkspaceConfig();
  const fork = await readForkMetadata();
  const directoryApps = await readWorkspaceDirectoryApps();
  const configApps = Array.isArray(workspaceConfig.apps) ? workspaceConfig.apps : [];
  const appsById = new Map(directoryApps.map((item) => [item.id, item]));
  for (const item of configApps) {
    const id = item.id || item.name;
    if (!id) continue;
    appsById.set(id, { ...(appsById.get(id) || {}), ...item });
  }
  const apps = Array.from(appsById.values());
  const bridge = workspaceConfig.bridge && typeof workspaceConfig.bridge === "object" ? workspaceConfig.bridge : null;

  return <SettingsShell active="/settings/apps" eyebrow="Settings" title="Apps">
    <section className="workspace-settings-card workspace-apps-card">
      <div className="workspace-settings-card-heading">
        <div>
          <h2>Apps</h2>
          <p>Workspace apps discovered from the local apps directory and governed Data Model configuration.</p>
        </div>
      </div>

      <SettingsAccordionGroup defaultOpenId="workspace-apps">
        <SettingsAccordionSection
          id="workspace-apps"
          title="Workspace Apps"
          summary={`${apps.length} app${apps.length === 1 ? "" : "s"} discovered from directory and config.`}
          className="workspace-apps-list-section"
        >
          <AppsList apps={apps} />
        </SettingsAccordionSection>

        <SettingsAccordionSection
          id="workspace-linkage"
          title="Workspace Linkage"
          summary="Fork, kit, and bridge identity for this workspace."
          className="workspace-apps-linkage-section"
        >
          <div className="workspace-settings-kv">
            <span>Workspace</span><code>{workspaceConfig.id || "workspace-builder-default"}</code>
            <span>Fork</span><code>{fork?.forkId || "local fork metadata unavailable"}</code>
            <span>Kit</span><code>{fork?.kitId || workspaceConfig.provenance?.mirrors || "growthub-custom-workspace-starter-v1"}</code>
            <span>Bridge</span><code>{bridge?.status || bridge?.id || "not connected"}</code>
          </div>
        </SettingsAccordionSection>

        <CodexSitesDataModelCard
          apps={apps}
          dataModel={workspaceConfig.dataModel || {}}
        />
      </SettingsAccordionGroup>
    </section>
  </SettingsShell>;
}

export {
  AppsSettingsPage as default
};
