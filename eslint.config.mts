import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Never lint build output, coverage reports, generated d.ts, or ship-assets.
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "**/*.d.ts",
      "templates/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    // The engine runs under Node (CLI) and its output targets the browser; both
    // global sets are legitimate.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  tseslint.configs.recommended,
  {
    // `any` is used deliberately for the renderer's mutable walk context and for
    // AST-node casts in tests; keep it visible as a warning, not a hard error.
    // A leading underscore marks an intentionally-unused binding.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);
