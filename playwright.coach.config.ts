import { defineConfig } from "@playwright/test";

/** Coach console e2e: the coach (all adapters mocked, in-memory PGlite) and the console, on their own test ports. */
const COACH_PORT = Number(process.env.COACH_E2E_PORT ?? 18788);
const CONSOLE_PORT = Number(process.env.CONSOLE_E2E_PORT ?? 15174);
const COACH = `http://localhost:${COACH_PORT}`;
const CONSOLE = `http://localhost:${CONSOLE_PORT}`;

export default defineConfig({
  testDir: "tests/coach",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: CONSOLE },
  webServer: [
    {
      command: "pnpm --filter @backpack/coach start",
      url: `${COACH}/health`,
      reuseExistingServer: false,
      env: {
        COACH_PORT: String(COACH_PORT),
        MOCK_GEMINI: "1",
        MOCK_DIAL: "1",
        MOCK_ELEVENLABS: "1",
        DATABASE_URL: "",
        PGLITE_DIR: "",
        ADMIN_TOKEN: "",
        DIAL_WEBHOOK_SECRET: "",
        PUBLIC_URL: COACH,
        NODE_ENV: "test",
      },
    },
    {
      command: `pnpm --filter @backpack/console exec vite --port ${CONSOLE_PORT} --strictPort`,
      url: CONSOLE,
      reuseExistingServer: false,
      env: { VITE_COACH_URL: COACH, VITE_ADMIN_TOKEN: "" },
    },
  ],
});
