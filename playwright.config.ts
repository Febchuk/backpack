import { defineConfig } from "@playwright/test";
import { API, GAME, TEST_API_PORT, TEST_GAME_PORT } from "./tests/helpers/ports";

export default defineConfig({
  testDir: "tests",
  testMatch: /level\d+\/.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: GAME,
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    permissions: ["microphone"],
  },
  webServer: [
    {
      command: "pnpm --filter @backpack/server start",
      url: `${API}/health`,
      reuseExistingServer: false,
      env: { MOCK_GEMINI: "1", MOCK_DIAL: "1", DB_PATH: ":memory:", PORT: String(TEST_API_PORT) },
    },
    {
      command: `pnpm --filter @backpack/game exec vite --port ${TEST_GAME_PORT} --strictPort`,
      url: GAME,
      env: { VITE_API_URL: API },
      reuseExistingServer: false,
    },
  ],
});
