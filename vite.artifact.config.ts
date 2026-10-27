// Builds the board as a single page for a claude.ai artifact (see
// scripts/build-artifact.ts): the artifact API replaces the Worker calls, and the
// fonts come from Google Fonts instead of being bundled.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      { find: /^\.\.\/api$/, replacement: here("./src/artifact/api.ts") },
      { find: /^@fontsource\/.+\.css$/, replacement: here("./src/artifact/empty.css") },
    ],
  },
  build: {
    outDir: "dist-artifact",
    emptyOutDir: true,
    modulePreload: false,
    chunkSizeWarningLimit: 700,
  },
});
