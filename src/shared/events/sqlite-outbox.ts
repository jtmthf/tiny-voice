import type { Database } from '../db/database';
import type { Outbox } from './outbox';

interface OutboxRow {
  id: number;
  event_name: string;
  payload: string;
}

export class SqliteOutbox implements Outbox {
  constructor(private readonly db: Database) {}

  enqueue(eventName: string, payload: unknown): void {
    this.db
      .prepare('INSERT INTO outbox (event_name, payload) VALUES (?, ?)')
      .run(eventName, JSON.stringify(payload));
  }

  async drain(handler: (eventName: string, payload: unknown) => Promise<void>): Promise<void> {
    const rows = this.db
      .prepare<OutboxRow>('SELECT id, event_name, payload FROM outbox ORDER BY id')
      .all();

    for (const row of rows) {
      await handler(row.event_name, JSON.parse(row.payload));
      this.db.prepare('DELETE FROM outbox WHERE id = ?').run(row.id);
    }
  }
}
