import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

/** The slice of Postgres both `pg` and PGlite provide. Vectors go in as `'[1,2,3]'::vector` literals (see `toVector`). */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}

const migrationsDir = fileURLToPath(new URL("./migrations/", import.meta.url));

async function migrate(exec: (sql: string) => Promise<unknown>) {
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await exec(readFileSync(migrationsDir + file, "utf8"));
  }
}

/** Real Postgres when `databaseUrl` is set (needs the pgvector extension); otherwise in-process PGlite. */
export async function openDb(opts: { databaseUrl?: string; pgliteDir?: string } = {}): Promise<Db> {
  if (opts.databaseUrl) {
    const pool = new pg.Pool({ connectionString: opts.databaseUrl });
    await migrate((sql) => pool.query(sql));
    return {
      query: async (sql, params) => ({ rows: (await pool.query(sql, params as unknown[])).rows }),
      close: () => pool.end(),
    };
  }
  const lite = await PGlite.create(opts.pgliteDir ?? "memory://", { extensions: { vector } });
  await migrate((sql) => lite.exec(sql));
  return {
    query: async (sql, params) => ({ rows: (await lite.query(sql, params as unknown[])).rows as never[] }),
    close: () => lite.close(),
  };
}

export const toVector = (v: number[]) => `[${v.join(",")}]`;
