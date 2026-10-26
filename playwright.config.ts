import { defineConfig } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // The e2e environment uses canned spirits and the board word OWL (see .dev.vars.e2e).
    command: `vite --port ${PORT} --strictPort`,
    env: { CLOUDFLARE_ENV: "e2e" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
