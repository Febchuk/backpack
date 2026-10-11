import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

// .env lives at the repo root; the server runs with cwd apps/server.
loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
import { DEFAULT_PORT } from "@backpack/shared";

export interface Config {
  port: number;
  mockGemini: boolean;
  mockDial: boolean;
  geminiApiKey: string | undefined;
  dialApiKey: string | undefined;
  dialFromNumberId: string | undefined;
  dialWebhookSecret: string | undefined;
  dialCallLanguage: string;
  publicUrl: string | undefined;
  dbPath: string;
  isProduction: boolean;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = process.env;
  return {
    port: Number(env.PORT ?? DEFAULT_PORT),
    mockGemini: env.MOCK_GEMINI !== "0",
    mockDial: env.MOCK_DIAL !== "0",
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    dialApiKey: env.DIAL_API_KEY || undefined,
    dialFromNumberId: env.DIAL_FROM_NUMBER_ID || undefined,
    dialWebhookSecret: env.DIAL_WEBHOOK_SECRET || undefined,
    dialCallLanguage: env.DIAL_CALL_LANGUAGE || "fr-FR",
    publicUrl: env.PUBLIC_URL || undefined,
    dbPath: env.DB_PATH ?? "./backpack.db",
    isProduction: env.NODE_ENV === "production",
    ...overrides,
  };
}
