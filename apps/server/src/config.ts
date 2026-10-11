import "dotenv/config";
import { DEFAULT_PORT } from "@backpack/shared";

export interface Config {
  port: number;
  mockGemini: boolean;
  mockDial: boolean;
  geminiApiKey: string | undefined;
  dialApiKey: string | undefined;
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
    publicUrl: env.PUBLIC_URL || undefined,
    dbPath: env.DB_PATH ?? "./backpack.db",
    isProduction: env.NODE_ENV === "production",
    ...overrides,
  };
}
