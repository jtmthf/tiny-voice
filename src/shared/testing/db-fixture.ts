import { resolve } from 'node:path';
import { SqliteDatabase } from '../db/sqlite-database';
import { runMigrations } from '../db/run-migrations';
import type { Database } from '../db/database';
import type { Logger } from '../logger/logger';

const SILENT_LOGGER: Logger = {
  info() { /* noop */ },
  warn() { /* noop */ },
  error() { /* noop */ },
  debug() { /* noop */ },
};

const DEFAULT_MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../migrations');

/**
 * Creates a fresh :memory: SQLite database with all project migrations applied.
 * Use in Vitest beforeEach/afterEach for DB-backed tests.
 */
export function setupDb(options?: {
  migrationsDir?: string;
  logger?: Logger;
}): { db: Database; teardown: () => void } {
  const db = new SqliteDatabase(':memory:');
  const migrationsDir = options?.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  const logger = options?.logger ?? SILENT_LOGGER;

  runMigrations(db, migrationsDir, logger);

  return {
    db,
    teardown: () => db.close(),
  };
}
