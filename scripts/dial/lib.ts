import "dotenv/config";
import { dialFetcher } from "../../apps/server/src/adapters/dial";

/** A Dial client from .env. The key is only ever sent in the Authorization header; never print it. */
export function dialFromEnv() {
  const key = process.env.DIAL_API_KEY;
  if (!key) {
    console.error("DIAL_API_KEY is not set. Add it to .env at the repo root.");
    process.exit(1);
  }
  return dialFetcher(key);
}

/** Dial list endpoints may return a bare array or wrap it (`{numbers: [...]}`, `{data: [...]}`, ...). */
export function listOf<T>(body: unknown, ...keys: string[]): T[] {
  if (Array.isArray(body)) return body as T[];
  const b = (body ?? {}) as Record<string, unknown>;
  for (const k of [...keys, "data", "items", "results"]) if (Array.isArray(b[k])) return b[k] as T[];
  return [];
}

/** Single objects may come back bare or wrapped (`{webhook: {...}}`). */
export function objectOf<T>(body: unknown, ...keys: string[]): T {
  const b = (body ?? {}) as Record<string, unknown>;
  for (const k of keys) if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) return b[k] as T;
  return b as T;
}

export function fail(e: unknown): never {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
