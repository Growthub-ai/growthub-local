import { SettingsShell } from "../settings-shell.jsx";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { VERCEL_PROJECTS_OBJECT_ID, listInstalledDataProducts, listInstalledStorageProducts } from "@/lib/workspace-add-ons";
import { deriveExternalSyncFreshness, listExternalSyncObjects } from "@/lib/workspace-external-sync";
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
  const appRegistryObject = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .find((object) => String(object?.id || "").trim() === "workspace-app-registry" || String(object?.objectType || "").trim() === "app-surface");
  const registryApps = Array.isArray(appRegistryObject?.rows)
    ? appRegistryObject.rows.map((row) => ({
        id: String(row.appId || row.Name || "").trim(),
        name: String(row.Name || row.appId || "").trim(),
        description: String(row.description || "").trim(),
        provider: String(row.packageName || row.framework || "workspace").trim(),
        source: String(row.surfacePath || "").trim(),
        authority: "data-model",
        status: String(row.status || "available").trim(),
        githubRepo: row.githubRepo,
        githubRepoUrl: row.githubRepoUrl,
        repositoryUrl: row.repositoryUrl,
        vercelProjectUrl: row.vercelProjectUrl,
        deploymentUrl: row.deploymentUrl,
      })).filter((row) => row.id)
    : [];
  const appsById = new Map(directoryApps.map((item) => [item.id, item]));
  for (const item of configApps) {
    const id = item.id || item.name;
    if (!id) continue;
    appsById.set(id, { ...(appsById.get(id) || {}), ...item });
  }
  for (const item of registryApps) {
    appsById.set(item.id, { ...(appsById.get(item.id) || {}), ...item });
  }
  const apps = withDeploymentSetupActions(attachExternalAppLinks(Array.from(appsById.values()), workspaceConfig));
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

function ensureHttpsUrl(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean.replace(/^\/+/, "")}`;
}

function githubRepoUrl(value) {
  const repo = String(value || "").trim().replace(/^https?:\/\/github\.com\//i, "");
  if (!repo || !repo.includes("/")) return "";
  return `https://github.com/${repo.replace(/^\/+|\/+$/g, "")}`;
}

