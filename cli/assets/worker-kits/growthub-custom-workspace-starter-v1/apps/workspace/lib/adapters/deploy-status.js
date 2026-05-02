import { promises as fs } from "node:fs";
import path from "node:path";
import { readAdapterConfig } from "@/lib/adapters/env";

async function readForkArtifact(filename) {
  try {
    const filePath = path.resolve(process.cwd(), "..", "..", ".growthub-fork", filename);
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listForkDirectory(directory) {
  try {
    const dirPath = path.resolve(process.cwd(), "..", "..", ".growthub-fork", directory);
    const entries = await fs.readdir(dirPath);
    return entries.filter((entry) => entry.endsWith(".json"));
  } catch {
    return [];
  }
}

async function describeDeployStatus() {
  const adapter = readAdapterConfig();
  const fork = await readForkArtifact("fork.json");
  const agents = await listForkDirectory("agents");
  const capabilities = await listForkDirectory("capabilities");
  const proposals = await listForkDirectory("self-improving-proposals");

  const checks = [
    {
      id: "bridge-token",
      label: "Growthub Bridge token",
      ok: Boolean(process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN),
      detail: process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN
        ? "GROWTHUB_BRIDGE_ACCESS_TOKEN present"
        : "GROWTHUB_BRIDGE_ACCESS_TOKEN missing",
      guidance: process.env.GROWTHUB_BRIDGE_ACCESS_TOKEN
        ? null
        : "Run `growthub auth login` and export GROWTHUB_BRIDGE_ACCESS_TOKEN"
    },
    {
      id: "bridge-base-url",
      label: "Growthub Bridge URL",
      ok: Boolean(process.env.GROWTHUB_BRIDGE_BASE_URL),
      detail: process.env.GROWTHUB_BRIDGE_BASE_URL || "GROWTHUB_BRIDGE_BASE_URL missing",
      guidance: process.env.GROWTHUB_BRIDGE_BASE_URL
        ? null
        : "Set GROWTHUB_BRIDGE_BASE_URL=https://www.growthub.ai"
    },
    {
      id: "integration-adapter",
      label: "Integration adapter",
      ok: Boolean(adapter.integrationAdapter),
      detail: `mode: ${adapter.integrationAdapter}`
    },
    {
      id: "fork-registration",
      label: "Fork registration",
      ok: Boolean(fork),
      detail: fork ? `fork id: ${fork.id || fork.forkId || "unknown"}` : ".growthub-fork/fork.json missing",
      guidance: fork ? null : "Run `growthub kit fork register` from your fork root"
    },
    {
      id: "agents-bound",
      label: "Hosted agent bindings",
      ok: agents.length > 0,
      detail: `${agents.length} bound`,
      guidance: agents.length > 0 ? null : "Run `growthub bridge agents bind <slug>`"
    },
    {
      id: "capabilities",
      label: "Capabilities",
      ok: capabilities.length > 0,
      detail: `${capabilities.length} capability records`
    },
    {
      id: "self-improving",
      label: "Self-improving proposals",
      ok: true,
      detail: `${proposals.length} proposals`
    }
  ];

  const missing = checks.filter((check) => !check.ok);
  const nextCommand = missing[0]?.guidance || null;

  return { checks, missing: missing.map((check) => check.id), nextCommand };
}

export { describeDeployStatus };
