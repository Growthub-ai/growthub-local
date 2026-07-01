"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  Headphones,
  PlugZap,
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

// Category labels + display order for the scaled marketplace. Grouping is a
// pure presentation arrangement of the governed catalog — it changes nothing
// about the click-path (browse → connect → save credentials → sync product).
const CATEGORY_LABELS = {
  infrastructure: "Infrastructure",
  deploy: "Deploy",
  data: "Data",
  messaging: "Messaging",
  payments: "Payments",
  "ai-inference": "AI Inference",
  retrieval: "Retrieval",
  vector: "Retrieval",
  telephony: "Telephony",
  devtools: "Dev Tools",
  edge: "Edge",
  "project-management": "Project Management",
};
const CATEGORY_ORDER = ["infrastructure", "deploy", "data", "messaging", "ai-inference", "retrieval", "vector", "payments", "telephony", "devtools", "edge", "project-management"];

function AddOnsSurface({
  onConnectProvider,
  onSyncProvider,
  onSaveProviderCredentials,
  onSyncProduct,
  onCustomSetup,
  installing = false,
  activeAction = "",
  errorMessage = "",
  setupMessage = "",
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
  const [pluginQuery, setPluginQuery] = useState("");
  const persistenceAdapters = Array.isArray(envSignals.persistenceAdapters) ? envSignals.persistenceAdapters : [];
  const installed = useMemo(() => findInstalledWorkspaceAddOns(workspaceConfig), [workspaceConfig]);
  const selectedMarketplaceProvider = MARKETPLACE_PROVIDERS.find((provider) => provider.providerId === selectedProvider) || null;
  const providerProductReadiness = envSignals.providerProductReadiness || {};
  const productReadiness = selectedMarketplaceProvider && envSignals.providerProductReadiness?.[selectedMarketplaceProvider.providerId]
    ? envSignals.providerProductReadiness[selectedMarketplaceProvider.providerId]
    : [];
  const providerRows = useMemo(() => Object.fromEntries(MARKETPLACE_PROVIDERS.map((provider) => [provider.providerId, findMarketplaceProviderRow(workspaceConfig, provider.providerId)])), [workspaceConfig]);
  const providerRow = selectedMarketplaceProvider ? providerRows[selectedMarketplaceProvider.providerId] : null;
  const providerConnected = Boolean(providerRow?.isConnectedProvider);
  const providerVerified = Boolean(providerRow?.isVerifiedProvider);
  const providerSetupStarted = Boolean(providerRow?.isSetupPendingProvider);
  const providerSetupOpen = providerSetupStarted || Boolean(setupMessage);
  const providerSetupMessage = setupMessage || providerRow?.lastResponse || "";
  const providerSetupFields = Array.isArray(selectedMarketplaceProvider?.accountSetupFields)
    ? selectedMarketplaceProvider.accountSetupFields
    : [];
  const providerSetupNeedsCredentials = providerSetupOpen && providerSetupFields.length > 0;
  const providerSetupReady = providerSetupFields.every((field) => {
    if (!field?.required) return true;
    return Boolean(String(providerCredentialValues[field.id] || "").trim());
  });
  const allAddOnRows = useMemo(() => findWorkspaceAddOnRows(workspaceConfig), [workspaceConfig]);
  const providerProducts = selectedMarketplaceProvider?.products || [];
  const installedProviderRows = selectedMarketplaceProvider
    ? installed.filter((row) => providerProducts.some((product) => product.productId === row.productId || product.integrationId === row.integrationId))
    : [];
  const installedIds = new Set(installedProviderRows.map((row) => String(row.productId || "").trim()));
  const activeProduct = selectedMarketplaceProvider ? getMarketplaceProduct(selectedMarketplaceProvider.providerId, installDrawer) : null;
  const managedProduct = selectedMarketplaceProvider ? getMarketplaceProduct(selectedMarketplaceProvider.providerId, manageDrawer) : null;
  const managedSavedRow = managedProduct
    ? allAddOnRows.find((row) => row.productId === managedProduct.productId || row.integrationId === managedProduct.integrationId)
    : null;
  const createResourceDividerLabel = activeProduct?.resourceDiscovery?.createDividerLabel || "";
  const hasExistingResources = providerConnected && resourceOptions.length > 0;
  const showCreateNewOptions = !hasExistingResources || installMode === "new";
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
  const canConnectProvider = Boolean(onConnectProvider);
  const canSyncProvider = Boolean(onSyncProvider);
  const canSaveProviderCredentials = Boolean(onSaveProviderCredentials);
  const inModal = shell === "modal";
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

  function renderProviderCard(provider) {
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
  }

  // Provider list grouped by category + filtered by the search box. Pure
  // presentation over the governed MARKETPLACE_PROVIDERS catalog.
  const pluginCategoryGroups = useMemo(() => {
    const q = pluginQuery.trim().toLowerCase();
    const matches = MARKETPLACE_PROVIDERS.filter((provider) => {
      if (!q) return true;
      return [provider.label, provider.category, provider.providerProductsLabel, provider.description]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
    });
    const byCategory = new Map();
    for (const provider of matches) {
      const cat = provider.category || "infrastructure";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(provider);
    }
    return [...byCategory.keys()]
      .sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a);
        const ib = CATEGORY_ORDER.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      })
      .map((cat) => ({ cat, providers: byCategory.get(cat) }));
  }, [pluginQuery, providerRows, installed]);

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
                <p>{selectedProvider === "custom" ? "Governed custom plugins and thin adapters" : "Serverless DB (Redis, Vector, Queue, Search)"}</p>
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
          {activePath === "plugins" ? (
            <>
              {!selectedProvider ? (
                <div className="dm-marketplace-search-row">
                  <div className="dm-marketplace-search">
                    <Search size={14} />
                    <input
                      type="text"
                      value={pluginQuery}
                      onChange={(event) => setPluginQuery(event.target.value)}
                      placeholder="Search plugins by name or category"
                      aria-label="Search plugins"
                    />
                  </div>
                  <button type="button" className="dm-marketplace-filter">Filter by <ChevronDown size={13} /></button>
                  <button type="button" className="dm-marketplace-filter">Sort by <ChevronDown size={13} /></button>
                </div>
              ) : null}

              {!selectedProvider ? (
                <section className="dm-marketplace-products" aria-label="Plugin providers">
                  <h3>Plugin Providers</h3>
                  {pluginCategoryGroups.length ? pluginCategoryGroups.map(({ cat, providers }) => (
                    <div className="dm-marketplace-category" key={cat}>
                      <p className="dm-marketplace-category-label">{CATEGORY_LABELS[cat] || cat} · {providers.length}</p>
                      <div className="dm-marketplace-provider-grid">
                        {providers.map((provider) => renderProviderCard(provider))}
                      </div>
                    </div>
                  )) : <p className="dm-cockpit-step-hint">No plugins match “{pluginQuery}”.</p>}
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
                        <div className="is-active dm-marketplace-step-action-row">
                          <span>Install provider</span>
                          <button type="button" className="dm-btn-primary-sm" disabled={installing || !canConnectProvider} onClick={connectProvider}>
                            {activeAction === "connect" ? "Opening..." : `Set up ${selectedMarketplaceProvider?.label || "provider"}`}
                          </button>
                        </div>
                        {providerSetupNeedsCredentials ? <div className="dm-marketplace-step-action-row">
                          <span>Account setup</span>
                          <button type="button" className="dm-btn-primary-sm" disabled={installing || !canSaveProviderCredentials || !providerSetupReady} onClick={saveProviderCredentials}>
                            {activeAction === "save-provider" ? "Verifying..." : "Verify and save account"}
                          </button>
                        </div> : <div>Account setup</div>}
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
                              <strong>{row.Name || product.label}</strong>
                              <p>{row.selectedResourceLabel || row.status || "draft"} / {row.syncCheckedAt || row.lastTested || "not synced"}</p>
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
                              <strong>{product.label}</strong>
                              <p>{product.subtitle}</p>
                              <small>{product.plans}</small>
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
            <footer className="dm-marketplace-actions">
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
              <p className="dm-marketplace-section-title"><Server size={14} /> Configuration and Plan</p>
              {regionOptions.length ? (
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
              <label className="dm-marketplace-toggle">
                <input type="checkbox" disabled />
                <span>Prod Pack (+$200 per month)</span>
              </label>
              <p className="dm-cockpit-step-hint">Recommended for production. Configure paid plan changes in the provider account.</p>
              {providerConnected ? (
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
              {providerConnected ? (
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
              {providerConnected && resourceMessage ? <p className="dm-cockpit-step-hint">{resourceMessage}</p> : null}
              {providerConnected && createResourceDividerLabel ? (
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
              ) : (
                <button type="button" className="dm-btn-outline dm-marketplace-create-new-btn" onClick={() => setInstallMode("new")}>
                  Configure new resource
                </button>
              )}
              <div className={activeReadiness?.configured ? "dm-marketplace-env is-ready" : "dm-marketplace-env is-setup"}>
                <span>{activeSavedRow?.isVerifiedAddOn ? "Product installed" : providerConnected ? "Ready to install product" : "Provider setup required"}</span>
                <code>{installMode === "existing" && selectedResourceId ? (resourceOptions.find((item) => item.id === selectedResourceId)?.label || selectedResourceId) : regionOptions.length ? `${selectedRegion.label} / ${plan}` : `${activeProduct.shortLabel || activeProduct.label} / ${plan}`}</code>
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
                  ? "Install calls the product sync route, validates the product credentials server-side, and writes the product API Registry row into workspace config."
                    : "Set up the provider account first. Return here after provider setup, then Sync provider to unlock product install."}
              </div>
            </div>
            <div className="dm-marketplace-provision-steps">
              <div className={`${providerConnected ? "is-complete" : "is-active"} dm-marketplace-step-action-row`}>
                <span>Provider account</span>
                {!providerConnected ? (
                  <button type="button" className="dm-btn-primary-sm" disabled={installing || !canConnectProvider} onClick={connectProvider}>
                    {activeAction === "connect" ? "Opening..." : "Set up provider account"}
                  </button>
                ) : null}
              </div>
              <div className={productInstalled ? "is-complete" : providerConnected ? "is-active" : ""}>Product install</div>
            </div>
            <footer className="dm-marketplace-actions">
              {activeSavedRow?.isVerifiedAddOn && activeProduct.consoleUrl ? <a className="dm-btn-outline dm-marketplace-console-link" href={activeProduct.consoleUrl} target="_blank" rel="noreferrer">
                Open provider <ExternalLink size={13} />
              </a> : null}
              <button type="button" className="dm-btn-outline" onClick={() => setInstallDrawer("")}>Cancel</button>
              <button type="button" className="dm-btn-primary-sm" disabled={installing || !providerConnected || !canSyncProduct} onClick={syncProduct}>
                {activeAction === "sync-product" ? "Installing..." : activeSavedRow ? "Resync product" : "Install product"}
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
