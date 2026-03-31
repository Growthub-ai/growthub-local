/**
 * Programmatic CLI bundle (uses cli/esbuild.config.mjs).
 * Run from repo root: node cli/scripts/build-cli.mjs
 */
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(__dirname, "..");
const { default: options } = await import(join(cliRoot, "esbuild.config.mjs"));

await build({
  ...options,
  absWorkingDir: cliRoot,
});
