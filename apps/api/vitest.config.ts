import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration tests share one database and must not interleave.
    sequence: { concurrent: false },
    reporters: ["default"],
  },
  resolve: {
    alias: {
      // Source alias keeps unit tests independent of the contracts build step.
      "@marketverse/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
    },
  },
});
