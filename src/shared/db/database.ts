/**
 * Port interface for database access.
 * Callers work against these interfaces — never import better-sqlite3 directly.
 */

export interface RunResult {
  readonly changes: number;
  readonly lastInsertRowid: number | bigint;
}

export interface Statement<TRow = unknown> {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): TRow | undefined;
  all(...params: unknown[]): TRow[];
}

export interface Database {
  prepare<TRow = unknown>(sql: string): Statement<TRow>;
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  close(): void;
}
