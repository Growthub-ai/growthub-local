import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: configDir,
  test: {
    environment: "node",
    include: [
      "src/__tests__/kit.test.ts",
      "src/__tests__/kit-command.test.ts",
      "src/__tests__/kit-fork-sync.test.ts",
      "src/__tests__/kit-zernio-social.test.ts",
    ],
  },
});
