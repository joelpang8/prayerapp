import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    // All suites share one emulator and clear it between tests.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
