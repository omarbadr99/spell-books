// Builds a one-file copy of the board to publish as a claude.ai artifact: no
// Worker and no lock (the link is already private), and spirits that answer
// through the viewer's own Claude. Writes dist-artifact/spirit-board.html.
//
//   npm run build:artifact

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "vite";

const OUT = "dist-artifact";
const FONTS =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=M+PLUS+1+Code:wght@300&display=swap";

await build({ configFile: "vite.artifact.config.ts", logLevel: "warn" });

const html = readFileSync(`${OUT}/index.html`, "utf8");
const assets = readdirSync(`${OUT}/assets`);
const read = (ext: string) =>
  assets
    .filter((f) => f.endsWith(ext))
    .map((f) => readFileSync(`${OUT}/assets/${f}`, "utf8"))
    .join("\n");

const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1].replace(/<script\b[^>]*><\/script>/g, "").trim();
if (!body) throw new Error("index.html has no body to publish");

// The artifact host wraps this in its own <html>/<head>/<body>, so the page starts with its title and styles.
const page = [
  "<title>Spirit Board</title>",
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  `<link rel="stylesheet" href="${FONTS}">`,
  `<style>\n${read(".css")}\n</style>`,
  body,
  `<script type="module">\n${read(".js").replace(/<\/script/gi, "<\\/script")}\n</script>`,
  "",
].join("\n");

writeFileSync(`${OUT}/spirit-board.html`, page);
console.log(`Wrote ${OUT}/spirit-board.html (${(page.length / 1024).toFixed(0)} KB)`);
