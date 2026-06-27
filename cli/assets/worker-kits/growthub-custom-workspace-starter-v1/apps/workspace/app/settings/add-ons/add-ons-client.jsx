"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceAddOnsMarketplace } from "../../components/WorkspaceAddOnsMarketplace.jsx";

function AddOnsSettingsClient({ initialWorkspaceConfig, envSignals }) {
  const router = useRouter();
  const [workspaceConfig, setWorkspaceConfig] = useState(initialWorkspaceConfig || {});
  const [activeAction, setActiveAction] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingProviderId, setPendingProviderId] = useState("");
  const [setupMessage, setSetupMessage] = useState("");
  const [providerSetupWindow, setProviderSetupWindow] = useState(null);
  const normalizedEnvSignals = {
    configuredEnvRefs: envSignals?.configuredEnvRefs || [],
    persistenceAdapters: envSignals?.persistenceAdapters || [],
    providerProductReadiness: envSignals?.providerProductReadiness || {},
  };

  async function connectProvider(setup = {}) {
    const providerId = setup.providerId;
    if (!providerId) return;
    if (!setup.openedExternally) setActiveAction("connect");
    setErrorMessage("");
    setPendingProviderId(providerId);
    setSetupMessage("Provider account setup is open. Return here after the account page is ready; the workspace will sync automatically.");
    try {
      const response = await fetch(`/api/workspace/add-ons/providers/${encodeURIComponent(providerId)}/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(setup),
      });
      const payload = await response.json();
      if (!response.ok) {
        setErrorMessage(payload?.error || "Provider setup state could not be recorded.");
        return;
      }
      if (payload.workspaceConfig) {
        setWorkspaceConfig(payload.workspaceConfig);
      }
      if (payload.accountState === "setup-opened") {
        setPendingProviderId(providerId);
        setSetupMessage("Provider account setup is open. Return here after the account page is ready; the workspace will sync automatically.");
      } else {
        setPendingProviderId("");
        setSetupMessage("");
      }
      if (!setup.openedExternally && payload.connectUrl) {
        const setupWindow = window.open(payload.connectUrl, `${providerId}-provider-setup`, "popup,width=1160,height=820");
        setProviderSetupWindow(setupWindow || null);
      }
    } catch (error) {
      console.warn(error);
      setErrorMessage(error?.message || "Provider setup failed.");
    } finally {
      if (!setup.openedExternally) setActiveAction("");
    }
  }

  async function syncProvider(setup = {}, options = {}) {
    const providerId = setup.providerId;
    if (!providerId) return;
    setActiveAction("sync-provider");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/workspace/add-ons/providers/${encodeURIComponent(providerId)}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(setup),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (!options.silent) {
          setErrorMessage(payload?.error || payload?.sync?.summary || "Provider sync failed.");
        }
        return;
      }
      setWorkspaceConfig(payload.workspaceConfig || workspaceConfig);
      setPendingProviderId("");
      setSetupMessage("");
      setProviderSetupWindow(null);
    } catch (error) {
      console.warn(error);
      if (!options.silent) {
        setErrorMessage(error?.message || "Provider sync failed.");
      }
    } finally {
      setActiveAction("");
    }
  }

  async function saveProviderCredentials(setup = {}) {
    const providerId = setup.providerId;
    if (!providerId) return;
    setActiveAction("save-provider");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/workspace/add-ons/providers/${encodeURIComponent(providerId)}/credentials`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credentials: setup.credentials || {} }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setErrorMessage(payload?.error || "Provider account could not be verified.");
        return;
      }
      setWorkspaceConfig(payload.workspaceConfig || workspaceConfig);
      setPendingProviderId("");
      setSetupMessage("");
      setProviderSetupWindow(null);
    } catch (error) {
      console.warn(error);
      setErrorMessage(error?.message || "Provider account setup failed.");
    } finally {
      setActiveAction("");
    }
  }

  async function syncProduct({ providerId, productId, region, plan, selectedResourceId, selectedResourceLabel, selectedResourceSource }) {
    if (!providerId || !productId) return;
    setActiveAction("sync-product");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/workspace/add-ons/providers/${encodeURIComponent(providerId)}/products/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, region, plan, selectedResourceId, selectedResourceLabel, selectedResourceSource }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const missing = Array.isArray(payload?.missingEnv) && payload.missingEnv.length
          ? ` Missing env: ${payload.missingEnv.join(", ")}.`
          : "";
        setErrorMessage(`${payload?.error || payload?.sync?.summary || "Product sync failed."}${missing}`);
        return;
      }
      setWorkspaceConfig(payload.workspaceConfig || workspaceConfig);
    } catch (error) {
      console.warn(error);
      setErrorMessage(error?.message || "Product sync failed.");
    } finally {
      setActiveAction("");
    }
  }

  useEffect(() => {
    if (!pendingProviderId) return undefined;
    let didSync = false;
    const trySync = () => {
      if (didSync || document.visibilityState === "hidden") return;
      didSync = true;
      syncProvider({ providerId: pendingProviderId });
    };
    const onFocus = () => trySync();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") trySync();
    };
    const pollWindow = window.setInterval(() => {
      if (providerSetupWindow?.closed) {
        window.clearInterval(pollWindow);
        trySync();
      }
    }, 1000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(pollWindow);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pendingProviderId, providerSetupWindow]);

  return (
    <>
      <WorkspaceAddOnsMarketplace
        shell="page"
        workspaceConfig={workspaceConfig}
        envSignals={normalizedEnvSignals}
        installing={Boolean(activeAction)}
        activeAction={activeAction}
        errorMessage={errorMessage}
        setupMessage={setupMessage}
        onConnectProvider={connectProvider}
        onSyncProvider={syncProvider}
        onSaveProviderCredentials={saveProviderCredentials}
        onSyncProduct={syncProduct}
        onCustomSetup={() => router.push("/settings/apis-webhooks")}
      />
    </>
  );
}

export {
  AddOnsSettingsClient
};
