import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/assets/worker-kits/**/*.spec.ts",
      "**/assets/worker-kits/**/*.spec.js",
    ],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
  },
});
