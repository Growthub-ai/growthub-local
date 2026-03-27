import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "..");
const serverDist = path.resolve(repoRoot, "server/dist");
const serverUiDist = path.resolve(repoRoot, "server/ui-dist");
const serverPackageJsonPath = path.resolve(repoRoot, "server/package.json");
const runtimeRoot = path.resolve(cliRoot, "dist/runtime/server");
const runtimeServerDist = path.resolve(runtimeRoot, "dist");
const runtimeServerUiDist = path.resolve(runtimeRoot, "ui-dist");
const runtimeNodeModulesRoot = path.resolve(runtimeRoot, "node_modules/@paperclipai");

const bundledWorkspacePackages = [
  "packages/db",
  "packages/shared",
  "packages/adapter-utils",
  "packages/adapters/claude-local",
  "packages/adapters/codex-local",
  "packages/adapters/cursor-local",
  "packages/adapters/gemini-local",
  "packages/adapters/openclaw-gateway",
  "packages/adapters/opencode-local",
  "packages/adapters/pi-local",
  "packages/plugins/sdk",
];

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function copyRecursive(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function copyWorkspacePackage(relativePackagePath) {
  const packageRoot = path.resolve(repoRoot, relativePackagePath);
  const packageJsonPath = path.resolve(packageRoot, "package.json");
  ensureExists(packageJsonPath, `package manifest for ${relativePackagePath}`);

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const scopedName = String(packageJson.name ?? "");
  const packageName = scopedName.replace(/^@paperclipai\//, "");
  if (!packageName || packageName === scopedName) {
    throw new Error(`Unexpected package name for ${relativePackagePath}: ${scopedName}`);
  }
  const buildResult = spawnSync(
    "pnpm",
    ["--dir", repoRoot, "--filter", scopedName, "build"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    },
  );
  if (buildResult.status !== 0) {
    throw new Error(`Failed to build ${scopedName} before bundling runtime`);
  }

  const packageDist = path.resolve(packageRoot, "dist");
  ensureExists(packageDist, `built dist for ${relativePackagePath}`);

  const destinationRoot = path.resolve(runtimeNodeModulesRoot, packageName);
  fs.rmSync(destinationRoot, { recursive: true, force: true });
  fs.mkdirSync(destinationRoot, { recursive: true });
  const vendoredManifest = buildVendoredManifest(packageJson);
  fs.writeFileSync(
    path.resolve(destinationRoot, "package.json"),
    `${JSON.stringify(vendoredManifest, null, 2)}\n`,
    "utf8",
  );
  fs.cpSync(packageDist, path.resolve(destinationRoot, "dist"), { recursive: true });
}

function buildVendoredManifest(packageJson) {
  const manifest = { ...packageJson };
  const publishConfig = packageJson.publishConfig ?? {};

  delete manifest.publishConfig;
  delete manifest.scripts;
  delete manifest.devDependencies;

  manifest.files = ["dist"];
  manifest.main = publishConfig.main ?? "./dist/index.js";
  manifest.types = publishConfig.types ?? "./dist/index.d.ts";

  if (publishConfig.exports) {
    manifest.exports = publishConfig.exports;
  } else {
    manifest.exports = {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./*": {
        types: "./dist/*.d.ts",
        import: "./dist/*.js",
      },
    };
  }

  return manifest;
}

ensureExists(serverDist, "built server dist");
ensureExists(serverUiDist, "prepared server ui-dist");
ensureExists(serverPackageJsonPath, "server package manifest");

fs.mkdirSync(runtimeRoot, { recursive: true });
copyRecursive(serverDist, runtimeServerDist);
copyRecursive(serverUiDist, runtimeServerUiDist);
const serverPackageJson = JSON.parse(fs.readFileSync(serverPackageJsonPath, "utf8"));
fs.writeFileSync(
  path.resolve(runtimeRoot, "package.json"),
  `${JSON.stringify(
    {
      name: serverPackageJson.name ?? "@paperclipai/server",
      version: serverPackageJson.version ?? "0.0.0",
      type: serverPackageJson.type ?? "module",
    },
    null,
    2,
  )}\n`,
  "utf8",
);
fs.mkdirSync(runtimeNodeModulesRoot, { recursive: true });
for (const workspacePackage of bundledWorkspacePackages) {
  copyWorkspacePackage(workspacePackage);
}

console.log(`Bundled server runtime -> ${runtimeRoot}`);
