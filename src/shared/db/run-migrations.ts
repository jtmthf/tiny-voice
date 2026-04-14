import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './database';
import type { Logger } from '../logger/logger';

interface MigrationRow {
  filename: string;
  checksum: string;
}

/**
 * Shared migration logic used by both the CLI runner and the test fixture.
 *
 * - Ensures the `_migrations` tracking table exists.
 * - Reads all `*.sql` files from `migrationsDir`, sorted lexically.
 * - For each file: computes SHA-256 checksum, checks the tracking table,
 *   applies if absent, or verifies checksum immutability if present.
 * - All new migrations run inside individual transactions.
 */
export function runMigrations(
  db: Database,
  migrationsDir: string,
  logger: Logger,
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    files = [];
  }

  if (files.length === 0) {
    logger.info('No migration files found — database is up to date.');
    return;
  }

  let applied = 0;

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    const existing = db
      .prepare<MigrationRow>('SELECT filename, checksum FROM _migrations WHERE filename = ?')
      .get(file);

    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(
          `Migration "${file}" has been modified after being applied. ` +
            `Expected checksum ${existing.checksum}, got ${checksum}. ` +
            `Migrations are immutable — add a new migration instead.`,
        );
      }
      continue;
    }

    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (filename, checksum, applied_at) VALUES (?, ?, ?)')
        .run(file, checksum, new Date().toISOString());
    });

    logger.info(`Applied migration: ${file}`, { checksum });
    applied++;
  }

  if (applied === 0) {
    logger.info('All migrations already applied — database is up to date.');
  } else {
    logger.info(`Applied ${applied} migration(s).`);
  }
}
