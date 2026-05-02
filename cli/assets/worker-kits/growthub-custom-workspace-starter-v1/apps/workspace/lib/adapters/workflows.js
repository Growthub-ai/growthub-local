import { readAdapterConfig } from "@/lib/adapters/env";

const STATIC_WORKFLOWS = [
  {
    id: "creative-brief-v1",
    label: "Creative brief",
    description: "Validate a brand brief and emit a structured creative request.",
    inputs: [
      { name: "brand", type: "text", required: true },
      { name: "objective", type: "text", required: true }
    ]
  },
  {
    id: "weekly-recap-v1",
    label: "Weekly recap",
    description: "Pull last 7 days of metrics and produce a summary artifact.",
    inputs: [{ name: "client", type: "text", required: true }]
  }
];

async function listWorkflows() {
  const config = readAdapterConfig();
  if (config.integrationAdapter !== "growthub-bridge" || !process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN || !config.growthubBridge.baseUrl) {
    return { source: "static-sample", mode: "static", workflows: STATIC_WORKFLOWS };
  }
  try {
    const url = new URL("/api/mcp/workflows", config.growthubBridge.baseUrl);
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN}`
      },
      next: { revalidate: 30 }
    });
    if (!response.ok) {
      return { source: "static-sample", mode: "static", workflows: STATIC_WORKFLOWS };
    }
    const payload = await response.json();
    return {
      source: "growthub-bridge",
      mode: "hosted",
      workflows: Array.isArray(payload?.workflows) ? payload.workflows : STATIC_WORKFLOWS
    };
  } catch {
    return { source: "static-sample", mode: "static", workflows: STATIC_WORKFLOWS };
  }
}

async function runWorkflow(workflowId) {
  const config = readAdapterConfig();
  if (config.integrationAdapter !== "growthub-bridge" || !process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN || !config.growthubBridge.baseUrl) {
    return {
      executionMode: "dry-run",
      workflowId,
      message: "Static mode: validated workflow shape only. Hosted execution not configured."
    };
  }
  return {
    executionMode: "hosted-delegated",
    workflowId,
    message: "Hosted execution remains in the Growthub Bridge. Use `growthub pipeline execute` for a real run."
  };
}

export { listWorkflows, runWorkflow };
