import { defineConfig } from "vitest/config";

// Isolated vitest config for the Worker Kits fork sync surface.
//
// The main CLI vitest run pulls in tests that depend on private monorepo
// packages (e.g. @paperclipai/shared, adapter registries) which are not
// present in the published repo slice. This config narrows test discovery to
// the fork sync surface so the new feature can be exercised end-to-end inside
// the slice without reshaping the main test run.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/kit-sync.test.ts"],
  },
});
