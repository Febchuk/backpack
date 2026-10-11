import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

// .env lives at the repo root; the coach runs with cwd apps/coach.
loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

export interface Config {
  port: number;
  mockGemini: boolean;
  mockDial: boolean;
  mockElevenLabs: boolean;
  geminiApiKey: string | undefined;
  geminiModel: string;
  dialApiKey: string | undefined;
  dialWebhookSecret: string | undefined;
  dialSelfHostedSecret: string | undefined;
  elevenLabsApiKey: string | undefined;
  /** Public https base the server is reachable on. Voice-note URLs handed to Dial are built from it. */
  publicUrl: string;
  /** Postgres connection string. Unset → in-process PGlite (in-memory, or `pgliteDir` on disk). */
  databaseUrl: string | undefined;
  pgliteDir: string | undefined;
  /** Bearer token for /api/*. Unset outside production → the API is open (local dev, tests). */
  adminToken: string | undefined;
  isProduction: boolean;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = process.env;
  const port = Number(env.COACH_PORT ?? 8788);
  return {
    port,
    mockGemini: env.MOCK_GEMINI !== "0",
    mockDial: env.MOCK_DIAL !== "0",
    mockElevenLabs: env.MOCK_ELEVENLABS !== "0",
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.COACH_GEMINI_MODEL || "gemini-2.5-flash",
    dialApiKey: env.DIAL_API_KEY || undefined,
    dialWebhookSecret: env.DIAL_WEBHOOK_SECRET || undefined,
    dialSelfHostedSecret: env.DIAL_SELF_HOSTED_SECRET || undefined,
    elevenLabsApiKey: env.ELEVENLABS_API_KEY || undefined,
    publicUrl: (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ""),
    databaseUrl: env.DATABASE_URL || undefined,
    pgliteDir: env.PGLITE_DIR || undefined,
    adminToken: env.ADMIN_TOKEN || undefined,
    isProduction: env.NODE_ENV === "production",
    ...overrides,
  };
}
