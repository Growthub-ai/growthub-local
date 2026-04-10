import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const kitRoot = path.join(root, "cli", "assets", "worker-kits", "creative-strategist-v1");
const allowedPublicBrandPaths = new Set([
  "brands/_template/brand-kit.md",
  "brands/solawave/brand-kit.md",
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(kitRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertExists(relativePath, label) {
  const fullPath = path.join(kitRoot, relativePath);
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

const manifest = readJson("kit.json");
assert(manifest.schemaVersion === 2, `Expected kit schemaVersion 2, got ${manifest.schemaVersion}`);
assert(manifest.kit?.id === "creative-strategist-v1", `Unexpected kit id: ${manifest.kit?.id}`);
assert(manifest.kit?.type === "worker", `Unexpected kit type: ${manifest.kit?.type}`);
assert(manifest.executionMode === "export", `Unexpected executionMode: ${manifest.executionMode}`);
assert(
  Array.isArray(manifest.activationModes) && manifest.activationModes.includes("export"),
  "Kit activationModes must include export",
);

assertExists(manifest.entrypoint.path, "Kit entrypoint");
assertExists(manifest.agentContractPath, "Agent contract");
assertExists(manifest.brandTemplatePath, "Brand template");

for (const bundleRef of manifest.bundles ?? []) {
  assertExists(bundleRef.path, "Bundle manifest");
}
for (const assetPath of manifest.frozenAssetPaths ?? []) {
  assertExists(assetPath, "Frozen asset");
}
for (const requiredPath of manifest.outputStandard?.requiredPaths ?? []) {
  assertExists(requiredPath, "Output standard");
}

const bundle = readJson("bundles/creative-strategist-v1.json");
assert(bundle.schemaVersion === 2, `Expected bundle schemaVersion 2, got ${bundle.schemaVersion}`);
assert(bundle.bundle?.kitId === manifest.kit.id, "Bundle kitId must match manifest kit id");
assert(bundle.bundle?.workerId === manifest.entrypoint.workerId, "Bundle workerId must match entrypoint workerId");
assert(
  Array.isArray(bundle.activationModes) && bundle.activationModes.includes("export"),
  "Bundle activationModes must include export",
);

const kitPublicBrands = new Set(manifest.publicExampleBrandPaths ?? []);
const bundlePublicBrands = new Set(bundle.publicExampleBrandPaths ?? []);
for (const brandPath of kitPublicBrands) {
  assert(bundlePublicBrands.has(brandPath), `Bundle missing declared public brand: ${brandPath}`);
}

for (const requiredFrozenAsset of bundle.requiredFrozenAssets ?? []) {
  assertExists(requiredFrozenAsset, "Bundle frozen asset");
}

const bundledFiles = listRelativeFiles(kitRoot);
const brandKitFiles = bundledFiles.filter(
  (filePath) => filePath.startsWith("brands/") && filePath.endsWith("/brand-kit.md"),
);
const disallowedBrandFiles = brandKitFiles.filter((filePath) => !allowedPublicBrandPaths.has(filePath));
assert(
  disallowedBrandFiles.length === 0,
  `Bundled kit includes non-public brand kits: ${disallowedBrandFiles.join(", ")}`,
);

console.log(
  [
    "worker-kit-check passed",
    `kit=${manifest.kit.id}@${manifest.kit.version}`,
    `bundle=${bundle.bundle.id}@${bundle.bundle.version}`,
  ].join("\n"),
);
