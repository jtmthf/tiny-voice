import type { Logger } from './logger';

/**
 * Real adapter: writes JSON lines to stdout (info/debug) and stderr (warn/error).
 */
export class ConsoleLogger implements Logger {
  info(message: string, meta?: Record<string, unknown>): void {
    process.stdout.write(JSON.stringify({ level: 'info', message, ...meta, timestamp: new Date().toISOString() }) + '\n');
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    process.stderr.write(JSON.stringify({ level: 'warn', message, ...meta, timestamp: new Date().toISOString() }) + '\n');
  }

  error(message: string, meta?: Record<string, unknown>): void {
    process.stderr.write(JSON.stringify({ level: 'error', message, ...meta, timestamp: new Date().toISOString() }) + '\n');
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    process.stdout.write(JSON.stringify({ level: 'debug', message, ...meta, timestamp: new Date().toISOString() }) + '\n');
  }
}
