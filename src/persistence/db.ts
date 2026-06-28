import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "path";
import * as migration001 from "./migrations/001_init.js";

/**
 * Database — single connection point for the persistence layer.
 *
 * better-sqlite3 is synchronous by design: no async overhead, no
 * connection pool to manage, and it matches the rest of this codebase's
 * style (mutate-in-place, return immediately). WAL mode is enabled so
 * the workflow engine's frequent small writes (one per step transition)
 * don't serialize behind long reads from the dashboard server.
 */

interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  { version: migration001.version, up: migration001.up },
];

let instance: Database.Database | null = null;

function resolveDbPath(): string {
  // Override with DEV_ASSISTANT_DB_PATH for tests / multiple instances.
  if (process.env.DEV_ASSISTANT_DB_PATH) return process.env.DEV_ASSISTANT_DB_PATH;
  return path.join(process.cwd(), "data", "dev-assistant.db");
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = db
    .prepare(`SELECT value FROM schema_meta WHERE key = 'version'`)
    .get() as { value: string } | undefined;

  const currentVersion = row ? Number(row.value) : 0;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version
  );

  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare(
        `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(String(migration.version));
    });
    apply();
    console.error(`[db] applied migration ${migration.version}`);
  }
}

/** Get (or lazily open) the shared database connection. */
export function getDb(): Database.Database {
  if (instance) return instance;

  const dbPath = resolveDbPath();
  fs.ensureDirSync(path.dirname(dbPath));

  instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");

  runMigrations(instance);

  return instance;
}

/** Close the connection. Used by tests and graceful shutdown. */
export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
