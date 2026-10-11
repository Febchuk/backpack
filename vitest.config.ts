import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/level*/**/*.test.ts", "tests/coach/**/*.test.ts"],
    env: { MOCK_GEMINI: "1", MOCK_DIAL: "1", MOCK_ELEVENLABS: "1", NODE_ENV: "test" },
    testTimeout: 15_000,
  },
});
