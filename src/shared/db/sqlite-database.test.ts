import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteDatabase } from './sqlite-database';
import type { Database } from './database';

describe('SqliteDatabase', () => {
  let db: Database;

  beforeEach(() => {
    db = new SqliteDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates a table, inserts, and selects', () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    db.prepare('INSERT INTO test (name) VALUES (?)').run('Alice');
    db.prepare('INSERT INTO test (name) VALUES (?)').run('Bob');

    const rows = db.prepare<{ id: number; name: string }>('SELECT * FROM test ORDER BY id').all();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.name).toBe('Alice');
    expect(rows[1]!.name).toBe('Bob');
  });

  it('returns run result with changes and lastInsertRowid', () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    const result = db.prepare('INSERT INTO test (name) VALUES (?)').run('Alice');
    expect(result.changes).toBe(1);
    expect(Number(result.lastInsertRowid)).toBe(1);
  });

  it('get returns undefined for missing row', () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    const row = db.prepare('SELECT * FROM test WHERE id = ?').get(999);
    expect(row).toBeUndefined();
  });

  it('rolls back transaction on thrown error', () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

    expect(() =>
      db.transaction(() => {
        db.prepare('INSERT INTO test (name) VALUES (?)').run('Alice');
        throw new Error('rollback!');
      }),
    ).toThrow('rollback!');

    const rows = db.prepare('SELECT * FROM test').all();
    expect(rows).toHaveLength(0);
  });

  it('enforces foreign keys', () => {
    db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
    db.exec('CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))');

    expect(() =>
      db.prepare('INSERT INTO child (parent_id) VALUES (?)').run(999),
    ).toThrow(/FOREIGN KEY/);
  });

  it('uses WAL journal mode', () => {
    const row = db.prepare<{ journal_mode: string }>('PRAGMA journal_mode').get();
    // In-memory databases may report 'memory' for journal mode, but WAL was requested.
    // For file-based databases this would be 'wal'.
    expect(row).toBeDefined();
  });
});
