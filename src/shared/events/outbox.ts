/**
 * Transactional outbox port.
 *
 * Events are enqueued synchronously inside a database transaction
 * alongside the aggregate save. After the transaction commits,
 * `drain()` processes pending events through the real event bus.
 *
 * If the process crashes between commit and drain, events remain
 * in the outbox table and can be recovered manually or on next startup.
 */
export interface Outbox {
  /** Synchronous — call inside a db.transaction() block. */
  enqueue(eventName: string, payload: unknown): void;

  /** Async — reads pending events, processes them via the handler, then deletes them. */
  drain(handler: (eventName: string, payload: unknown) => Promise<void>): Promise<void>;
}
