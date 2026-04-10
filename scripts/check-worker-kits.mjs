import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const kitsRoot = path.join(root, "cli", "assets", "worker-kits");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(relativePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertExists(relativePath, label) {
  const fullPath = relativePath;
  assert(fs.existsSync(fullPath), `${label} missing required path: ${relativePath}`);
}

function listRelativeFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      files.push(path.relative(rootDir, fullPath).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

const kitDirs = fs.readdirSync(kitsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(kitsRoot, entry.name))
  .sort();

const summaries = [];

for (const kitRoot of kitDirs) {
  const manifest = readJson(path.join(kitRoot, "kit.json"));
  assert(manifest.schemaVersion === 2, `Expected kit schemaVersion 2, got ${manifest.schemaVersion}`);
  assert(manifest.kit?.type === "worker", `Unexpected kit type for ${kitRoot}: ${manifest.kit?.type}`);
  assert(manifest.executionMode === "export", `Unexpected executionMode for ${kitRoot}: ${manifest.executionMode}`);
  assert(
    Array.isArray(manifest.activationModes) && manifest.activationModes.includes("export"),
    `Kit activationModes must include export for ${manifest.kit?.id}`,
  );

  assertExists(path.join(kitRoot, manifest.entrypoint.path), "Kit entrypoint");
  assertExists(path.join(kitRoot, manifest.agentContractPath), "Agent contract");
  assertExists(path.join(kitRoot, manifest.brandTemplatePath), "Brand template");

  for (const bundleRef of manifest.bundles ?? []) {
    assertExists(path.join(kitRoot, bundleRef.path), "Bundle manifest");
  }
  for (const assetPath of manifest.frozenAssetPaths ?? []) {
    assertExists(path.join(kitRoot, assetPath), "Frozen asset");
  }
  for (const requiredPath of manifest.outputStandard?.requiredPaths ?? []) {
    assertExists(path.join(kitRoot, requiredPath), "Output standard");
  }

  const bundleRef = manifest.bundles?.[0];
  const bundle = readJson(path.join(kitRoot, bundleRef.path));
  assert(bundle.schemaVersion === 2, `Expected bundle schemaVersion 2, got ${bundle.schemaVersion}`);
  assert(bundle.bundle?.kitId === manifest.kit.id, "Bundle kitId must match manifest kit id");
  assert(bundle.bundle?.workerId === manifest.entrypoint.workerId, "Bundle workerId must match entrypoint workerId");
  assert(
    Array.isArray(bundle.activationModes) && bundle.activationModes.includes("export"),
    `Bundle activationModes must include export for ${manifest.kit.id}`,
  );

  const kitPublicBrands = new Set(manifest.publicExampleBrandPaths ?? []);
  const bundlePublicBrands = new Set(bundle.publicExampleBrandPaths ?? []);
  for (const brandPath of kitPublicBrands) {
    assert(bundlePublicBrands.has(brandPath), `Bundle missing declared public brand: ${brandPath}`);
  }

  for (const requiredFrozenAsset of bundle.requiredFrozenAssets ?? []) {
    assertExists(path.join(kitRoot, requiredFrozenAsset), "Bundle frozen asset");
  }

  const bundledFiles = listRelativeFiles(kitRoot);
  const brandKitFiles = bundledFiles.filter(
    (filePath) => filePath.startsWith("brands/") && filePath.endsWith("/brand-kit.md"),
  );
  const allowedBrandPaths = new Set([
    manifest.brandTemplatePath,
    ...(manifest.publicExampleBrandPaths ?? []),
  ]);
  const disallowedBrandFiles = brandKitFiles.filter((filePath) => !allowedBrandPaths.has(filePath));
  assert(
    disallowedBrandFiles.length === 0,
    `Bundled kit ${manifest.kit.id} includes non-public brand kits: ${disallowedBrandFiles.join(", ")}`,
  );

  summaries.push(`kit=${manifest.kit.id}@${manifest.kit.version}`);
}

console.log(["worker-kit-check passed", ...summaries].join("\n"));
