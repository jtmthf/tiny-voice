import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database } from '@/shared/db/database';
import { setupDb } from '@/shared/testing/db-fixture';
import { SqliteOutbox } from './sqlite-outbox';

interface TestEventMap {
  Foo: { value: number };
  Bar: { value: number };
  Baz: { value: number };
}

interface OutboxRow {
  event_name: string;
}

describe('SqliteOutbox', () => {
  let db: Database;
  let teardown: () => void;
  let outbox: SqliteOutbox<TestEventMap>;

  beforeEach(() => {
    const fixture = setupDb();
    db = fixture.db;
    teardown = fixture.teardown;
    outbox = new SqliteOutbox<TestEventMap>(db);
  });

  afterEach(() => {
    teardown();
  });

  it('enqueues a row and drains it via the handler, deleting on success', async () => {
    outbox.enqueue('Foo', { value: 42 });

    const rowsBeforeDrain = db
      .prepare<OutboxRow>('SELECT event_name FROM outbox ORDER BY id')
      .all();
    expect(rowsBeforeDrain).toHaveLength(1);

    const received: { name: string; value: number }[] = [];
    // eslint-disable-next-line @typescript-eslint/require-await -- Outbox.drain's handler param is typed Promise<void>
    await outbox.drain(async (eventName, payload) => {
      received.push({ name: eventName, value: (payload as { value: number }).value });
    });

    expect(received).toEqual([{ name: 'Foo', value: 42 }]);
    const rowsAfterDrain = db.prepare<OutboxRow>('SELECT event_name FROM outbox ORDER BY id').all();
    expect(rowsAfterDrain).toHaveLength(0);
  });

  it('drains events in FIFO (id) order', async () => {
    outbox.enqueue('Foo', { value: 1 });
    outbox.enqueue('Bar', { value: 2 });
    outbox.enqueue('Baz', { value: 3 });

    const received: string[] = [];
    // eslint-disable-next-line @typescript-eslint/require-await -- Outbox.drain's handler param is typed Promise<void>
    await outbox.drain(async (eventName) => {
      received.push(eventName);
    });

    expect(received).toEqual(['Foo', 'Bar', 'Baz']);
  });

  it('rolls back the enqueue when the enclosing transaction throws', () => {
    expect(() => {
      db.transaction(() => {
        outbox.enqueue('Foo', { value: 1 });
        throw new Error('boom');
      });
    }).toThrow('boom');

    const rows = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(rows).toHaveLength(0);
  });

  it('retains the row when the handler throws, and delivers it on a later drain', async () => {
    outbox.enqueue('Foo', { value: 1 });

    await outbox
      // eslint-disable-next-line @typescript-eslint/require-await -- Outbox.drain's handler param is typed Promise<void>
      .drain(async () => {
        throw new Error('boom');
      })
      .catch(() => {
        /* deliberately not asserting reject/resolve here — see plan 004 */
      });

    const rowsAfterFailedDrain = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(rowsAfterFailedDrain).toHaveLength(1);

    const received: string[] = [];
    // eslint-disable-next-line @typescript-eslint/require-await -- Outbox.drain's handler param is typed Promise<void>
    await outbox.drain(async (eventName) => {
      received.push(eventName);
    });

    expect(received).toEqual(['Foo']);
    const rowsAfterSuccessfulDrain = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(rowsAfterSuccessfulDrain).toHaveLength(0);
  });

  it('isolates a failing row: other rows still deliver, the failing row is retained, onError fires, drain resolves', async () => {
    outbox.enqueue('Foo', { value: 1 });
    outbox.enqueue('Bar', { value: 2 });
    outbox.enqueue('Baz', { value: 3 });

    const received: string[] = [];
    const errors: { eventName: string; error: unknown }[] = [];

    await outbox.drain(
      // eslint-disable-next-line @typescript-eslint/require-await -- Outbox.drain's handler param is typed Promise<void>
      async (eventName) => {
        if (eventName === 'Bar') throw new Error('boom');
        received.push(eventName);
      },
      (eventName, error) => {
        errors.push({ eventName, error });
      },
    );

    expect(received).toEqual(['Foo', 'Baz']);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.eventName).toBe('Bar');

    const remaining = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(remaining).toEqual([{ event_name: 'Bar' }]);
  });
});
