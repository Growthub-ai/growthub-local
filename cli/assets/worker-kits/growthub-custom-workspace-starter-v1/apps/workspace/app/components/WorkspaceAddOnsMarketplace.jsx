"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  Headphones,
  Link2,
  PlugZap,
  Rocket,
  Search,
  Server,
  Settings,
  X,
} from "lucide-react";
import {
  MARKETPLACE_PROVIDERS,
  findMarketplaceProviderRow,
  findInstalledWorkspaceAddOns,
  findWorkspaceAddOnRows,
  getMarketplaceProduct,
} from "@/lib/workspace-add-ons";
import { VercelCreateAppFlow } from "./VercelCreateAppFlow.jsx";

/**
 * One-click deploy cockpit for the installed Vercel Deployments product.
 * Reads the governed server discovery route (the browser never calls the
 * Vercel API) and hands every mutation — link, deploy — to the governed
 * handlers wired in add-ons-client, so workspace config state and receipts
 * stay authoritative.
 */
function VercelProjectsCockpit({ onLinkProject, onDeployProject, disabled = false }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [busyProject, setBusyProject] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      setLoading(true);
      try {
        const response = await fetch("/api/workspace/add-ons/vercel/projects", { method: "GET" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setProjects([]);
          setMessage(payload?.error || "Vercel projects could not be loaded.");
          return;
        }
        const rows = Array.isArray(payload.projects) ? payload.projects : [];
        setProjects(rows);
        setMessage(rows.length
          ? (payload.hasMore ? "Showing the first 100 projects — the account has more." : "")
          : "No Vercel projects returned for this account.");
      } catch (error) {
        if (!cancelled) {
          setProjects([]);
          setMessage(error?.message || "Vercel projects could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProjects();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function runAction(projectId, action) {
    setBusyProject(`${action}:${projectId}`);
    setMessage("");
    try {
      const payload = action === "deploy"
        ? await onDeployProject?.({ projectId })
        : await onLinkProject?.({ projectId });
      if (payload?.error) {
        setMessage(payload.error);
        return;
      }
      if (action === "deploy" && payload?.deployment) {
        setMessage(`Deployment ${payload.deployment.deploymentId || ""} ${payload.deployment.readyState || "QUEUED"}${payload.deployment.url ? ` → ${payload.deployment.url}` : ""}`.trim());
      }
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setMessage(error?.message || `Project ${action} failed.`);
    } finally {
      setBusyProject("");
    }
  }

  return (
    <div className="dm-marketplace-config" aria-label="Vercel projects">
      <p className="dm-marketplace-section-title"><Rocket size={14} /> Your Vercel Projects</p>
      {loading ? <p className="dm-cockpit-step-hint">Loading projects…</p> : null}
      {!loading && projects.map((project) => (
        <div className="dm-marketplace-adapter" key={project.id}>
          <div>
            <strong>{project.name}</strong>
            <span>
              {[project.framework, project.gitRepo, project.linked ? "linked" : "not linked", project.lastDeployStatus || project.latestDeploymentState]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className="dm-marketplace-card-actions">
            {!project.linked ? (
              <button
                type="button"
                className="dm-btn-outline"
                disabled={disabled || Boolean(busyProject)}
                onClick={() => runAction(project.id, "link")}
              >
                {busyProject === `link:${project.id}` ? "Linking…" : (<><Link2 size={12} aria-hidden /> Link</>)}
              </button>
            ) : null}
            <button
              type="button"
              className="dm-btn-primary-sm"
              disabled={disabled || Boolean(busyProject)}
              onClick={() => runAction(project.id, "deploy")}
            >
              {busyProject === `deploy:${project.id}` ? "Deploying…" : (<><Rocket size={12} aria-hidden /> Deploy</>)}
            </button>
          </div>
        </div>
      ))}
      {message ? <p className="dm-cockpit-step-hint">{message}</p> : null}
      <p className="dm-cockpit-step-hint">
        Deploy auto-links the project as a governed Data Model record (Vercel Projects object) with receipt-backed proof — manage config, redeploy, or link it to workflows from that record.
      </p>
    </div>
  );
}

function AddOnsSurface({
  onConnectProvider,
  onSyncProvider,
  onSaveProviderCredentials,
  onSyncProduct,
  onStorageAction,
  onLinkVercelProject,
  onDeployVercelProject,
  onCustomSetup,
  installing = false,
  activeAction = "",
  errorMessage = "",
  setupMessage = "",
  initialProviderId = "",
  initialIntent = "",
  initialAppId = "",
  envSignals = {},
  workspaceConfig = {},
  onClose,
  shell = "page",
}) {
  const [activePath, setActivePath] = useState("plugins");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [installDrawer, setInstallDrawer] = useState("");
  const [manageDrawer, setManageDrawer] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [plan, setPlan] = useState("free");
  const [resourceOptions, setResourceOptions] = useState([]);
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceMessage, setResourceMessage] = useState("");
  const [installMode, setInstallMode] = useState("existing");
  const [providerCredentialValues, setProviderCredentialValues] = useState({});
  const [storageState, setStorageState] = useState(null);
  const [storageMessage, setStorageMessage] = useState("");
  const [selectedLinkedTableId, setSelectedLinkedTableId] = useState("");
  const [bucketName, setBucketName] = useState("workspace-assets");
  const [bucketAccess, setBucketAccess] = useState("private");
  const [bucketMimeTypes, setBucketMimeTypes] = useState("");
  const [bucketSizeLimit, setBucketSizeLimit] = useState("50MB");
  const persistenceAdapters = Array.isArray(envSignals.persistenceAdapters) ? envSignals.persistenceAdapters : [];
  const installed = useMemo(() => findInstalledWorkspaceAddOns(workspaceConfig), [workspaceConfig]);
  const selectedMarketplaceProvider = MARKETPLACE_PROVIDERS.find((provider) => provider.providerId === selectedProvider) || null;
  const providerProductReadiness = envSignals.providerProductReadiness || {};
  const productReadiness = selectedMarketplaceProvider && envSignals.providerProductReadiness?.[selectedMarketplaceProvider.providerId]
    ? envSignals.providerProductReadiness[selectedMarketplaceProvider.providerId]
    : [];
  const providerRows = useMemo(() => Object.fromEntries(MARKETPLACE_PROVIDERS.map((provider) => [provider.providerId, findMarketplaceProviderRow(workspaceConfig, provider.providerId)])), [workspaceConfig]);
  const visibleMarketplaceProviders = useMemo(
    () => MARKETPLACE_PROVIDERS.filter((provider) => provider.connectorKind !== "growthub-inbound-provider"),
    [],
  );
  const providerRow = selectedMarketplaceProvider ? providerRows[selectedMarketplaceProvider.providerId] : null;
  const providerConnected = Boolean(providerRow?.isConnectedProvider);
  const providerVerified = Boolean(providerRow?.isVerifiedProvider);
  const providerSetupStarted = Boolean(providerRow?.isSetupPendingProvider);
  const providerSetupOpen = providerSetupStarted || Boolean(setupMessage);
  const providerSetupMessage = setupMessage || providerRow?.lastResponse || "";
  const providerSetupFields = Array.isArray(selectedMarketplaceProvider?.accountSetupFields)
    ? selectedMarketplaceProvider.accountSetupFields
    : [];
  const providerSetupNeedsCredentials = !providerConnected && providerSetupFields.length > 0;
  const providerSetupHasBearerToken = providerSetupFields.some((field) => field.credentialRole === "bearerToken" && String(providerCredentialValues[field.id] || "").trim());
  const providerSetupHasDirectProject = providerSetupFields.some((field) => field.credentialRole === "baseUrl" && String(providerCredentialValues[field.id] || "").trim())
    && providerSetupFields.some((field) => field.credentialRole === "secret" && String(providerCredentialValues[field.id] || "").trim());
  const providerSetupRequiredFieldsReady = providerSetupFields.every((field) => {
    if (!field?.required) return true;
    return Boolean(String(providerCredentialValues[field.id] || "").trim());
  });
  const providerSetupReady = providerSetupRequiredFieldsReady
    // Providers with only-optional fields (e.g. Supabase: token OR url+key)
    // still need at least one value before the credentials route can verify.
    && (providerSetupFields.some((field) => field?.required)
      || providerSetupHasBearerToken
      || providerSetupHasDirectProject);
  const allAddOnRows = useMemo(() => findWorkspaceAddOnRows(workspaceConfig), [workspaceConfig]);
  const providerProducts = selectedMarketplaceProvider?.products || [];
  const installedProviderRows = selectedMarketplaceProvider
    ? installed.filter((row) => providerProducts.some((product) => product.productId === row.productId || product.integrationId === row.integrationId))
    : [];
  const installedIds = new Set(installedProviderRows.map((row) => String(row.productId || "").trim()));
  const activeProduct = selectedMarketplaceProvider ? getMarketplaceProduct(selectedMarketplaceProvider.providerId, installDrawer) : null;
  const activeProductIsStorage = activeProduct?.connectorKind === "supabase-storage";
  const managedProduct = selectedMarketplaceProvider ? getMarketplaceProduct(selectedMarketplaceProvider.providerId, manageDrawer) : null;
  const managedSavedRow = managedProduct
    ? allAddOnRows.find((row) => row.productId === managedProduct.productId || row.integrationId === managedProduct.integrationId)
    : null;
  const createResourceDividerLabel = activeProduct?.resourceDiscovery?.createDividerLabel || "";
  const hasExistingResources = providerConnected && resourceOptions.length > 0;
  const showCreateNewOptions = !activeProductIsStorage && (!hasExistingResources || installMode === "new");
  const activeReadiness = productReadiness.find((item) => item.productId === activeProduct?.productId) || null;
  const activeSavedRow = allAddOnRows.find((row) => row.productId === activeProduct?.productId) || null;
  const productInstalled = Boolean(activeSavedRow?.isVerifiedAddOn);
  const providerAccountLabel = providerRow?.Name || selectedMarketplaceProvider?.label || "Provider account";
  const providerAccountRef = providerRow?.authRef || selectedMarketplaceProvider?.authRef || selectedMarketplaceProvider?.providerId || "";
  const providerAccountOptions = useMemo(() => {
    const raw = providerRow?.providerAccountOptions;
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== "string" || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [providerRow]);
  const selectedProviderAccountId = providerRow?.selectedProviderAccountId || providerAccountOptions[0]?.id || "";
  const regionOptions = activeProduct?.regionOptions || [];
  const selectedRegion = regionOptions.find((option) => option.id === region) || regionOptions[0] || { id: region, label: region };
  const readyAdapters = persistenceAdapters.filter((adapter) => adapter.configured);
  const customProviderReady = readyAdapters.length > 0;
  const currentSectionLabel = activePath === "custom" ? "Custom" : "Plugins";
  const selectedProviderLabel = selectedProvider === "custom" ? "Custom Plugin" : (selectedMarketplaceProvider?.label || "Provider");
  const canSyncProduct = Boolean(onSyncProduct);
  const canRunStorageAction = Boolean(onStorageAction);
  const canConnectProvider = Boolean(onConnectProvider);
  const canSyncProvider = Boolean(onSyncProvider);
  const canSaveProviderCredentials = Boolean(onSaveProviderCredentials);
  const inModal = shell === "modal";
  const appDeployIntent = initialIntent === "deploy" && initialProviderId === "vercel" && initialAppId;
  const storageLinkableTables = Array.isArray(storageState?.linkableTables) ? storageState.linkableTables : [];
  const storageCanCreateBucket = Boolean(providerConnected && activeProductIsStorage && canRunStorageAction && String(bucketName || "").trim().length >= 3);
  const details = [
    ["Installed products", String(installed.filter((row) => !selectedMarketplaceProvider || providerProducts.some((product) => product.productId === row.productId)).length)],
    ["Developer", selectedMarketplaceProvider?.developer || "Provider"],
    ["Website", selectedMarketplaceProvider?.websiteUrl || ""],
    ["Documentation", "Read"],
    ["Terms", "Read"],
    ["Privacy Policy", "Read"],
    ["Support", selectedMarketplaceProvider?.supportUrl ? "Open support" : ""],
  ];

  function syncProduct() {
    if (!selectedMarketplaceProvider || !activeProduct) return;
    const selectedResource = resourceOptions.find((item) => item.id === selectedResourceId) || null;
    onSyncProduct?.({
      providerId: selectedMarketplaceProvider.providerId,
      productId: activeProduct.productId,
      region: installMode === "existing" ? selectedResource?.region || region : region,
      plan: installMode === "existing" ? selectedResource?.type || plan : plan,
      selectedResourceId: installMode === "existing" ? selectedResource?.id || "" : "",
      selectedResourceLabel: installMode === "existing" ? selectedResource?.label || "" : "",
      selectedResourceSource: installMode === "existing" ? selectedResource?.source || "" : "",
    });
  }

  async function refreshStorageState() {
    if (!activeProductIsStorage || !onStorageAction) return null;
    setStorageMessage("");
    const result = await onStorageAction({ method: "GET" });
    if (result?.error) {
      setStorageMessage(result.error);
      return null;
    }
    setStorageState(result || null);
    const linked = result?.linkedTableObjectId || result?.linkableTables?.[0]?.objectId || "";
    if (linked) setSelectedLinkedTableId((current) => current || linked);
    return result || null;
  }

  async function createStorageBucketAndInstall() {
    if (!selectedMarketplaceProvider || !activeProduct || !activeProductIsStorage) return;
    setStorageMessage("");
    let state = storageState || await refreshStorageState();
    if (!state) return;
    let linkedTableObjectId = state.linkedTableObjectId || selectedLinkedTableId;
    if (!linkedTableObjectId) {
      const createdTable = await onStorageAction?.({ body: { action: "create-linked-table" } });
      if (createdTable?.error) {
        setStorageMessage(createdTable.error);
        return;
      }
      linkedTableObjectId = createdTable.linkedTableObjectId || "";
      state = {
        ...state,
        linkedTableObjectId,
        linkedTableLabel: createdTable.linkedTableLabel || linkedTableObjectId,
      };
      setStorageState(state);
      if (linkedTableObjectId) setSelectedLinkedTableId(linkedTableObjectId);
    }
    if (!linkedTableObjectId) {
      setStorageMessage("Storage table setup failed.");
      return;
    }
    if (!state.linkedTableObjectId) {
      const linked = await onStorageAction?.({ body: { action: "link-table", linkedTableObjectId } });
      if (linked?.error) {
        setStorageMessage(linked.error);
        return;
      }
    }
    const created = await onStorageAction?.({
      body: {
        action: "create-bucket",
        name: bucketName,
        access: bucketAccess,
        allowedMimeTypes: bucketMimeTypes,
        fileSizeLimit: bucketSizeLimit,
      },
    });
    if (created?.error) {
      setStorageMessage(created.error);
      return;
    }
    setStorageMessage(created?.summary || `Bucket ${created?.bucketId || bucketName} created.`);
    onSyncProduct?.({
      providerId: selectedMarketplaceProvider.providerId,
      productId: activeProduct.productId,
      plan: bucketAccess,
      selectedResourceId: created?.bucketId || "",
      selectedResourceLabel: created?.bucketId || bucketName,
      selectedResourceSource: "/storage/v1/bucket",
    });
  }

  function syncManagedProduct() {
    if (!selectedMarketplaceProvider || !managedProduct) return;
    onSyncProduct?.({
      providerId: selectedMarketplaceProvider.providerId,
      productId: managedProduct.productId,
      region: managedSavedRow?.region || region,
      plan: managedSavedRow?.plan || plan,
      selectedResourceId: managedSavedRow?.selectedResourceId || "",
      selectedResourceLabel: managedSavedRow?.selectedResourceLabel || "",
      selectedResourceSource: managedSavedRow?.selectedResourceSource || "",
    });
  }

  function syncProvider() {
    if (!selectedMarketplaceProvider) return;
    onSyncProvider?.({ providerId: selectedMarketplaceProvider.providerId });
  }

  function connectProvider() {
    if (!selectedMarketplaceProvider) return;
    if (providerSetupFields.length) return;
    const setupUrl = selectedMarketplaceProvider.accountSetupUrl || selectedMarketplaceProvider.consoleUrl;
    if (setupUrl) window.open(setupUrl, `${selectedMarketplaceProvider.providerId}-provider-setup`, "popup,width=1160,height=820");
    onConnectProvider?.({ providerId: selectedMarketplaceProvider.providerId, openedExternally: Boolean(setupUrl) });
  }

  function saveProviderCredentials() {
    if (!selectedMarketplaceProvider) return;
    onSaveProviderCredentials?.({
      providerId: selectedMarketplaceProvider.providerId,
      credentials: providerCredentialValues,
    });
  }

  function updateProviderCredential(fieldId, value) {
    setProviderCredentialValues((current) => ({ ...current, [fieldId]: value }));
  }

  function openProvider(providerId) {
    setSelectedProvider(providerId);
    setInstallDrawer("");
    setManageDrawer("");
  }

  function closeProvider() {
    setSelectedProvider("");
    setInstallDrawer("");
    setManageDrawer("");
  }

  function switchPath(path) {
    setActivePath(path);
    setSelectedProvider("");
    setInstallDrawer("");
    setManageDrawer("");
  }

  function ProductIcon({ product, provider = false }) {
    const src = provider ? selectedMarketplaceProvider?.iconSrc : product?.iconSrc;
    return (
      <span className={`dm-marketplace-product-icon ${provider ? "is-provider" : (product?.iconClass || "is-provider")}`}>
        {src ? <img src={src} alt="" aria-hidden="true" /> : <PlugZap size={18} />}
      </span>
    );
  }

  useEffect(() => {
    if (!selectedMarketplaceProvider || !activeProduct || !providerConnected) {
      setResourceOptions([]);
      setSelectedResourceId("");
      setResourceMessage("");
      return undefined;
    }
    let cancelled = false;
    async function loadResources() {
      setResourceLoading(true);
      setResourceMessage("");
      try {
        const response = await fetch(`/api/workspace/add-ons/providers/${encodeURIComponent(selectedMarketplaceProvider.providerId)}/products/${encodeURIComponent(activeProduct.productId)}/resources`, {
          method: "GET",
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setResourceOptions([]);
          setSelectedResourceId("");
          setResourceMessage(payload?.error || "No provider resources were returned for this product.");
          return;
        }
        const resources = Array.isArray(payload.resources) ? payload.resources : [];
        setResourceOptions(resources);
        setSelectedResourceId(resources[0]?.id || "");
        setInstallMode(resources.length ? "existing" : "new");
        setResourceMessage(resources.length ? "" : "No existing provider resources were returned for this product.");
      } catch (error) {
        if (!cancelled) {
          setResourceOptions([]);
          setSelectedResourceId("");
          setResourceMessage(error?.message || "Provider resources could not be loaded.");
        }
      } finally {
        if (!cancelled) setResourceLoading(false);
      }
    }
    loadResources();
    return () => {
      cancelled = true;
    };
  }, [selectedMarketplaceProvider?.providerId, activeProduct?.productId, providerConnected]);

  useEffect(() => {
    setProviderCredentialValues({});
  }, [selectedMarketplaceProvider?.providerId]);

  useEffect(() => {
    if (!activeProductIsStorage || !providerConnected) {
      setStorageState(null);
      setStorageMessage("");
      return;
    }
    refreshStorageState();
  }, [activeProductIsStorage, providerConnected]);

  useEffect(() => {
    if (!initialProviderId || selectedProvider) return;
    if (!MARKETPLACE_PROVIDERS.some((provider) => provider.providerId === initialProviderId)) return;
    setActivePath("plugins");
    setSelectedProvider(initialProviderId);
  }, [initialProviderId, selectedProvider]);

  return (
    <section className={inModal ? "dm-marketplace-modal" : "dm-marketplace-page"} role={inModal ? "dialog" : undefined} aria-modal={inModal ? "true" : undefined} aria-labelledby="workspace-marketplace-title">
      <header className="dm-marketplace-header">
        <div>
          <nav className="dm-marketplace-breadcrumbs" aria-label="Add-ons breadcrumbs">
            <span>Workspace Marketplace</span>
            <ChevronDown size={12} aria-hidden="true" />
            {selectedProvider ? <button type="button" onClick={closeProvider}>{currentSectionLabel}</button> : <span>{currentSectionLabel}</span>}
            {selectedProvider ? (
              <>
                <ChevronDown size={12} aria-hidden="true" />
                <span>{selectedProviderLabel}</span>
                <ChevronDown size={12} aria-hidden="true" />
                <strong>Installation</strong>
              </>
            ) : null}
          </nav>
          {selectedProvider ? (
            <div className="dm-marketplace-provider-title">
              {selectedProvider === "custom" ? <span className="dm-marketplace-product-icon is-custom"><Database size={18} /></span> : <ProductIcon provider />}
              <div>
                <h2 id="workspace-marketplace-title">{selectedProviderLabel}</h2>
                <p>{selectedProvider === "custom" ? "Governed custom plugins and thin adapters" : (selectedMarketplaceProvider?.providerProductsLabel || selectedMarketplaceProvider?.description || "Provider plugins")}</p>
              </div>
            </div>
          ) : (
            <div>
              <h2 id="workspace-marketplace-title">{currentSectionLabel}</h2>
              <p className="dm-marketplace-subtitle">{activePath === "custom" ? "Register custom providers at the workspace level, then normalize each plugin through governed workspace objects." : "Install provider plugins at the workspace level, then configure products inside each provider."}</p>
            </div>
          )}
        </div>
        {selectedMarketplaceProvider ? <div className="dm-marketplace-provider-actions">
          <button type="button" className="dm-btn-outline">Build in <PlugZap size={13} /></button>
          {selectedMarketplaceProvider.supportUrl ? <a className="dm-btn-outline" href={selectedMarketplaceProvider.supportUrl} target="_blank" rel="noreferrer">Support <Headphones size={13} /></a> : null}
          {providerConnected && installed.some((row) => providerProducts.some((product) => product.productId === row.productId)) && selectedMarketplaceProvider.consoleUrl ? <a className="dm-btn-primary-sm" href={selectedMarketplaceProvider.consoleUrl} target="_blank" rel="noreferrer">Open provider <ExternalLink size={13} /></a> : null}
        </div> : null}
        {onClose ? (
          <button type="button" className="dm-workflow-icon-btn" aria-label="Close Workspace Marketplace" onClick={onClose}>
            <X size={14} />
          </button>
        ) : null}
      </header>
      <div className="dm-marketplace-layout">
        <aside className="dm-marketplace-sidebar" aria-label="Marketplace sections">
          <button type="button" className={activePath === "plugins" ? "is-active" : ""} onClick={() => switchPath("plugins")}>
            <PlugZap size={14} /> Plugins
          </button>
          <button type="button" className={activePath === "custom" ? "is-active" : ""} onClick={() => switchPath("custom")}>
            <Database size={14} /> Custom
          </button>
          {selectedProvider ? <div className="dm-marketplace-setup-nav" aria-label="Install path">
            <span>Install path</span>
            <ol>
              <li className={installDrawer ? "is-active" : ""}>Install</li>
              <li>Setup</li>
              <li>Login/Auth</li>
              <li>Sync</li>
            </ol>
          </div> : null}
        </aside>
        <div className="dm-marketplace-content">
          {errorMessage ? <div className="dm-marketplace-error" role="alert">{errorMessage}</div> : null}
          {selectedProvider === "vercel" && appDeployIntent ? (
            <div className="dm-marketplace-error is-info" role="status">
              Deploying workspace app <strong>{initialAppId}</strong>: connect Vercel, install Deployments, then choose or create the Vercel project for this app.
            </div>
          ) : null}
          {activePath === "plugins" ? (
            <>
              {!selectedProvider ? (
                <div className="dm-marketplace-search-row">
                  <div className="dm-marketplace-search"><Search size={14} /><span>Search plugins</span></div>
                  <button type="button" className="dm-marketplace-filter">Filter by <ChevronDown size={13} /></button>
                  <button type="button" className="dm-marketplace-filter">Sort by <ChevronDown size={13} /></button>
                </div>
              ) : null}

              {!selectedProvider ? (
                <section className="dm-marketplace-products" aria-label="Plugin providers">
                  <h3>Plugin Providers</h3>
                  <div className="dm-marketplace-provider-grid">
                    {visibleMarketplaceProviders.map((provider) => {
                      const row = providerRows[provider.providerId];
                      const connected = Boolean(row?.isConnectedProvider);
                      const verified = Boolean(row?.isVerifiedProvider);
                      const setupStarted = Boolean(row?.isSetupPendingProvider);
                      const installedCount = installed.filter((installedRow) => provider.products.some((product) => product.productId === installedRow.productId)).length;
                      const stateLabel = verified ? "Verified" : setupStarted ? "Setup opened" : "Provider setup required";
                      return (
                        <button type="button" className="dm-marketplace-provider-card" key={provider.providerId} onClick={() => openProvider(provider.providerId)}>
                          <span className="dm-marketplace-product-icon is-provider">
                            {provider.iconSrc ? <img src={provider.iconSrc} alt="" aria-hidden="true" /> : <PlugZap size={18} />}
                          </span>
                          <div>
                            <strong>{provider.label}</strong>
                            <p>{provider.providerProductsLabel || provider.description}</p>
                            <small>{connected ? `${stateLabel} · ${installedCount} installed product${installedCount === 1 ? "" : "s"}` : stateLabel}</small>
                          </div>
                          <span className="dm-btn-outline">{connected ? "Manage" : setupStarted ? "Continue setup" : "Install"}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : (
              <div className="dm-marketplace-provider-layout">
                <div className="dm-marketplace-provider-main">
                  {!providerConnected ? (
                    <section className="dm-marketplace-install-card" aria-label={`${selectedMarketplaceProvider?.label || "Provider"} setup`}>
                      <div className="dm-marketplace-product-head">
                        <ProductIcon provider />
                        <div>
                          <h3>Install {selectedMarketplaceProvider?.label || "provider"}</h3>
                          <p>Connect the provider account once before installing products for this workspace.</p>
                        </div>
                        <span className="dm-db-status"><span />Account setup</span>
                      </div>
                      <div className="dm-marketplace-config">
                        <p className="dm-marketplace-section-title"><Server size={14} /> Provider Account</p>
                        <div className="dm-marketplace-env is-setup">
                          <span>Provider account</span>
                          <code>{selectedMarketplaceProvider?.authRef || selectedMarketplaceProvider?.providerId || "provider-auth"}</code>
                        </div>
                        <p className="dm-cockpit-step-hint">Connect the provider account for this workspace. Product setup unlocks after the provider account is available to the workspace.</p>
                        {providerSetupMessage ? <p className="dm-cockpit-step-hint">{providerSetupMessage}</p> : null}
                        {providerSetupNeedsCredentials ? (
                          <div className="dm-marketplace-credential-grid">
                            {providerSetupFields.map((field) => (
                              <label className="dm-marketplace-field" key={field.id}>
                                <span>{field.label || field.id}</span>
                                <input
                                  value={providerCredentialValues[field.id] || ""}
                                  onChange={(event) => updateProviderCredential(field.id, event.target.value)}
                                  type={field.type || "text"}
                                  autoComplete={field.autocomplete || "off"}
                                  placeholder={field.placeholder || ""}
                                />
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="dm-marketplace-provision-steps">
                        {providerSetupNeedsCredentials ? <div className="is-active dm-marketplace-step-action-row">
                          <span>Account setup</span>
                          <button type="button" className="dm-btn-primary-sm" disabled={installing || !canSaveProviderCredentials || !providerSetupReady} onClick={saveProviderCredentials}>
                            {activeAction === "save-provider" ? "Verifying..." : "Verify and save account"}
                          </button>
                        </div> : <div className="is-active dm-marketplace-step-action-row">
                          <span>Install provider</span>
                          <button type="button" className="dm-btn-primary-sm" disabled={installing || !canConnectProvider} onClick={connectProvider}>
                            {activeAction === "connect" ? "Opening..." : `Set up ${selectedMarketplaceProvider?.label || "provider"}`}
                          </button>
                        </div>}
                        <div>{activeAction === "sync-provider" ? "Syncing account" : "Account sync"}</div>
                        <div>Product marketplace</div>
                      </div>
                    </section>
                  ) : null}

                  {providerConnected && installedProviderRows.length ? (
                    <section className="dm-marketplace-products" aria-label="Installed Products">
                      <h3>Installed Products</h3>
                      <div className="dm-marketplace-product-grid">
                        {installedProviderRows.map((row) => {
                          const product = getMarketplaceProduct(selectedMarketplaceProvider.providerId, row.productId) || getMarketplaceProduct(selectedMarketplaceProvider.providerId, row.integrationId);
                          if (!product) return null;
                          return (
                          <article className="dm-marketplace-product-card" key={row.integrationId}>
                            <ProductIcon product={product} />
                            <div>
                              <strong title={row.Name || product.label}>{row.Name || product.label}</strong>
                              <p title={`${row.selectedResourceLabel || row.status || "draft"} / ${row.syncCheckedAt || row.lastTested || "not synced"}`}>{row.selectedResourceLabel || row.status || "draft"} / {row.syncCheckedAt || row.lastTested || "not synced"}</p>
                              {/* Installed rows are verified by construction
                                  (findInstalledWorkspaceAddOns) — data-lane
                                  products surface on /settings/apps like
                                  GitHub/Vercel governed links. */}
                              {product.executionLane === "workspace-data" ? (
                                <small><a href="/settings/apps">View in workspace apps</a></small>
                              ) : null}
                            </div>
                            <div className="dm-marketplace-card-actions">
                              <button type="button" className="dm-workflow-icon-btn dm-marketplace-gear" aria-label={`Manage ${product.label}`} onClick={() => {
                                setInstallDrawer("");
                                setManageDrawer(product.productId);
                              }}>
                                <Settings size={14} />
                              </button>
                              <span className="dm-db-status ok"><span />Installed</span>
                            </div>
                          </article>
                        );})}
                      </div>
                    </section>
                  ) : null}

                  {providerConnected ? <section className="dm-marketplace-products" aria-label="More Products">
                    <h3>More Products</h3>
                    <div className="dm-marketplace-product-grid">
                      {providerProducts.map((product) => {
                        const readiness = productReadiness.find((item) => item.productId === product.productId);
                        const isInstalled = installedIds.has(product.productId);
                        return (
                          <article className="dm-marketplace-product-card" key={product.productId}>
                            <ProductIcon product={product} />
                            <div>
                              <strong title={product.label}>{product.label}</strong>
                              <p title={product.subtitle}>{product.subtitle}</p>
                              <small title={product.plans}>{product.plans}</small>
                              <small>{readiness?.configured ? "Product refs ready" : "Set up product refs"}</small>
                            </div>
                            <button
                              type="button"
                              className="dm-btn-outline"
                              onClick={() => {
                                if (isInstalled) {
                                  setInstallDrawer("");
                                  setManageDrawer(product.productId);
                                } else {
                                  setManageDrawer("");
                                  setInstallDrawer(product.productId);
                                }
                              }}
                            >
                              {isInstalled ? "Manage" : "Install"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </section> : null}

                  {selectedMarketplaceProvider?.providerId === "vercel" ? (
                    <VercelCreateAppFlow
                      vercelConnected={providerConnected}
                      vercelAccountLabel={providerAccountLabel}
                      onDeployProject={onDeployVercelProject}
                      disabled={installing}
                    />
                  ) : null}

                  <section className="dm-marketplace-overview" aria-label="Overview">
                    <h3>Overview</h3>
                    <p>{providerConnected ? "Install provider products into workflow, data, and retrieval surfaces through the shared API Registry." : "Install the provider account first. Product installation stays locked until the account is linked."}</p>
                  </section>
                </div>
                <aside className="dm-marketplace-details" aria-label="Provider details">
                  <h3>Details</h3>
                  {details.map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      {label === "Website" && selectedMarketplaceProvider?.websiteUrl ? <a href={selectedMarketplaceProvider.websiteUrl} target="_blank" rel="noreferrer">{value}</a>
                        : label === "Documentation" && selectedMarketplaceProvider?.docsUrl ? <a href={selectedMarketplaceProvider.docsUrl} target="_blank" rel="noreferrer">{value} <ExternalLink size={11} /></a>
                        : label === "Terms" && selectedMarketplaceProvider?.termsUrl ? <a href={selectedMarketplaceProvider.termsUrl} target="_blank" rel="noreferrer">{value} <ExternalLink size={11} /></a>
                        : label === "Privacy Policy" && selectedMarketplaceProvider?.privacyUrl ? <a href={selectedMarketplaceProvider.privacyUrl} target="_blank" rel="noreferrer">{value} <ExternalLink size={11} /></a>
                        : label === "Support" && selectedMarketplaceProvider?.supportUrl ? <a href={selectedMarketplaceProvider.supportUrl} target="_blank" rel="noreferrer">{value} <ExternalLink size={11} /></a>
                        : <strong>{value}</strong>}
                    </div>
                  ))}
                </aside>
              </div>
              )}
            </>
          ) : (
            <>
              {!selectedProvider ? (
                <>
                  <div className="dm-marketplace-search-row">
                    <div className="dm-marketplace-search"><Search size={14} /><span>Search custom providers</span></div>
                    <button type="button" className="dm-marketplace-filter">Filter by <ChevronDown size={13} /></button>
                    <button type="button" className="dm-marketplace-filter">Sort by <ChevronDown size={13} /></button>
                  </div>
                  <section className="dm-marketplace-products" aria-label="Custom plugin providers">
                    <h3>Custom Providers</h3>
                    <div className="dm-marketplace-provider-grid">
                      <button type="button" className="dm-marketplace-provider-card" onClick={() => openProvider("custom")}>
                        <span className="dm-marketplace-product-icon is-custom"><Database size={18} /></span>
                        <div>
                          <strong>Custom Plugin</strong>
                          <p>Register owned workers, functions, APIs, and schedulers through the governed API Registry.</p>
                          <small>{customProviderReady ? `${readyAdapters.length} adapter${readyAdapters.length === 1 ? "" : "s"} ready` : "Provider setup required"}</small>
                        </div>
                        <span className="dm-btn-outline">{customProviderReady ? "Open" : "Install"}</span>
                      </button>
                    </div>
                  </section>
                </>
              ) : (
                <div className="dm-marketplace-provider-layout">
                  <div className="dm-marketplace-provider-main">
                    <section className="dm-marketplace-install-card" aria-label="Custom provider setup">
                      <div className="dm-marketplace-product-head">
                        <span className="dm-marketplace-product-icon is-custom"><Database size={18} /></span>
                        <div>
                          <h3>Install Custom Plugin provider</h3>
                          <p>Set the governed adapter and object path once before adding custom workers, functions, APIs, or schedulers.</p>
                        </div>
                        <span className={customProviderReady ? "dm-db-status ok" : "dm-db-status"}><span />{customProviderReady ? "Ready" : "Account setup"}</span>
                      </div>
                      <div className="dm-marketplace-config">
                        <p className="dm-marketplace-section-title"><Server size={14} /> Provider Account</p>
                        <div className={customProviderReady ? "dm-marketplace-env is-ready" : "dm-marketplace-env is-setup"}>
                          <span>Governed adapter binding</span>
                          <code>{customProviderReady ? readyAdapters.map((adapter) => adapter.label).join(", ") : "Configure API Registry / workspace object normalization"}</code>
                        </div>
                        <div className="dm-marketplace-adapters">
                          {persistenceAdapters.map((adapter) => (
                            <div key={adapter.id} className={adapter.configured ? "dm-marketplace-adapter is-ready" : "dm-marketplace-adapter"}>
                              <div>
                                <strong>{adapter.label}</strong>
                                <span>{adapter.mode}</span>
                              </div>
                              <code>{adapter.configured ? "ready" : "setup required"}</code>
                            </div>
                          ))}
                          {!persistenceAdapters.length ? <p className="dm-cockpit-step-desc">No adapter signal returned yet. Reopen after env-status responds.</p> : null}
                        </div>
                        <p className="dm-cockpit-step-hint">Custom plugins enter through the existing governed API/Webhooks path so credentials stay server-side and workspace config stores only refs, object bindings, and registry metadata.</p>
                      </div>
                      <div className="dm-marketplace-provision-steps">
                        <div className="is-active">Install provider</div>
                        <div>Account setup</div>
                        <div>Governed object</div>
                        <div>Plugin products</div>
                      </div>
                      <footer className="dm-marketplace-actions">
                        <button type="button" className="dm-btn-primary-sm" disabled={installing || !onCustomSetup} onClick={onCustomSetup}>
                          Configure custom
                        </button>
                      </footer>
                    </section>

                    {customProviderReady ? (
                      <section className="dm-marketplace-products" aria-label="Custom plugin products">
                        <h3>Plugin Products</h3>
                        <div className="dm-marketplace-product-grid">
                          <article className="dm-marketplace-product-card">
                            <span className="dm-marketplace-product-icon is-custom"><Database size={18} /></span>
                            <div>
                              <strong>Add custom plugin</strong>
                              <p>Normalize an owned worker, edge function, API, or scheduler into the workspace governance model.</p>
                              <small>API Registry, source records, business object binding</small>
                            </div>
                            <button type="button" className="dm-btn-outline" disabled={installing || !onCustomSetup} onClick={onCustomSetup}>
                              Configure
                            </button>
                          </article>
                        </div>
                      </section>
                    ) : null}
                  </div>
                  <aside className="dm-marketplace-details" aria-label="Custom provider details">
                    <h3>Details</h3>
                    <div><span>Provider</span><strong>Custom</strong></div>
                    <div><span>Installed products</span><strong>0</strong></div>
                    <div><span>Governance</span><strong>API Registry</strong></div>
                    <div><span>Secrets</span><strong>Server-side refs</strong></div>
                    <div><span>Objects</span><strong>Workspace Data Model</strong></div>
                  </aside>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {manageDrawer && managedProduct ? (
        <div className="dm-marketplace-install-drawer" role="dialog" aria-modal="true" aria-label={`Manage ${managedProduct.label}`}>
          <section className="dm-marketplace-install-card">
            <header className="dm-marketplace-drawer-head">
              <h3>Manage Product</h3>
              <button type="button" className="dm-workflow-icon-btn" aria-label="Close manage drawer" onClick={() => setManageDrawer("")}>
                <X size={14} />
              </button>
            </header>
            <div className="dm-marketplace-product-head">
              <ProductIcon product={managedProduct} />
              <div>
                <h3>{managedSavedRow?.Name || managedProduct.label}</h3>
                <p>{managedProduct.subtitle || "Installed workspace add-on"}</p>
              </div>
            </div>
            <div className="dm-marketplace-config">
              <p className="dm-marketplace-section-title"><Server size={14} /> Installed Binding</p>
              <div className="dm-marketplace-config-summary">
                <div><span>Status</span><code>{managedSavedRow?.isVerifiedAddOn ? "verified" : managedSavedRow?.status || "setup required"}</code></div>
                <div><span>Provider</span><code>{selectedMarketplaceProvider?.label || "Provider"}</code></div>
                <div><span>Product</span><code>{managedProduct.shortLabel || managedProduct.label}</code></div>
                <div><span>Resource</span><code>{managedSavedRow?.selectedResourceLabel || managedSavedRow?.selectedResourceId || "No existing resource binding stored"}</code></div>
                <div><span>Resource source</span><code>{managedSavedRow?.selectedResourceSource || "not stored"}</code></div>
                <div><span>Region</span><code>{managedSavedRow?.region || "not stored"}</code></div>
                <div><span>Plan</span><code>{managedSavedRow?.plan || "not stored"}</code></div>
                <div><span>Auth ref</span><code>{managedSavedRow?.authRef || managedProduct.authRef}</code></div>
                <div><span>Resolved env</span><code>{managedSavedRow?.resolvedEnv || "not resolved"}</code></div>
                <div><span>Last sync</span><code>{managedSavedRow?.syncCheckedAt || managedSavedRow?.lastTested || "not synced"}</code></div>
                <div><span>Proof</span><code>{managedSavedRow?.syncProof || "no provider proof stored"}</code></div>
              </div>
              <p className="dm-cockpit-step-hint">This installed product row is the workspace binding used by workflow canvas upgrades and activation.</p>
            </div>
            {selectedMarketplaceProvider?.providerId === "vercel" && managedProduct.productId === "vercel-deployments" && managedSavedRow?.isVerifiedAddOn ? (
              <VercelProjectsCockpit
                onLinkProject={onLinkVercelProject}
                onDeployProject={onDeployVercelProject}
                disabled={installing}
              />
            ) : null}
            <footer className="dm-marketplace-actions">
              {managedSavedRow?.isVerifiedAddOn && managedProduct.executionLane === "workspace-data" ? <a className="dm-btn-outline dm-marketplace-console-link" href="/settings/apps">
                View in workspace apps
              </a> : null}
              {managedProduct.consoleUrl ? <a className="dm-btn-outline dm-marketplace-console-link" href={managedProduct.consoleUrl} target="_blank" rel="noreferrer">
                Open provider <ExternalLink size={13} />
              </a> : null}
              <button type="button" className="dm-btn-outline" onClick={() => setManageDrawer("")}>Close</button>
              <button type="button" className="dm-btn-primary-sm" disabled={installing || !providerConnected || !canSyncProduct || !managedSavedRow} onClick={syncManagedProduct}>
                {activeAction === "sync-product" ? "Resyncing..." : "Resync product"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {installDrawer && activeProduct ? (
        <div className="dm-marketplace-install-drawer" role="dialog" aria-modal="true" aria-label={`Install ${activeProduct.label}`}>
          <section className="dm-marketplace-install-card">
            <header className="dm-marketplace-drawer-head">
              <h3>Install Integration</h3>
              <button type="button" className="dm-workflow-icon-btn" aria-label="Close install drawer" onClick={() => setInstallDrawer("")}>
                <X size={14} />
              </button>
            </header>
            <div className="dm-marketplace-product-head">
              <ProductIcon product={activeProduct} />
              <div>
                <h3>{activeProduct.label}</h3>
                <p>{activeProduct.subtitle || "Workspace add-on"}</p>
              </div>
            </div>
            <div className="dm-marketplace-config">
              <p className="dm-marketplace-section-title"><Server size={14} /> {activeProductIsStorage ? "Bucket Configuration" : "Configuration and Plan"}</p>
              {activeProductIsStorage ? (
                <>
                  {storageState?.linkedTableObjectId || storageLinkableTables.length ? (
                    <label className="dm-marketplace-field">
                      <span>File records table</span>
                      <select
                        value={storageState?.linkedTableObjectId || selectedLinkedTableId}
                        onChange={(event) => setSelectedLinkedTableId(event.target.value)}
                        disabled={Boolean(storageState?.linkedTableObjectId) || !storageLinkableTables.length}
                      >
                        {storageState?.linkedTableObjectId ? (
                          <option value={storageState.linkedTableObjectId}>{storageState.linkedTableLabel || storageState.linkedTableObjectId}</option>
                        ) : storageLinkableTables.map((table) => (
                          <option key={table.objectId} value={table.objectId}>{table.label || table.objectId}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="dm-marketplace-field">
                    <span>Bucket name</span>
                    <input value={bucketName} onChange={(event) => setBucketName(event.target.value)} placeholder="workspace-assets" />
                  </label>
                  <label className="dm-marketplace-field">
                    <span>Access</span>
                    <select value={bucketAccess} onChange={(event) => setBucketAccess(event.target.value)}>
                      <option value="private">Private</option>
                      <option value="public">Public CDN</option>
                    </select>
                  </label>
                  <label className="dm-marketplace-field">
                    <span>Allowed MIME types</span>
                    <input value={bucketMimeTypes} onChange={(event) => setBucketMimeTypes(event.target.value)} placeholder="image/png, image/*" />
                  </label>
                  <label className="dm-marketplace-field">
                    <span>File size limit</span>
                    <input value={bucketSizeLimit} onChange={(event) => setBucketSizeLimit(event.target.value)} placeholder="50MB" />
                  </label>
                  {storageMessage ? <p className="dm-cockpit-step-hint">{storageMessage}</p> : null}
                </>
              ) : regionOptions.length ? (
                <>
                  <label className="dm-marketplace-field">
                    <span>Primary Region</span>
                    <select value={region} onChange={(event) => setRegion(event.target.value)}>
                      {regionOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <p className="dm-cockpit-step-hint">Select the deployment region for this product.</p>
                </>
              ) : (
                <p className="dm-cockpit-step-hint">Sync registers the workspace row after the provider account is connected.</p>
              )}
              {providerConnected && !activeProductIsStorage ? (
                providerAccountOptions.length ? (
                  <label className="dm-marketplace-field">
                    <span>Connected {selectedMarketplaceProvider?.label || "provider"} account</span>
                    <select value={selectedProviderAccountId} onChange={() => {}}>
                      {providerAccountOptions.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.label}{account.role ? ` - ${account.role}` : ""}{account.plan ? ` - ${account.plan}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="dm-marketplace-account-unavailable">
                    <strong>Provider account details unavailable</strong>
                    <span>Account lookup needs this provider's account API credentials in this runtime. Product install still validates the selected product server-side.</span>
                  </div>
                )
              ) : null}
              {providerConnected && !activeProductIsStorage ? (
                <div className="dm-marketplace-install-choice">
                  <div>
                    <strong>Use existing provider resource</strong>
                    <span>Select an existing account resource and bind it to this workspace.</span>
                  </div>
                  <label className="dm-marketplace-field">
                    <span>{resourceLoading ? "Loading existing resources" : "Existing provider resource"}</span>
                    <select value={selectedResourceId} onChange={(event) => {
                      setSelectedResourceId(event.target.value);
                      setInstallMode("existing");
                    }} disabled={resourceLoading || !resourceOptions.length}>
                      {resourceOptions.length ? resourceOptions.map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.label}{resource.region ? ` - ${resource.region}` : ""}
                        </option>
                      )) : <option value="">No existing resource found</option>}
                    </select>
                  </label>
                </div>
              ) : null}
              {providerConnected && !activeProductIsStorage && resourceMessage ? <p className="dm-cockpit-step-hint">{resourceMessage}</p> : null}
              {providerConnected && !activeProductIsStorage && createResourceDividerLabel ? (
                <div className="dm-marketplace-resource-divider" role="separator" aria-label={createResourceDividerLabel}>
                  <span>{createResourceDividerLabel}</span>
                </div>
              ) : null}
              {showCreateNewOptions ? (
                <div className="dm-marketplace-plan-list" aria-label="New resource plan">
                  {[
                    ["free", "Free", "Perfect for prototypes and hobby projects."],
                    ["payg", "Pay As You Go", "For use cases with bursting traffic."],
                    ["fixed-1m", "Fixed", "For businesses with consistent high-capacity loads."],
                  ].map(([id, label, desc]) => (
                    <button key={id} type="button" className={plan === id ? "dm-marketplace-plan is-selected" : "dm-marketplace-plan"} onClick={() => {
                      setInstallMode("new");
                      setPlan(id);
                    }}>
                      <span><b>{label}</b> {desc}</span>
                      {plan === id ? <CheckCircle2 size={15} /> : <span className="dm-marketplace-radio" />}
                    </button>
                  ))}
                </div>
              ) : activeProductIsStorage ? null : (
                <button type="button" className="dm-btn-outline dm-marketplace-create-new-btn" onClick={() => setInstallMode("new")}>
                  Configure new resource
                </button>
              )}
              <div className={activeProductIsStorage ? (storageCanCreateBucket ? "dm-marketplace-env is-ready" : "dm-marketplace-env is-setup") : (activeReadiness?.configured ? "dm-marketplace-env is-ready" : "dm-marketplace-env is-setup")}>
                <span>{activeSavedRow?.isVerifiedAddOn ? "Product installed" : activeProductIsStorage ? (storageCanCreateBucket ? "Ready to create bucket" : "Bucket setup required") : providerConnected ? "Ready to install product" : "Provider setup required"}</span>
                <code>{activeProductIsStorage ? `${activeProduct.shortLabel || activeProduct.label} / ${bucketAccess}` : installMode === "existing" && selectedResourceId ? (resourceOptions.find((item) => item.id === selectedResourceId)?.label || selectedResourceId) : regionOptions.length ? `${selectedRegion.label} / ${plan}` : `${activeProduct.shortLabel || activeProduct.label} / ${plan}`}</code>
              </div>
              {activeSavedRow ? (
                <div className="dm-marketplace-config-summary">
                  <div><span>Status</span><code>{activeSavedRow.isVerifiedAddOn ? "verified" : "setup required"}</code></div>
                  <div><span>Auth ref</span><code>{activeSavedRow.authRef || activeProduct.authRef}</code></div>
                  <div><span>Base URL</span><code>{activeSavedRow.baseUrl || "pending provider sync"}</code></div>
                  <div><span>Last sync</span><code>{activeSavedRow.syncCheckedAt || activeSavedRow.lastTested || "not synced"}</code></div>
                  <div><span>Proof</span><code>{activeSavedRow.syncProof || "no provider proof stored"}</code></div>
                </div>
              ) : null}
              <div className="dm-cockpit-step-hint">
                {providerConnected
                  ? activeProductIsStorage
                    ? "Create bucket calls the governed storage route, creates or binds the file records table, creates the Supabase bucket, reads it back, and records the storage product."
                    : "Install calls the product sync route, validates the product credentials server-side, and writes the product API Registry row into workspace config."
                    : "Set up the provider account first. Return here after provider setup, then Sync provider to unlock product install."}
              </div>
            </div>
            {!providerConnected ? (
              <div className="dm-marketplace-provision-steps">
                <div className="is-active dm-marketplace-step-action-row">
                  <span>Provider account</span>
                  <button type="button" className="dm-btn-primary-sm" disabled={installing || !canConnectProvider} onClick={connectProvider}>
                    {activeAction === "connect" ? "Opening..." : "Set up provider account"}
                  </button>
                </div>
              </div>
            ) : null}
            <footer className="dm-marketplace-actions">
              {activeSavedRow?.isVerifiedAddOn && activeProduct.executionLane === "workspace-data" ? <a className="dm-btn-outline dm-marketplace-console-link" href="/settings/apps">
                View in workspace apps
              </a> : null}
              {activeSavedRow?.isVerifiedAddOn && activeProduct.consoleUrl ? <a className="dm-btn-outline dm-marketplace-console-link" href={activeProduct.consoleUrl} target="_blank" rel="noreferrer">
                Open provider <ExternalLink size={13} />
              </a> : null}
              <button type="button" className="dm-btn-outline" onClick={() => setInstallDrawer("")}>Cancel</button>
              <button
                type="button"
                className="dm-btn-primary-sm"
                disabled={installing || !providerConnected || (activeProductIsStorage ? !storageCanCreateBucket : !canSyncProduct)}
                onClick={activeProductIsStorage ? createStorageBucketAndInstall : syncProduct}
              >
                {activeAction === "sync-product" || activeAction === "storage-action" ? "Installing..." : activeSavedRow ? "Resync product" : activeProductIsStorage ? "Create bucket and install" : "Install product"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function WorkspaceAddOnsMarketplace(props) {
  if (props.open === false) return null;
  if (props.shell === "modal") {
    return <div className="dm-marketplace-backdrop" role="presentation">
      <AddOnsSurface {...props} />
    </div>;
  }
  return <AddOnsSurface {...props} />;
}

export {
  WorkspaceAddOnsMarketplace
};
