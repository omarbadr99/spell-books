// Builds the board for Vercel with the Build Output API: the page as static files,
// and the API as one bundled Node.js function per route. Vercel runs this through
// vercel.json, then serves .vercel/output as it is.
//
//   npm run build:vercel

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { build } from "vite";

const OUT = ".vercel/output";
const ROUTES = ["me", "enter", "ask"];

rmSync(OUT, { recursive: true, force: true });

// The page, without the Cloudflare plugin.
await build({
  configFile: false,
  logLevel: "warn",
  build: { outDir: `${OUT}/static`, emptyOutDir: true, chunkSizeWarningLimit: 700 },
});

// The API, bundled with its dependencies into a single file.
const first = `${OUT}/functions/api/${ROUTES[0]}.func`;
await build({
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "vercel/handler.ts",
    outDir: first,
    emptyOutDir: true,
    target: "node22",
    rolldownOptions: { output: { entryFileNames: "index.mjs", format: "es" } },
  },
});
writeFileSync(
  `${first}/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false }, null, 2),
);
for (const route of ROUTES.slice(1)) cpSync(first, `${OUT}/functions/api/${route}.func`, { recursive: true });

mkdirSync(OUT, { recursive: true });
writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/assets/(.*)", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { handle: "filesystem" },
      ],
    },
    null,
    2,
  ),
);
console.log(`Wrote ${OUT}: the page plus /api/${ROUTES.join(", /api/")}`);
