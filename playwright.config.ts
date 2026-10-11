import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: /level\d+\/.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5173",
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    permissions: ["microphone"],
  },
  webServer: [
    {
      command: "pnpm --filter @backpack/server start",
      url: "http://localhost:8787/health",
      reuseExistingServer: false,
      env: { MOCK_GEMINI: "1", MOCK_DIAL: "1", DB_PATH: ":memory:", PORT: "8787" },
    },
    {
      command: "pnpm --filter @backpack/game dev",
      url: "http://localhost:5173",
      reuseExistingServer: false,
    },
  ],
});
