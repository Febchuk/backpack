import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Db = Database.Database;

const schema = readFileSync(fileURLToPath(new URL("./schema.sql", import.meta.url)), "utf8");

/** Opens (or creates) the SQLite file and applies the schema. Pass ":memory:" in tests. */
export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(schema);
  return db;
}
