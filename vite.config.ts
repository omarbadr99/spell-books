import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare()],
  // Three.js makes the page's one script about 600 KB (150 KB gzipped).
  build: { chunkSizeWarningLimit: 700 },
});
