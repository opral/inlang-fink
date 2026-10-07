import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests/browser", timeout: 120_000, workers: 1, use: { baseURL: "http://127.0.0.1:8787", headless: true }, webServer: { command: "pnpm exec wrangler dev --port 8787 --ip 127.0.0.1", url: "http://127.0.0.1:8787", reuseExistingServer: !process.env.CI, timeout: 60_000 } });
