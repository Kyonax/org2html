import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      // The engine core (R-01). CLI glue is exercised by cli.test.ts + the smoke
      // gate, not the threshold; type-only + entry files carry no logic.
      include: [
        "src/parser/**",
        "src/renderer/**",
        "src/plugins/**",
        "src/assets/**",
        // The comment domain is engine logic with ~66 assertions behind it, so it belongs
        // under the R-01 floor rather than sitting beside it as untracked glue.
        "src/comments/**",
      ],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