function linkFromAppRow(app) {
  const externalLinks = [];
  const repoValue = app.githubRepo || app.githubRepoUrl || app.repositoryUrl;
  const repoHref = githubRepoUrl(repoValue);
  if (repoHref) {
    const repoDetail = String(app.githubRepo || repoValue).trim().replace(/^https?:\/\/github\.com\//i, "");
    externalLinks.push({
      id: `github:${repoDetail}`,
      label: "GitHub repository",
      detail: repoDetail,
      href: repoHref,
      iconSrc: "/integrations/github/provider.png",
    });
  }
  const deploymentHref = ensureHttpsUrl(app.deploymentUrl || app.vercelDeploymentUrl || app.vercelProjectUrl);
  if (deploymentHref) {
    externalLinks.push({
      id: `vercel:${deploymentHref}`,
      label: app.deploymentUrl || app.vercelDeploymentUrl ? "Vercel deployment" : "Vercel project",
      detail: deploymentHref,
      href: deploymentHref,
      iconSrc: "/integrations/vercel/provider.png",
    });
  }
  return externalLinks;
}

function appMatchesProject(app, project, appCount) {
  if (appCount === 1) return true;
  const source = String(app?.source || "").trim().toLowerCase();
  const appId = String(app?.id || app?.name || "").trim().toLowerCase();
  const name = String(project?.Name || "").trim().toLowerCase();
  const repo = String(project?.gitRepo || "").trim().toLowerCase();
  return Boolean((source && repo.includes(source))
    || (appId && (name === appId || repo.endsWith(`/${appId}`) || repo.includes(`/${appId}-`))));
}

/**
 * External database link for an installed + verified data-lane product row
 * (executionLane === "workspace-data"). Same governed-row derivation as the
 * GitHub/Vercel links: the api-registry row is the truth, the link points at
 * the provider console for the bound project, and the label reflects the
 * row's sync state. Rows carry env-ref names and routing metadata only —
 * never secret values — so everything here is safe to render.
 */
function dataProductLink(row) {
  const providerId = String(row?.integrationId || "").trim().split("-")[0] || "data";
  const projectUrl = ensureHttpsUrl(row?.baseUrl || row?.selectedResourceLabel);
  let host = "";
  try {
    host = projectUrl ? new URL(projectUrl).host : "";
  } catch {
    host = "";
  }
  // Supabase project ref = the <ref>.supabase.co host prefix; deep-link the
  // provider dashboard when we can, fall back to the bound project URL.
  const supabaseRef = /\.supabase\.co$/i.test(host) ? host.split(".")[0] : "";
  const href = supabaseRef
    ? `https://supabase.com/dashboard/project/${supabaseRef}`
    : projectUrl;
  if (!href) return null;
  const providerLabel = providerId.charAt(0).toUpperCase() + providerId.slice(1);
  const synced = String(row?.syncStatus || "").trim() === "verified";
  return {
    id: `${providerId}:${row.integrationId}:${host || href}`,
    label: synced ? `${providerLabel} database` : `${providerLabel} project`,
    detail: host || row?.Name || href,
    href,
    iconSrc: `/integrations/${providerId}/postgrest.png`,
  };
}

/**
 * External storage/CDN link for an installed + verified storage-lane product
 * row (executionLane === "workspace-storage"). Same governed-row derivation
 * as the database link; the icon is the product's own storage badge and the
 * link deep-links the provider's storage console for the bound project.
 */
function storageProductLink(row) {
  const providerId = String(row?.integrationId || "").trim().split("-")[0] || "storage";
  const projectUrl = ensureHttpsUrl(row?.baseUrl);
  let host = "";
  try {
    host = projectUrl ? new URL(projectUrl).host : "";
  } catch {
    host = "";
  }
  const supabaseRef = /\.supabase\.co$/i.test(host) ? host.split(".")[0] : "";
  const href = supabaseRef
    ? `https://supabase.com/dashboard/project/${supabaseRef}/storage/buckets`
    : projectUrl;
  if (!href) return null;
  const providerLabel = providerId.charAt(0).toUpperCase() + providerId.slice(1);
  return {
    id: `${providerId}:${row.integrationId}:${host || href}`,
    label: `${providerLabel} storage`,
    detail: host || row?.Name || href,
    href,
    iconSrc: `/integrations/${providerId}/storage.png`,
  };
}

function attachExternalAppLinks(apps, workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const vercelObject = objects.find((object) => String(object?.id || "").trim() === VERCEL_PROJECTS_OBJECT_ID);
  const projects = Array.isArray(vercelObject?.rows) ? vercelObject.rows : [];
  // Installed + verified database products (Supabase today) — the exact rule
  // the marketplace uses (findInstalledWorkspaceAddOns), lane-derived so any
  // future data provider joins with zero changes here.
  const dataProducts = listInstalledDataProducts(workspaceConfig);
  const storageProducts = listInstalledStorageProducts(workspaceConfig);
  const dataProofs = deriveExternalDataProofs(workspaceConfig);
  return apps.map((app) => {
    const externalLinks = linkFromAppRow(app);
    for (const project of projects) {
      if (!appMatchesProject(app, project, apps.length)) continue;
      const repoHref = githubRepoUrl(project.gitRepo);
      if (repoHref) {
        externalLinks.push({
          id: `github:${project.projectId || project.gitRepo}`,
          label: "GitHub repository",
          detail: project.gitRepo,
          href: repoHref,
          iconSrc: "/integrations/github/provider.png",
        });
      }
      const deploymentHref = ensureHttpsUrl(project.latestDeploymentUrl || project.dashboardUrl);
      if (deploymentHref) {
        externalLinks.push({
          id: `vercel:${project.projectId || project.latestDeploymentUrl}`,
          label: project.latestDeploymentUrl ? "Vercel deployment" : "Vercel project",
          detail: project.latestDeploymentUrl || project.Name,
          href: deploymentHref,
          iconSrc: "/integrations/vercel/provider.png",
        });
      }
    }
    // The bound external database serves the workspace app surface — attach
    // to the workspace app (and to a sole app, same rule appMatchesProject
    // uses for a single-app workspace).
    const isWorkspaceApp = String(app?.id || app?.name || "").trim().toLowerCase() === "workspace";
    if (isWorkspaceApp || apps.length === 1) {
      for (const row of dataProducts) {
        const link = dataProductLink(row);
        if (link) externalLinks.push(link);
      }
      for (const row of storageProducts) {
        const link = storageProductLink(row);
        if (link) externalLinks.push(link);
      }
    }
    const deduped = Array.from(new Map(externalLinks.map((link) => {
      const stableHref = String(link.href || "").trim().replace(/\/+$/g, "");
      const stableProvider = String(link.iconSrc || link.label || "").trim();
      return [`${stableProvider}:${stableHref}`, link];
    })).values());
    const nextApp = deduped.length ? { ...app, externalLinks: deduped } : app;
    if ((isWorkspaceApp || apps.length === 1) && dataProofs.length) {
      return { ...nextApp, dataProofs };
    }
    return nextApp;
  });
}

function deriveExternalDataProofs(workspaceConfig) {
  const proofs = [];
  for (const object of listExternalSyncObjects(workspaceConfig)) {
    const freshness = deriveExternalSyncFreshness(object, { now: new Date().toISOString() });
    const state = String(freshness?.state || "unbound").trim();
    proofs.push({
      objectId: String(object?.id || object?.externalTable || "").trim(),
      kind: "database",
      state,
      label: String(object?.label || object?.name || object?.externalTable || "External table").trim(),
      detail: state === "synced"
        ? `synced proof ${String(object?.lastSyncReceiptId || "").trim() || "recorded"}`
        : state.replace(/-/g, " "),
      causeChain: freshness?.causeChain || [],
    });
  }
  const storageObjects = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .filter((object) => String(object?.storageProduct || "").trim() && String(object?.linkedTableObjectId || "").trim());
  for (const object of storageObjects) {
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    proofs.push({
      objectId: String(object.id || object.storageProduct).trim(),
      kind: "storage",
      state: rows.length ? "synced" : "ready",
      label: String(object.label || "Storage buckets").trim(),
      detail: rows.length ? `${rows.length} bucket${rows.length === 1 ? "" : "s"} linked` : "linked table ready",
      causeChain: [
        `linked to governed table ${String(object.linkedTableObjectId || "").trim()}`,
        `${rows.length} governed bucket row${rows.length === 1 ? "" : "s"}`,
      ],
    });
  }
  return proofs;
}

function withDeploymentSetupActions(apps) {
  return apps.map((app) => {
    if (Array.isArray(app.externalLinks) && app.externalLinks.length) return app;
    const appId = String(app.id || app.name || "").trim();
    if (!appId || String(app.authority || "").trim() !== "directory") return app;
    const params = new URLSearchParams({
      provider: "vercel",
      intent: "deploy",
      app: appId,
      source: String(app.source || "").trim(),
    });
    return { ...app, deploymentSetupHref: `/settings/add-ons?${params.toString()}` };
  });
}

export {
  AppsSettingsPage as default
};
