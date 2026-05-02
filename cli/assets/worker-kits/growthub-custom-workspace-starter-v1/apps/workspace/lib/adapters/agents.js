import { promises as fs } from "node:fs";
import path from "node:path";

async function listAgentBindings() {
  const dir = path.resolve(process.cwd(), "..", "..", ".growthub-fork", "agents");
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { source: "no-fork", bindings: [] };
  }
  const bindings = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, entry), "utf8");
      const parsed = JSON.parse(raw);
      bindings.push({
        slug: parsed.slug || entry.replace(/\.json$/, ""),
        label: parsed.label || parsed.name || parsed.slug,
        executionAuthority: parsed.executionAuthority || "gh-app",
        capability: parsed.capability || parsed.capabilityId || null,
        boundAt: parsed.boundAt || parsed.createdAt || null
      });
    } catch {
      // skip malformed
    }
  }
  return { source: "fork-bindings", bindings };
}

export { listAgentBindings };
