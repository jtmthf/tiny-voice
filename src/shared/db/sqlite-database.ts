import BetterSqlite3 from 'better-sqlite3';
import type { Result } from 'neverthrow';
import type { Database, Statement, RunResult } from './database';

function isErrResult(value: unknown): value is Result<unknown, unknown> & { isErr(): true } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isErr' in value &&
    typeof (value as { isErr: unknown }).isErr === 'function' &&
    (value as { isErr(): boolean }).isErr()
  );
}

class RollbackSignal<T> extends Error {
  constructor(readonly result: T) {
    super('rollback');
  }
}

/**
 * Real adapter: wraps better-sqlite3 behind the Database port.
 */
export class SqliteDatabase implements Database {
  private readonly db: BetterSqlite3.Database;

  constructor(filename: string) {
    this.db = new BetterSqlite3(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
  }

  prepare<TRow = unknown>(sql: string): Statement<TRow> {
    const stmt = this.db.prepare(sql);
    return {
      run(...params: unknown[]): RunResult {
        const result = stmt.run(...params);
        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      },
      get(...params: unknown[]): TRow | undefined {
        return stmt.get(...params) as TRow | undefined;
      },
      all(...params: unknown[]): TRow[] {
        return stmt.all(...params) as TRow[];
      },
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    try {
      return this.db.transaction(() => {
        const result = fn();
        if (isErrResult(result)) throw new RollbackSignal(result);
        return result;
      })();
    } catch (e) {
      if (e instanceof RollbackSignal) return e.result as T;
      throw e;
    }
  }

  close(): void {
    this.db.close();
  }
}
