"use client";

import { useMemo, useState } from "react";
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

function AddOnsSurface({
  onConnectProvider,
  onSyncProvider,
  onSyncProduct,
  onCustomSetup,
  installing = false,
  envSignals = {},
  workspaceConfig = {},
  onClose,
  shell = "page",
}) {
  const [activePath, setActivePath] = useState("plugins");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [installDrawer, setInstallDrawer] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [plan, setPlan] = useState("free");
  const persistenceAdapters = Array.isArray(envSignals.persistenceAdapters) ? envSignals.persistenceAdapters : [];
  const installed = useMemo(() => findInstalledWorkspaceAddOns(workspaceConfig), [workspaceConfig]);
  const selectedMarketplaceProvider = MARKETPLACE_PROVIDERS.find((provider) => provider.providerId === selectedProvider) || null;
  const productReadiness = selectedMarketplaceProvider && envSignals.providerProductReadiness?.[selectedMarketplaceProvider.providerId]
    ? envSignals.providerProductReadiness[selectedMarketplaceProvider.providerId]
    : [];
  const providerRows = useMemo(() => Object.fromEntries(MARKETPLACE_PROVIDERS.map((provider) => [provider.providerId, findMarketplaceProviderRow(workspaceConfig, provider.providerId)])), [workspaceConfig]);
  const providerRow = selectedMarketplaceProvider ? providerRows[selectedMarketplaceProvider.providerId] : null;
  const providerConnected = Boolean(providerRow?.isVerifiedProvider);
  const allAddOnRows = useMemo(() => findWorkspaceAddOnRows(workspaceConfig), [workspaceConfig]);
  const installedIds = new Set(installed.map((row) => String(row.productId || "").trim()));
  const providerProducts = selectedMarketplaceProvider?.products || [];
  const activeProduct = selectedMarketplaceProvider ? getMarketplaceProduct(selectedMarketplaceProvider.providerId, installDrawer) : null;
  const activeReadiness = productReadiness.find((item) => item.productId === activeProduct?.productId) || null;
  const activeSavedRow = allAddOnRows.find((row) => row.productId === activeProduct?.productId) || null;
  const regionOptions = activeProduct?.regionOptions || [];
  const selectedRegion = regionOptions.find((option) => option.id === region) || regionOptions[0] || { id: region, label: region };
  const readyAdapters = persistenceAdapters.filter((adapter) => adapter.configured);
  const customProviderReady = readyAdapters.length > 0;
  const currentSectionLabel = activePath === "custom" ? "Custom" : "Plugins";
  const selectedProviderLabel = selectedProvider === "custom" ? "Custom Plugin" : (selectedMarketplaceProvider?.label || "Provider");
  const canSyncProduct = Boolean(onSyncProduct);
  const canConnectProvider = Boolean(onConnectProvider);
  const canSyncProvider = Boolean(onSyncProvider);
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
    onSyncProduct?.({ providerId: selectedMarketplaceProvider.providerId, productId: activeProduct.productId, region, plan });
  }

  function syncProvider() {
    if (!selectedMarketplaceProvider) return;
    onSyncProvider?.({ providerId: selectedMarketplaceProvider.providerId });
  }

  function connectProvider() {
    if (!selectedMarketplaceProvider) return;
    onConnectProvider?.({ providerId: selectedMarketplaceProvider.providerId });
  }

  function openProvider(providerId) {
    setSelectedProvider(providerId);
    setInstallDrawer("");
  }

  function closeProvider() {
    setSelectedProvider("");
    setInstallDrawer("");
  }

  function switchPath(path) {
    setActivePath(path);
    setSelectedProvider("");
    setInstallDrawer("");
  }

  function ProductIcon({ product, provider = false }) {
    const src = provider ? selectedMarketplaceProvider?.iconSrc : product?.iconSrc;
    return (
      <span className={`dm-marketplace-product-icon ${provider ? "is-provider" : (product?.iconClass || "is-provider")}`}>
        {src ? <img src={src} alt="" aria-hidden="true" /> : <PlugZap size={18} />}
      </span>
    );
  }

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
          {selectedMarketplaceProvider.consoleUrl ? <a className="dm-btn-primary-sm" href={selectedMarketplaceProvider.consoleUrl} target="_blank" rel="noreferrer">Open provider <ExternalLink size={13} /></a> : null}
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
                    {MARKETPLACE_PROVIDERS.map((provider) => {
                      const row = providerRows[provider.providerId];
                      const connected = Boolean(row?.isVerifiedProvider);
                      const installedCount = installed.filter((installedRow) => provider.products.some((product) => product.productId === installedRow.productId)).length;
                      return (
                        <button type="button" className="dm-marketplace-provider-card" key={provider.providerId} onClick={() => openProvider(provider.providerId)}>
                          <span className="dm-marketplace-product-icon is-provider">
                            {provider.iconSrc ? <img src={provider.iconSrc} alt="" aria-hidden="true" /> : <PlugZap size={18} />}
                          </span>
                          <div>
                            <strong>{provider.label}</strong>
                            <p>{provider.providerProductsLabel || provider.description}</p>
                            <small>{connected ? `${installedCount} installed product${installedCount === 1 ? "" : "s"}` : "Provider setup required"}</small>
                          </div>
                          <span className="dm-btn-outline">{connected ? "Open" : "Install"}</span>
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
                        <p className="dm-cockpit-step-hint">Log in connects the provider account for this workspace. Sync Provider stores the verified provider account reference and unlocks product setup. Cluster, region, and plan choices happen on each product install.</p>
                      </div>
                      <div className="dm-marketplace-provision-steps">
                        <div className="is-active">Install provider</div>
                        <div>Account setup</div>
                        <div>Environment refs</div>
                        <div>Product marketplace</div>
                      </div>
                      <footer className="dm-marketplace-actions">
                        {selectedMarketplaceProvider?.consoleUrl ? <a className="dm-btn-outline dm-marketplace-console-link" href={selectedMarketplaceProvider.consoleUrl} target="_blank" rel="noreferrer">
                          Open provider <ExternalLink size={13} />
                        </a> : null}
                        <button type="button" className="dm-btn-primary-sm" disabled={installing || !canConnectProvider} onClick={connectProvider}>
                          {installing ? "Opening..." : `Log in with ${selectedMarketplaceProvider?.label || "provider"}`}
                        </button>
                        <button type="button" className="dm-btn-outline" disabled={installing || !canSyncProvider} onClick={syncProvider}>
                          {installing ? "Syncing..." : "Sync Provider"}
                        </button>
                      </footer>
                    </section>
                  ) : null}

                  {providerConnected && installed.length ? (
                    <section className="dm-marketplace-products" aria-label="Installed Products">
                      <h3>Installed Products</h3>
                      <div className="dm-marketplace-product-grid">
                        {installed.map((row) => {
                          const product = getMarketplaceProduct(selectedMarketplaceProvider.providerId, row.productId) || getMarketplaceProduct(selectedMarketplaceProvider.providerId, row.integrationId);
                          if (!product) return null;
                          return (
                          <article className="dm-marketplace-product-card" key={row.integrationId}>
                            <ProductIcon product={product} />
                            <div>
                              <strong>{row.Name || product.label}</strong>
                              <p>{row.status || "draft"} / {row.syncCheckedAt || row.lastTested || "not synced"}</p>
                            </div>
                            <div className="dm-marketplace-card-actions">
                              <button type="button" className="dm-workflow-icon-btn dm-marketplace-gear" aria-label={`Settings for ${product.label}`} onClick={() => setInstallDrawer(product.productId)}>
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
                              <small>{readiness?.configured ? "Ready to sync" : "Configure account"}</small>
                            </div>
                            <button type="button" className="dm-btn-outline" onClick={() => setInstallDrawer(product.productId)}>
                              {isInstalled ? "Resync" : "Install"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </section> : null}

                  <section className="dm-marketplace-overview" aria-label="Overview">
                    <h3>Overview</h3>
                    <p>{providerConnected ? "Install provider products into workflow, data, and retrieval surfaces through the shared API Registry." : "Install the provider account first. Product installation stays locked until the account and managed environment references are verified."}</p>
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
              <div className="dm-marketplace-plan-list" aria-label="Installation plans">
                {[
                  ["free", "Free", "Perfect for prototypes and hobby projects."],
                  ["payg", "Pay As You Go", "For use cases with bursting traffic."],
                  ["fixed-1m", "Fixed", "For businesses with consistent high-capacity loads."],
                ].map(([id, label, desc]) => (
                  <button key={id} type="button" className={plan === id ? "dm-marketplace-plan is-selected" : "dm-marketplace-plan"} onClick={() => setPlan(id)}>
                    <span><b>{label}</b> {desc}</span>
                    {plan === id ? <CheckCircle2 size={15} /> : <span className="dm-marketplace-radio" />}
                  </button>
                ))}
              </div>
              <div className={activeReadiness?.configured ? "dm-marketplace-env is-ready" : "dm-marketplace-env is-setup"}>
                <span>{activeReadiness?.configured ? "Provider connection ready" : "Provider setup required"}</span>
                <code>{regionOptions.length ? `${selectedRegion.label} / ${plan}` : `${activeProduct.shortLabel || activeProduct.label} / ${plan}`}</code>
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
                Log in from the provider setup, then Sync to write the verified API Registry row.
              </div>
            </div>
            <div className="dm-marketplace-provision-steps">
              <div className="is-active">Install</div>
              <div>Setup</div>
              <div>Login / Auth</div>
              <div>Sync</div>
            </div>
            <footer className="dm-marketplace-actions">
              {activeProduct.consoleUrl ? <a className="dm-btn-outline dm-marketplace-console-link" href={activeProduct.consoleUrl} target="_blank" rel="noreferrer">
                Open provider <ExternalLink size={13} />
              </a> : null}
              <button type="button" className="dm-btn-outline" onClick={() => setInstallDrawer("")}>Cancel</button>
              {activeReadiness?.configured ? (
                <button type="button" className="dm-btn-primary-sm" disabled={installing || !canSyncProduct} onClick={syncProduct}>
                  {installing ? "Syncing..." : activeSavedRow ? "Resync" : "Sync"}
                </button>
              ) : null}
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
