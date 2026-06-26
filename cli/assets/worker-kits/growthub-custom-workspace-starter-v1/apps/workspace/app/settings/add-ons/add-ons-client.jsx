"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceAddOnsMarketplace } from "../../components/WorkspaceAddOnsMarketplace.jsx";

function AddOnsSettingsClient({ initialWorkspaceConfig, envSignals }) {
  const router = useRouter();
  const [workspaceConfig, setWorkspaceConfig] = useState(initialWorkspaceConfig || {});
  const [installing, setInstalling] = useState(false);
  const normalizedEnvSignals = {
    configuredEnvRefs: envSignals?.configuredEnvRefs || [],
    persistenceAdapters: envSignals?.persistenceAdapters || [],
    providerProductReadiness: envSignals?.providerProductReadiness || {},
  };

  async function connectProvider(setup = {}) {
    const providerId = setup.providerId;
    if (!providerId) return;
    setInstalling(true);
    try {
      const response = await fetch(`/api/workspace/add-ons/providers/${encodeURIComponent(providerId)}/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(setup),
      });
      const payload = await response.json();
      if (!response.ok || !payload.connectUrl) {
        return;
      }
      window.open(payload.connectUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.warn(error);
    } finally {
      setInstalling(false);
    }
  }

  async function syncProvider(setup = {}) {
    const providerId = setup.providerId;
    if (!providerId) return;
    setInstalling(true);
    try {
      const response = await fetch(`/api/workspace/add-ons/providers/${encodeURIComponent(providerId)}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(setup),
      });
      const payload = await response.json();
      if (!response.ok) {
        return;
      }
      setWorkspaceConfig(payload.workspaceConfig || workspaceConfig);
    } catch (error) {
      console.warn(error);
    } finally {
      setInstalling(false);
    }
  }

  async function syncProduct({ providerId, productId, region, plan }) {
    if (!providerId || !productId) return;
    setInstalling(true);
    try {
      const response = await fetch(`/api/workspace/add-ons/providers/${encodeURIComponent(providerId)}/products/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, region, plan }),
      });
      const payload = await response.json();
      if (!response.ok) {
        return;
      }
      setWorkspaceConfig(payload.workspaceConfig || workspaceConfig);
    } catch (error) {
      console.warn(error);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <>
      <WorkspaceAddOnsMarketplace
        shell="page"
        workspaceConfig={workspaceConfig}
        envSignals={normalizedEnvSignals}
        installing={installing}
        onConnectProvider={connectProvider}
        onSyncProvider={syncProvider}
        onSyncProduct={syncProduct}
        onCustomSetup={() => router.push("/settings/apis-webhooks")}
      />
    </>
  );
}

export {
  AddOnsSettingsClient
};
