import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupDb } from './db-fixture';
import type { Database } from '../db/database';

describe('setupDb', () => {
  let db: Database;
  let teardown: () => void;
  let tempDir: string | undefined;

  afterEach(() => {
    teardown?.();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('applies a throwaway migration and verifies the table exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'tv-migrations-'));
    writeFileSync(
      join(tempDir, '0001_test.sql'),
      'CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT NOT NULL);',
    );

    ({ db, teardown } = setupDb({ migrationsDir: tempDir }));

    const rows = db
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'",
      )
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('test_table');
  });

  it('records the migration in the _migrations table', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'tv-migrations-'));
    writeFileSync(
      join(tempDir, '0001_test.sql'),
      'CREATE TABLE another (id INTEGER PRIMARY KEY);',
    );

    ({ db, teardown } = setupDb({ migrationsDir: tempDir }));

    const row = db
      .prepare<{ filename: string }>('SELECT filename FROM _migrations WHERE filename = ?')
      .get('0001_test.sql');
    expect(row?.filename).toBe('0001_test.sql');
  });

  it('works with an empty migrations directory', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'tv-migrations-'));

    ({ db, teardown } = setupDb({ migrationsDir: tempDir }));

    // Should still have _migrations table
    const rows = db
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'",
      )
      .all();
    expect(rows).toHaveLength(1);
  });

  it('works with the default project migrations directory (currently empty)', () => {
    ({ db, teardown } = setupDb());

    // _migrations table should exist even with no migration files
    const rows = db
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'",
      )
      .all();
    expect(rows).toHaveLength(1);
  });
});
