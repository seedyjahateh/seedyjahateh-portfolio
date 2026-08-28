import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    environment: "node",
    // Fixture generation at 10,000 records runs inside a test; the default
    // 5s timeout is too tight on a cold CI runner.
    testTimeout: 60_000,
    reporters: ["default"],
  },
});
