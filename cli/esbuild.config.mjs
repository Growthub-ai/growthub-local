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

// Workspace packages that should NOT be bundled — they'll be published
// to npm and resolved at runtime (e.g. @paperclipai/server uses dynamic import).
const externalWorkspacePackages = new Set([
  "@paperclipai/server",
]);

// Collect all external (non-workspace) npm package names
const externals = new Set();
for (const p of workspacePaths) {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, p, "package.json"), "utf8"));
  for (const name of Object.keys(pkg.dependencies || {})) {
    if (externalWorkspacePackages.has(name)) {
      externals.add(name);
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
  banner: { js: "#!/usr/bin/env node" },
  external: [...externals].sort(),
  alias: workspaceAliases,
  treeShaking: true,
  sourcemap: false,
};
