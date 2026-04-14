import type { Database } from '../db/database';
import type { Outbox } from './outbox';

interface OutboxRow {
  id: number;
  event_name: string;
  payload: string;
}

/** Recursively prepare a value for JSON serialization, wrapping BigInt and Date. */
function toSerializable(value: unknown): unknown {
  if (typeof value === 'bigint') return { __bigint: value.toString() };
  if (value instanceof Date) return { __date: value.toISOString() };
  if (Array.isArray(value)) return value.map(toSerializable);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toSerializable(v);
    }
    return out;
  }
  return value;
}

/** JSON reviver that restores BigInt and Date from outbox storage. */
function reviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    if ('__bigint' in value) return BigInt((value as { __bigint: string }).__bigint);
    if ('__date' in value) return new Date((value as { __date: string }).__date);
  }
  return value;
}

export class SqliteOutbox implements Outbox {
  constructor(private readonly db: Database) {}

  enqueue(eventName: string, payload: unknown): void {
    this.db
      .prepare('INSERT INTO outbox (event_name, payload) VALUES (?, ?)')
      .run(eventName, JSON.stringify(toSerializable(payload)));
  }

  async drain(handler: (eventName: string, payload: unknown) => Promise<void>): Promise<void> {
    const rows = this.db
      .prepare<OutboxRow>('SELECT id, event_name, payload FROM outbox ORDER BY id')
      .all();

    for (const row of rows) {
      await handler(row.event_name, JSON.parse(row.payload, reviver));
      this.db.prepare('DELETE FROM outbox WHERE id = ?').run(row.id);
    }
  }
}
