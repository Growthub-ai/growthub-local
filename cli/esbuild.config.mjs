/**
 * esbuild configuration for building the paperclipai CLI for npm.
 *
 * Bundles all workspace packages (@paperclipai/*) into a single file.
 * External npm packages remain as regular dependencies.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Workspace packages whose code should be bundled into the CLI.
// Note: "server" is excluded — it's published separately and resolved at runtime.
const workspacePaths = [
  "cli",
  "packages/db",
  "packages/shared",
  "packages/adapter-utils",
  "packages/adapters/claude-local",
  "packages/adapters/codex-local",
  "packages/adapters/cursor-local",
  "packages/adapters/gemini-local",
  "packages/adapters/opencode-local",
  "packages/adapters/pi-local",
  "packages/adapters/openclaw-gateway",
];

const workspaceAliases = {
  "@paperclipai/db": resolve(repoRoot, "packages/db/src/index.ts"),
  "@paperclipai/shared": resolve(repoRoot, "packages/shared/src/index.ts"),
  "@paperclipai/adapter-utils": resolve(repoRoot, "packages/adapter-utils/src/index.ts"),
  "@paperclipai/adapter-utils/server-utils": resolve(repoRoot, "packages/adapter-utils/src/server-utils.ts"),
  "@paperclipai/adapter-claude-local": resolve(repoRoot, "packages/adapters/claude-local/src/index.ts"),
  "@paperclipai/adapter-claude-local/server": resolve(repoRoot, "packages/adapters/claude-local/src/server/index.ts"),
  "@paperclipai/adapter-claude-local/ui": resolve(repoRoot, "packages/adapters/claude-local/src/ui/index.ts"),
  "@paperclipai/adapter-claude-local/cli": resolve(repoRoot, "packages/adapters/claude-local/src/cli/index.ts"),
  "@paperclipai/adapter-codex-local": resolve(repoRoot, "packages/adapters/codex-local/src/index.ts"),
  "@paperclipai/adapter-codex-local/server": resolve(repoRoot, "packages/adapters/codex-local/src/server/index.ts"),
  "@paperclipai/adapter-codex-local/ui": resolve(repoRoot, "packages/adapters/codex-local/src/ui/index.ts"),
  "@paperclipai/adapter-codex-local/cli": resolve(repoRoot, "packages/adapters/codex-local/src/cli/index.ts"),
  "@paperclipai/adapter-cursor-local": resolve(repoRoot, "packages/adapters/cursor-local/src/index.ts"),
  "@paperclipai/adapter-cursor-local/server": resolve(repoRoot, "packages/adapters/cursor-local/src/server/index.ts"),
  "@paperclipai/adapter-cursor-local/ui": resolve(repoRoot, "packages/adapters/cursor-local/src/ui/index.ts"),
  "@paperclipai/adapter-cursor-local/cli": resolve(repoRoot, "packages/adapters/cursor-local/src/cli/index.ts"),
  "@paperclipai/adapter-gemini-local": resolve(repoRoot, "packages/adapters/gemini-local/src/index.ts"),
  "@paperclipai/adapter-gemini-local/server": resolve(repoRoot, "packages/adapters/gemini-local/src/server/index.ts"),
  "@paperclipai/adapter-gemini-local/ui": resolve(repoRoot, "packages/adapters/gemini-local/src/ui/index.ts"),
  "@paperclipai/adapter-gemini-local/cli": resolve(repoRoot, "packages/adapters/gemini-local/src/cli/index.ts"),
  "@paperclipai/adapter-opencode-local": resolve(repoRoot, "packages/adapters/opencode-local/src/index.ts"),
  "@paperclipai/adapter-opencode-local/server": resolve(repoRoot, "packages/adapters/opencode-local/src/server/index.ts"),
  "@paperclipai/adapter-opencode-local/ui": resolve(repoRoot, "packages/adapters/opencode-local/src/ui/index.ts"),
  "@paperclipai/adapter-opencode-local/cli": resolve(repoRoot, "packages/adapters/opencode-local/src/cli/index.ts"),
  "@paperclipai/adapter-pi-local": resolve(repoRoot, "packages/adapters/pi-local/src/index.ts"),
  "@paperclipai/adapter-pi-local/server": resolve(repoRoot, "packages/adapters/pi-local/src/server/index.ts"),
  "@paperclipai/adapter-pi-local/ui": resolve(repoRoot, "packages/adapters/pi-local/src/ui/index.ts"),
  "@paperclipai/adapter-pi-local/cli": resolve(repoRoot, "packages/adapters/pi-local/src/cli/index.ts"),
  "@paperclipai/adapter-openclaw-gateway": resolve(repoRoot, "packages/adapters/openclaw-gateway/src/index.ts"),
  "@paperclipai/adapter-openclaw-gateway/server": resolve(repoRoot, "packages/adapters/openclaw-gateway/src/server/index.ts"),
  "@paperclipai/adapter-openclaw-gateway/ui": resolve(repoRoot, "packages/adapters/openclaw-gateway/src/ui/index.ts"),
  "@paperclipai/adapter-openclaw-gateway/cli": resolve(repoRoot, "packages/adapters/openclaw-gateway/src/cli/index.ts"),
};

// @growthub/api-contract is bundled directly from the workspace source so
// the shipped CLI dist is self-contained for the v1 contract surfaces
// (capabilities, execution, manifests, pipeline-kits, workspaces, adapters,
// pipeline-trace, health). The npm-published api-contract still serves
// downstream SDK consumers; the CLI just stops needing it at runtime.
const apiContractRoot = resolve(repoRoot, "packages/api-contract/src");
const apiContractAliases = {
  "@growthub/api-contract": resolve(apiContractRoot, "index.ts"),
  "@growthub/api-contract/capabilities": resolve(apiContractRoot, "capabilities.ts"),
  "@growthub/api-contract/execution": resolve(apiContractRoot, "execution.ts"),
  "@growthub/api-contract/providers": resolve(apiContractRoot, "providers.ts"),
  "@growthub/api-contract/profile": resolve(apiContractRoot, "profile.ts"),
  "@growthub/api-contract/events": resolve(apiContractRoot, "events.ts"),
  "@growthub/api-contract/manifests": resolve(apiContractRoot, "manifests.ts"),
  "@growthub/api-contract/schemas": resolve(apiContractRoot, "schemas.ts"),
  "@growthub/api-contract/skills": resolve(apiContractRoot, "skills.ts"),
  "@growthub/api-contract/worker-kits": resolve(apiContractRoot, "worker-kits.ts"),
  "@growthub/api-contract/pipeline-kits": resolve(apiContractRoot, "pipeline-kits.ts"),
  "@growthub/api-contract/workspaces": resolve(apiContractRoot, "workspaces.ts"),
  "@growthub/api-contract/adapters": resolve(apiContractRoot, "adapters.ts"),
  "@growthub/api-contract/pipeline-trace": resolve(apiContractRoot, "pipeline-trace.ts"),
  "@growthub/api-contract/health": resolve(apiContractRoot, "health.ts"),
};

// Workspace packages that should NOT be bundled — they'll be published
// to npm and resolved at runtime (e.g. @paperclipai/server uses dynamic import).
const externalWorkspacePackages = new Set([
  "@paperclipai/server",
]);

// Workspace packages that ARE bundled directly via aliases — keep these
// out of the externals list even though they appear in package.json
// dependencies.
const bundledWorkspacePackages = new Set([
  "@growthub/api-contract",
]);

// Collect all external (non-workspace) npm package names
const externals = new Set();
for (const p of workspacePaths) {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, p, "package.json"), "utf8"));
  for (const name of Object.keys(pkg.dependencies || {})) {
    if (externalWorkspacePackages.has(name)) {
      externals.add(name);
    } else if (bundledWorkspacePackages.has(name)) {
      // skip — bundled via alias
    } else if (!name.startsWith("@paperclipai/")) {
      externals.add(name);
    }
  }
  for (const name of Object.keys(pkg.optionalDependencies || {})) {
    externals.add(name);
  }
}
// Also add all published workspace packages as external
for (const name of externalWorkspacePackages) {
  externals.add(name);
}

/** @type {import('esbuild').BuildOptions} */
export default {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/index.js",
  banner: {},
  external: [...externals].sort(),
  alias: { ...workspaceAliases, ...apiContractAliases },
  treeShaking: true,
  sourcemap: false,
};
