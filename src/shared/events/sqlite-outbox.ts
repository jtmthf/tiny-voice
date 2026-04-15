import type { Database } from '../db/database';
import type { Outbox } from './outbox';

interface OutboxRow {
  id: number;
  event_name: string;
  payload: string;
}

export class SqliteOutbox<TEventMap extends object = object> implements Outbox<TEventMap> {
  constructor(private readonly db: Database) {}

  enqueue<K extends keyof TEventMap & string>(eventName: K, payload: TEventMap[K]): void {
    this.db
      .prepare('INSERT INTO outbox (event_name, payload) VALUES (?, ?)')
      .run(eventName, JSON.stringify(payload));
  }

  async drain(handler: (eventName: keyof TEventMap & string, payload: TEventMap[keyof TEventMap]) => Promise<void>): Promise<void> {
    const rows = this.db
      .prepare<OutboxRow>('SELECT id, event_name, payload FROM outbox ORDER BY id')
      .all();

    for (const row of rows) {
      await handler(row.event_name as keyof TEventMap & string, JSON.parse(row.payload) as TEventMap[keyof TEventMap]);
      this.db.prepare('DELETE FROM outbox WHERE id = ?').run(row.id);
    }
  }
}
