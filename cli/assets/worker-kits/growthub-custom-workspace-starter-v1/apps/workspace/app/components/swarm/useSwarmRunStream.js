"use client";

/**
 * Cockpit data layer — EXISTING routes only, zero background traffic.
 *
 *   GET  /api/workspace               — one fetch when the drawer opens
 *                                       (config + source records → runs)
 *   POST /api/workspace/sandbox-run   — the existing governed runner;
 *                                       the in-flight POST is the live
 *                                       "running" signal, no polling
 *
 * Nothing fires while the cockpit is docked. Refresh is explicit (drawer
 * open, after a launch resolves, or the Refresh control).
 */

import { useCallback, useState } from "react";
import { projectSwarmRuns, projectSwarmWorkflows } from "@/lib/swarm-cockpit-projection.js";

function useSwarmWorkspace() {
  const [runs, setRuns] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [launches, setLaunches] = useState([]); // optimistic in-flight runs
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await response.json();
      const workspaceConfig = payload?.workspaceConfig || payload?.config || payload || {};
      const workspaceSourceRecords = payload?.workspaceSourceRecords || {};
      setRuns(projectSwarmRuns({ workspaceConfig, workspaceSourceRecords }));
      setWorkflows(projectSwarmWorkflows(workspaceConfig));
      setError("");
    } catch (err) {
      setError(err?.message || "failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  const launch = useCallback(async (workflow) => {
    const launchId = `launch-${Date.now().toString(36)}`;
    const optimistic = {
      runId: launchId,
      name: workflow.name,
      runKind: "workflow",
      description: workflow.description || "",
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationMs: null,
      totals: { agents: 0, tokens: 0, toolUses: 0 },
      error: "",
      phases: [],
      workflowRef: workflow.workflowRef
    };
    setLaunches((current) => [optimistic, ...current]);
    try {
      const response = await fetch("/api/workspace/sandbox-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objectId: workflow.workflowRef.objectId,
          name: workflow.workflowRef.rowId
        })
      });
      const payload = await response.json();
      if (!payload?.ok && payload?.error) setError(payload.error);
    } catch (err) {
      setError(err?.message || "launch failed");
    } finally {
      setLaunches((current) => current.filter((entry) => entry.runId !== launchId));
      await refresh();
    }
  }, [refresh]);

  return { runs, workflows, launches, error, loading, refresh, launch };
}

export { useSwarmWorkspace };
