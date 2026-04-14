import { resolve } from 'node:path';
import { EnvConfig } from '../src/shared/config/env-config.js';
import { ConsoleLogger } from '../src/shared/logger/console-logger.js';
import { SqliteDatabase } from '../src/shared/db/sqlite-database.js';
import { runMigrations } from '../src/shared/db/run-migrations.js';

const logger = new ConsoleLogger();

try {
  const config = new EnvConfig({
    DATABASE_PATH: process.env['DATABASE_PATH'] ?? './tiny-voice.db',
    PDF_GENERATOR: process.env['PDF_GENERATOR'] ?? 'stub',
    LATE_FEES_ENABLED: process.env['LATE_FEES_ENABLED'] ?? 'false',
    LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
    NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  });

  const dbPath = config.get('DATABASE_PATH');
  const migrationsDir = resolve(import.meta.dirname, '../migrations');

  logger.info(`Opening database: ${dbPath}`);
  const db = new SqliteDatabase(dbPath);

  try {
    runMigrations(db, migrationsDir, logger);
  } finally {
    db.close();
  }
} catch (err) {
  logger.error('Migration failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}
