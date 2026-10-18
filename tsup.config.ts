import { defineConfig } from "tsup";

// src/cli.ts starts with a hashbang, which esbuild keeps at the top of dist/cli.js.
export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  dts: { entry: "src/index.ts" },
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["@mutexa/ladder", "@mutexa/liq-math", "@mutexa/venue-adapters"],
});
