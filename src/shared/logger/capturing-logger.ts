import type { Logger } from './logger';

export interface LogEntry {
  readonly level: 'info' | 'warn' | 'error' | 'debug';
  readonly message: string;
  readonly meta?: Record<string, unknown> | undefined;
}

/**
 * Test adapter: buffers log calls for assertions.
 */
export class CapturingLogger implements Logger {
  readonly entries: LogEntry[] = [];

  info(message: string, meta?: Record<string, unknown>): void {
    this.entries.push({ level: 'info', message, meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.entries.push({ level: 'warn', message, meta });
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.entries.push({ level: 'error', message, meta });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.entries.push({ level: 'debug', message, meta });
  }

  clear(): void {
    this.entries.length = 0;
  }
}
