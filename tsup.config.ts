import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
);

const version = JSON.stringify(pkg.version);

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    outExtension() {
      return { js: ".mjs" };
    },
    define: {
      __PACKAGE_VERSION__: version,
    },
  },
  {
    entry: {
      "cli/index": "src/cli/index.ts",
    },
    format: ["esm"],
    dts: false,
    sourcemap: true,
    splitting: false,
    shims: false,
    outExtension() {
      return { js: ".mjs" };
    },
    define: {
      __PACKAGE_VERSION__: version,
    },
  },
]);
